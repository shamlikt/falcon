/* ============================================================================
   splat.js: a small WebGL2 Gaussian Splatting renderer for one subject.

   Written for the Falcon build. It renders a `.splat` file (32 bytes per splat:
   position f32x3, scale f32x3, rgba u8x4, rotation quaternion u8x4, importance
   sorted) onto a transparent canvas so the subject can sit between other planes
   on the page.

   What it adds over a plain viewer, and why:
     - An orbit camera driven from outside (yaw, pitch, distance, screen shift).
       The page owns the scroll; this file only draws what it is told.
     - A per-splat "assembly" value. At 1 the subject is intact. Below 1 every
       splat flies out along its own stored offset, shrinks and tints toward
       the accent, so the character can be scattered into sparks and called
       back. The offsets live in the splat texture so the CPU depth sort and
       the GPU agree on where each splat is. A "spin" value swirls the swarm;
       the page drives it from scroll so the swarm turns under the hand.
     - Render on demand. Nothing is drawn while nothing changed and nothing is
       drawn while the page says the stage is covered.

   Depth sorting runs in a Worker (16-bit counting sort). Blending is the
   front-to-back "under" operator, so the canvas ends up premultiplied with a
   real alpha channel and composites over whatever is behind it.
   ========================================================================== */
(function (global) {
  'use strict';

  var ROW = 32;              // bytes per splat in the file
  var TEX_W = 2048;          // texture width in texels
  var TEXELS = 3;            // texels per splat: (pos, rgba) (cov) (offset, seed)
  var SPR = Math.floor(TEX_W / TEXELS); // splats per texture row

  /* ------------------------------------------------------------ worker -- */
  function workerMain(self) {
    var ROW = 32, TEX_W = 2048, TEXELS = 3, SPR = Math.floor(TEX_W / TEXELS);
    var bytes = null, received = 0, total = 0, count = 0, maxCount = Infinity;
    var built = 0, center = [0, 0, 0], scatter = 3.0;
    var positions = null, offsets = null;   // Float32 x3, kept for sorting
    var lastVP = null, lastA = -1, sorting = false, pendingView = null;

    var f32 = new Float32Array(1), i32 = new Int32Array(f32.buffer);
    function halfBits(v) {
      f32[0] = v; var f = i32[0];
      var sign = (f >> 31) & 1, exp = (f >> 23) & 0xff, frac = f & 0x7fffff, ne;
      if (exp === 0) ne = 0;
      else if (exp < 113) { ne = 0; frac |= 0x800000; frac = frac >> (113 - exp); if (frac & 0x1000000) { ne = 1; frac = 0; } }
      else if (exp < 142) ne = exp - 112;
      else { ne = 31; frac = 0; }
      return (sign << 15) | (ne << 10) | (frac >> 13);
    }
    function pack2(x, y) { return (halfBits(x) | (halfBits(y) << 16)) >>> 0; }
    // Deterministic per-splat noise so the scatter is the same on every visit.
    function hash(i) {
      var x = (i + 0x9e3779b9) | 0;
      x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x ^= x >>> 16;
      return (x >>> 0) / 4294967296;
    }

    function build() {
      var n = Math.min(count, maxCount);
      if (n <= built) return;
      var rows = Math.ceil(n / SPR);
      var tex = new Uint32Array(TEX_W * rows * 4);
      var texF = new Float32Array(tex.buffer);
      var texB = new Uint8Array(tex.buffer);
      var fb = new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
      if (!positions || positions.length < n * 3) {
        var np = new Float32Array(n * 3), no = new Float32Array(n * 3);
        if (positions) { np.set(positions); no.set(offsets); }
        positions = np; offsets = no;
      }
      for (var i = 0; i < n; i++) {
        var base = (Math.floor(i / SPR) * TEX_W + (i % SPR) * TEXELS) * 4;
        var x = fb[8 * i], y = fb[8 * i + 1], z = fb[8 * i + 2];
        texF[base] = x; texF[base + 1] = y; texF[base + 2] = z;
        texB[4 * (base + 3)] = bytes[ROW * i + 24]; texB[4 * (base + 3) + 1] = bytes[ROW * i + 25];
        texB[4 * (base + 3) + 2] = bytes[ROW * i + 26]; texB[4 * (base + 3) + 3] = bytes[ROW * i + 27];
        positions[3 * i] = x; positions[3 * i + 1] = y; positions[3 * i + 2] = z;

        var s0 = fb[8 * i + 3], s1 = fb[8 * i + 4], s2 = fb[8 * i + 5];
        var r0 = (bytes[ROW * i + 28] - 128) / 128, r1 = (bytes[ROW * i + 29] - 128) / 128,
            r2 = (bytes[ROW * i + 30] - 128) / 128, r3 = (bytes[ROW * i + 31] - 128) / 128;
        // M = S * R, then sigma = M^T M (3D covariance, symmetric, 6 values)
        var M = [
          1 - 2 * (r2 * r2 + r3 * r3), 2 * (r1 * r2 + r0 * r3), 2 * (r1 * r3 - r0 * r2),
          2 * (r1 * r2 - r0 * r3), 1 - 2 * (r1 * r1 + r3 * r3), 2 * (r2 * r3 + r0 * r1),
          2 * (r1 * r3 + r0 * r2), 2 * (r2 * r3 - r0 * r1), 1 - 2 * (r1 * r1 + r2 * r2)
        ];
        for (var k = 0; k < 9; k++) M[k] *= k < 3 ? s0 : k < 6 ? s1 : s2;
        var c00 = M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
        var c01 = M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
        var c02 = M[0] * M[2] + M[3] * M[5] + M[6] * M[8];
        var c11 = M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
        var c12 = M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
        var c22 = M[2] * M[2] + M[5] * M[5] + M[8] * M[8];
        tex[base + 4] = pack2(4 * c00, 4 * c01);
        tex[base + 5] = pack2(4 * c02, 4 * c11);
        tex[base + 6] = pack2(4 * c12, 4 * c22);
        tex[base + 7] = 0;

        // Scatter offset: mostly radial from the subject's centre, part random,
        // at a distance that puts the swarm well outside the body.
        var h0 = hash(i), h1 = hash(i * 7 + 1), h2 = hash(i * 13 + 2), h3 = hash(i * 31 + 3);
        var dx = x - center[0], dy = y - center[1], dz = z - center[2];
        var dl = Math.hypot(dx, dy, dz) || 1;
        var th = h1 * 6.2831853, ph = Math.acos(2 * h2 - 1);
        var rx = Math.sin(ph) * Math.cos(th), ry = Math.cos(ph), rz = Math.sin(ph) * Math.sin(th);
        var ox = 0.6 * dx / dl + 0.4 * rx, oy = 0.6 * dy / dl + 0.4 * ry, oz = 0.6 * dz / dl + 0.4 * rz;
        var ol = Math.hypot(ox, oy, oz) || 1;
        var dist = scatter * (0.3 + 0.7 * Math.pow(h0, 1.6));
        ox = ox / ol * dist; oy = oy / ol * dist; oz = oz / ol * dist;
        texF[base + 8] = ox; texF[base + 9] = oy; texF[base + 10] = oz;
        tex[base + 11] = Math.floor(h3 * 65535);
        offsets[3 * i] = ox; offsets[3 * i + 1] = oy; offsets[3 * i + 2] = oz;
      }
      built = n;
      self.postMessage({ type: 'tex', data: tex, width: TEX_W, height: rows, count: n }, [tex.buffer]);
      lastVP = null; // force a fresh sort against the new count
      if (pendingView) sort(pendingView.vp, pendingView.a, true);
    }

    function sort(vp, a, force) {
      if (!built) { pendingView = { vp: vp, a: a }; return; }
      if (!force && lastVP) {
        var dot = lastVP[2] * vp[2] + lastVP[6] * vp[6] + lastVP[10] * vp[10];
        if (Math.abs(dot - 1) < 0.005 && Math.abs(a - lastA) < 0.02) return;
      }
      var n = built, sc = 1 - a;
      var depth = new Int32Array(n), lo = Infinity, hi = -Infinity;
      for (var i = 0; i < n; i++) {
        var x = positions[3 * i] + offsets[3 * i] * sc;
        var y = positions[3 * i + 1] + offsets[3 * i + 1] * sc;
        var z = positions[3 * i + 2] + offsets[3 * i + 2] * sc;
        var d = ((vp[2] * x + vp[6] * y + vp[10] * z) * 4096) | 0;
        depth[i] = d; if (d < lo) lo = d; if (d > hi) hi = d;
      }
      var inv = 65535 / Math.max(hi - lo, 1);
      var counts = new Uint32Array(65536);
      for (i = 0; i < n; i++) { depth[i] = ((depth[i] - lo) * inv) | 0; counts[depth[i]]++; }
      var starts = new Uint32Array(65536);
      for (i = 1; i < 65536; i++) starts[i] = starts[i - 1] + counts[i - 1];
      var order = new Uint32Array(n);
      for (i = 0; i < n; i++) order[starts[depth[i]]++] = i;
      lastVP = vp; lastA = a; pendingView = null;
      self.postMessage({ type: 'order', order: order, count: n }, [order.buffer]);
    }

    self.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'init') {
        total = m.total; maxCount = m.maxCount || Infinity; center = m.center || center; scatter = m.scatter || scatter;
        bytes = new Uint8Array(total); received = 0; count = 0; built = 0;
      } else if (m.type === 'chunk') {
        var chunk = new Uint8Array(m.buf);
        if (received + chunk.length > bytes.length) chunk = chunk.subarray(0, bytes.length - received);
        bytes.set(chunk, received); received += chunk.length;
        count = Math.floor(received / ROW);
        // Rebuild in steps: the first frame lands early, the rest fills in.
        var n = Math.min(count, maxCount);
        if (n >= maxCount || received >= total || n - built >= 40000) build();
      } else if (m.type === 'finish') {
        build();
      } else if (m.type === 'view') {
        if (sorting) { pendingView = { vp: m.vp, a: m.a }; return; }
        sorting = true;
        sort(m.vp, m.a, false);
        sorting = false;
        if (pendingView) { var p = pendingView; pendingView = null; sort(p.vp, p.a, false); }
      }
    };
  }

  /* ----------------------------------------------------------- shaders -- */
  var VS = [
    '#version 300 es',
    'precision highp float; precision highp int;',
    'uniform highp usampler2D u_tex;',
    'uniform mat4 u_proj, u_view;',
    'uniform vec2 u_focal, u_viewport, u_shift;',
    'uniform float u_assemble, u_spin, u_alpha;',
    'uniform vec3 u_accent;',
    'uniform int u_spr;',
    'in vec2 a_pos; in int a_index;',
    'out vec4 v_color; out vec2 v_pos;',
    'void main(){',
    '  int col = (a_index % u_spr) * 3; int row = a_index / u_spr;',
    '  uvec4 t0 = texelFetch(u_tex, ivec2(col, row), 0);',
    '  uvec4 t1 = texelFetch(u_tex, ivec2(col + 1, row), 0);',
    '  uvec4 t2 = texelFetch(u_tex, ivec2(col + 2, row), 0);',
    '  vec3 center = uintBitsToFloat(t0.xyz);',
    '  float a = clamp(u_assemble, 0.0, 1.0); float sc = 1.0 - a;',
    '  float seed = float(t2.w & 0xffffu) / 65535.0;',
    '  if (sc > 0.0005) {',
    '    vec3 off = uintBitsToFloat(t2.xyz);',
    '    float ang = sc * (1.6 + seed * 2.4) + u_spin * (0.6 + 0.8 * seed) * sc;',
    '    float cs = cos(ang), sn = sin(ang);',
    '    vec3 o = vec3(off.x * cs - off.z * sn, off.y + sc * 0.5 * (seed - 0.35), off.x * sn + off.z * cs);',
    '    center += o * sc;',
    '  }',
    '  vec4 cam = u_view * vec4(center, 1.0);',
    '  vec4 pos2d = u_proj * cam;',
    '  float clip = 1.2 * pos2d.w;',
    '  if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }',
    '  vec2 u1 = unpackHalf2x16(t1.x), u2 = unpackHalf2x16(t1.y), u3 = unpackHalf2x16(t1.z);',
    '  float k = mix(0.16, 1.0, a); k *= k;',
    '  mat3 Vrk = k * mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);',
    '  mat3 J = mat3(u_focal.x / cam.z, 0.0, -(u_focal.x * cam.x) / (cam.z * cam.z),',
    '                0.0, -u_focal.y / cam.z, (u_focal.y * cam.y) / (cam.z * cam.z),',
    '                0.0, 0.0, 0.0);',
    '  mat3 T = transpose(mat3(u_view)) * J;',
    '  mat3 cov2d = transpose(T) * Vrk * T;',
    '  float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;',
    '  float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));',
    '  float l1 = mid + radius, l2 = mid - radius;',
    '  if (l2 < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }',
    '  vec2 dv = normalize(vec2(cov2d[0][1], l1 - cov2d[0][0]));',
    '  vec2 major = min(sqrt(2.0 * l1), 1024.0) * dv;',
    '  vec2 minor = min(sqrt(2.0 * l2), 1024.0) * vec2(dv.y, -dv.x);',
    '  vec4 rgba = vec4(float(t0.w & 0xffu), float((t0.w >> 8) & 0xffu), float((t0.w >> 16) & 0xffu), float((t0.w >> 24) & 0xffu)) / 255.0;',
    '  vec3 spark = u_accent * (0.7 + 0.7 * seed);',
    '  rgba.rgb = mix(rgba.rgb, spark, smoothstep(0.0, 0.5, sc) * 0.8);',
    '  // Thin the swarm: about half the splats fade out as they scatter, so the',
    '  // sparks read as sparks and the ground stays visible between them.',
    '  float keep = seed < 0.52 ? 1.0 - smoothstep(0.05, 0.45, sc) : 1.0;',
    '  rgba.a = mix(rgba.a, min(1.0, rgba.a * 1.25), sc) * keep * u_alpha;',
    '  v_color = rgba; v_pos = a_pos;',
    '  vec2 vc = pos2d.xy / pos2d.w + u_shift;',
    '  gl_Position = vec4(vc + a_pos.x * major / u_viewport + a_pos.y * minor / u_viewport, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 v_color; in vec2 v_pos;',
    'out vec4 fragColor;',
    'void main(){',
    '  float A = -dot(v_pos, v_pos);',
    '  if (A < -4.0) discard;',
    '  float B = exp(A) * v_color.a;',
    '  fragColor = vec4(B * v_color.rgb, B);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------- maths -- */
  function normalize(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function mul4(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  // Camera convention: x right, y down, z forward (the convention 3DGS files
  // are trained in), so `up` is the world direction that should read as up on
  // screen and the projection flips y for the GL framebuffer.
  function projection(fx, fy, w, h, near, far) {
    return new Float32Array([
      2 * fx / w, 0, 0, 0,
      0, -2 * fy / h, 0, 0,
      0, 0, far / (far - near), 1,
      0, 0, -(far * near) / (far - near), 0
    ]);
  }
  function lookAt(eye, target, up) {
    var z = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    var down = [-up[0], -up[1], -up[2]];
    var x = normalize(cross(down, z));
    var y = cross(z, x);
    // view = inverse of [x y z | eye]
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return [1, 0.7, 0.2];
    var v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  /* ------------------------------------------------------------ create -- */
  function create(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return null;

    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('[splat]', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('[splat]', gl.getProgramInfoLog(prog)); return null; }
    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.clearColor(0, 0, 0, 0);

    var U = {};
    ['u_tex', 'u_proj', 'u_view', 'u_focal', 'u_viewport', 'u_shift', 'u_assemble', 'u_spin', 'u_alpha', 'u_accent', 'u_spr']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var idxBuf = gl.createBuffer();
    var aIdx = gl.getAttribLocation(prog, 'a_index');
    gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
    gl.enableVertexAttribArray(aIdx);
    gl.vertexAttribIPointer(aIdx, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(aIdx, 1);

    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(U.u_tex, 0);
    gl.uniform1i(U.u_spr, SPR);
    var accent = hexToRgb(opts.accent || '#F7B32B');
    gl.uniform3f(U.u_accent, accent[0], accent[1], accent[2]);

    var worker = new Worker(URL.createObjectURL(new Blob(['(', workerMain.toString(), ')(self)'], { type: 'application/javascript' })));

    var state = {
      count: 0, drawCount: 0, ready: false, painted: false,
      yaw: 0, pitch: 0, dist: 4, roll: 0, shift: [0, 0], assemble: 1, alpha: 1, spin: 0,
      center: opts.center || [0, 0, 0], up: opts.up || [0, 1, 0], fov: opts.fov || 34,
      dpr: 1, w: 1, h: 1, dirty: true, paused: false, time: 0
    };
    var listeners = { progress: [], ready: [], paint: [] };
    function emit(n, v) { listeners[n].forEach(function (f) { f(v); }); }

    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'tex') {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, m.width, m.height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, m.data);
        state.count = m.count;
        pushView(true);
      } else if (m.type === 'order') {
        gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, m.order, gl.DYNAMIC_DRAW);
        state.drawCount = m.count;
        state.dirty = true;
        if (!state.ready) { state.ready = true; emit('ready', state.count); }
      }
    };

    var proj = null, view = null;
    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(devicePixelRatio || 1, opts.maxDpr || 1.5);
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (w === state.w && h === state.h && dpr === state.dpr) return;
      state.w = w; state.h = h; state.dpr = dpr;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      var fy = h / (2 * Math.tan((state.fov * Math.PI / 180) / 2)), fx = fy;
      proj = projection(fx, fy, w, h, 0.1, 100);
      gl.uniformMatrix4fv(U.u_proj, false, proj);
      gl.uniform2f(U.u_focal, fx, fy);
      gl.uniform2f(U.u_viewport, w, h);
      state.dirty = true;
      pushView(true);
    }

    function computeView() {
      var yaw = state.yaw * Math.PI / 180, pitch = state.pitch * Math.PI / 180;
      var up = normalize(state.up);
      // Build an orbit basis around `up`: pick a reference forward that is not
      // parallel to up, then orbit in the plane perpendicular to up.
      var ref = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      var side = normalize(cross(up, ref));
      var fwd = normalize(cross(side, up));
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var dir = [
        (fwd[0] * cy + side[0] * sy) * cp + up[0] * sp,
        (fwd[1] * cy + side[1] * sy) * cp + up[1] * sp,
        (fwd[2] * cy + side[2] * sy) * cp + up[2] * sp
      ];
      var c = state.center;
      var eye = [c[0] - dir[0] * state.dist, c[1] - dir[1] * state.dist, c[2] - dir[2] * state.dist];
      view = lookAt(eye, c, up);
      if (state.roll) {
        var rr = state.roll * Math.PI / 180, cr = Math.cos(rr), sr = Math.sin(rr);
        var R = new Float32Array([cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        view = mul4(R, view);
      }
    }

    var lastSent = null;
    function pushView(force) {
      if (!proj) return;
      computeView();
      var vp = mul4(proj, view);
      if (!force && lastSent) {
        var d = lastSent[2] * vp[2] + lastSent[6] * vp[6] + lastSent[10] * vp[10];
        if (Math.abs(d - 1) < 0.002 && Math.abs(lastSent.a - state.assemble) < 0.01) return;
      }
      vp.a = state.assemble;
      lastSent = vp;
      worker.postMessage({ type: 'view', vp: vp, a: state.assemble });
    }

    function draw() {
      if (!proj || !view) computeView();
      if (!view) return;
      gl.uniformMatrix4fv(U.u_view, false, view);
      gl.uniform2f(U.u_shift, state.shift[0], state.shift[1]);
      gl.uniform1f(U.u_assemble, state.assemble);
      gl.uniform1f(U.u_alpha, state.alpha);
      gl.uniform1f(U.u_spin, state.spin);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (state.drawCount > 0) {
        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, state.drawCount);
        if (!state.painted) { state.painted = true; emit('paint', true); }
      }
      state.dirty = false;
    }

    // Draw on demand only. Even the scattered swarm is a pure function of the
    // values the page sets (its spin comes from scroll, not from a clock), so
    // a page that is not being scrolled costs nothing.
    var running = true;
    function frame() {
      if (!running) return;
      requestAnimationFrame(frame);
      if (state.paused || !state.dirty) return;
      draw();
    }
    requestAnimationFrame(frame);

    // Streamed load. The file is importance-sorted, so the body appears from the
    // first chunk and fills in; a phone can stop early at maxCount.
    function load(url) {
      var maxCount = opts.maxCount || Infinity;
      // Ask for only the bytes the budget needs. A host that honours Range
      // answers 206 with exactly that many; one that ignores it sends the
      // whole file and the reader is cancelled once enough has arrived.
      var init = isFinite(maxCount) ? { headers: { Range: 'bytes=0-' + (maxCount * ROW - 1) } } : undefined;
      return fetch(url, init).then(function (res) {
        if (!res.ok) throw new Error('splat ' + res.status);
        var total = parseInt(res.headers.get('content-length') || '0', 10);
        if (!total) return res.arrayBuffer().then(function (ab) {
          worker.postMessage({ type: 'init', total: ab.byteLength, maxCount: maxCount, center: state.center, scatter: opts.scatter || 3 });
          worker.postMessage({ type: 'chunk', buf: ab }, [ab]);
          worker.postMessage({ type: 'finish' });
          emit('progress', 1);
        });
        var need = Math.min(total, isFinite(maxCount) ? maxCount * ROW : total);
        worker.postMessage({ type: 'init', total: need, maxCount: maxCount, center: state.center, scatter: opts.scatter || 3 });
        var reader = res.body.getReader(), got = 0;
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) { worker.postMessage({ type: 'finish' }); emit('progress', 1); return; }
            var chunk = r.value;
            got += chunk.byteLength;
            var buf = chunk.buffer.byteLength === chunk.byteLength ? chunk.buffer : chunk.slice().buffer;
            worker.postMessage({ type: 'chunk', buf: buf }, [buf]);
            emit('progress', Math.min(1, got / need));
            if (need < total && got >= need) { reader.cancel(); worker.postMessage({ type: 'finish' }); emit('progress', 1); return; }
            return pump();
          });
        }
        return pump();
      });
    }

    var ro = ('ResizeObserver' in global) ? new ResizeObserver(function () { resize(); }) : null;
    if (ro) ro.observe(canvas);
    resize();

    var api = {
      state: state,
      load: load,
      on: function (n, f) { if (listeners[n]) listeners[n].push(f); return api; },
      set: function (o) {
        var changed = false;
        for (var k in o) {
          if (!o.hasOwnProperty(k)) continue;
          if (k === 'shift') { if (state.shift[0] !== o.shift[0] || state.shift[1] !== o.shift[1]) { state.shift = o.shift; changed = true; } continue; }
          if (state[k] !== o[k]) { state[k] = o[k]; changed = true; }
        }
        if (changed) { state.dirty = true; pushView(false); }
        return api;
      },
      pause: function (p) { p = !!p; if (p === state.paused) return api; state.paused = p; if (!p) state.dirty = true; return api; },
      resize: resize,
      // Synchronous draw + read for poster capture. Works without
      // preserveDrawingBuffer because nothing else runs between the two calls.
      snapshot: function (type, quality) { computeView(); draw(); return canvas.toDataURL(type || 'image/png', quality); },
      destroy: function () { running = false; if (ro) ro.disconnect(); worker.terminate(); }
    };
    return api;
  }

  // Renderer probe: a software rasteriser (SwiftShader, llvmpipe, Mesa
  // software) can draw the subject, just not 200k splats at full size every
  // frame. The page reads this to pick a lower splat budget on such machines.
  function probe() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
      if (!gl) return { supported: false, software: false, renderer: '' };
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return { supported: true, software: /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(r), renderer: r };
    } catch (e) { return { supported: false, software: false, renderer: '' }; }
  }
  global.FalconSplat = { create: create, probe: probe, supported: function () { return probe().supported; } };
})(window);
