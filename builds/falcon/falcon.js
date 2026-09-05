/* ============================================================================
   falcon.js: page-local choreography for the Falcon build.

   The engine (scrollcraft.js) owns the acts, cues, the rail and the pointer
   devices. This file owns everything on the fixed arena stage:

     - the turntable: Kabeer's heading is a function of document position
     - the respawn: the assembly value driven from the peak act's progress
     - the wordmark plane, the light sweep, the embers plane
     - the HUD dial (a heading readout that also scrolls the page) and index
     - the callsign preview in the close

   Nothing here edits the engine. The arena publishes data-sc-verify-state so
   the verification harness can see the composition changing over acts that
   are otherwise plain flow markers.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = {
    up: [0, 0, 1],                      // the scan's up axis
    center: [0.0, -0.05, 0.05],         // look-at point: between chin and collar
    frontYaw: 90,                       // heading at which he faces the camera
    startYaw: 125,                      // landing: three-quarters, looking toward the copy
    turn: 325,                          // total turn before he faces you (125 + 325 = 450 = front)
    pitch: -6,                          // camera slightly above eye line
    fov: 34,
    // fitWidth: model units that must fit across the viewport; when set it
    // overrides dist so a portrait phone frames the bust instead of one eye.
    desktop: { dist: 4.3, shift: [0.2, -0.06], maxDpr: 1.5, maxCount: Infinity, embers: 64 },
    mobile:  { dist: 4.6, fitWidth: 2.1, shift: [0.0, 0.24], maxDpr: 1.25, maxCount: 120000, embers: 28 },
    scatter: 1.8,
    accent: '#F7B32B',
    splat: 'assets/avatar.splat'
  };

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var smallMQ = matchMedia('(max-width: 860px)');
  var isMobile = function () { return smallMQ.matches || matchMedia('(hover: none) and (pointer: coarse)').matches; };

  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var clamp01 = function (x) { return clamp(x, 0, 1); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeOutQuart = function (t) { return 1 - Math.pow(1 - t, 4); };
  var easeInCubic = function (t) { return t * t * t; };

  var $ = function (id) { return document.getElementById(id); };
  var arena = $('arena'), mark = $('mark'), splatCanvas = $('splat'), embersCanvas = $('embers'), loadEl = $('load');
  var poster = $('poster');
  var respawnEl = $('respawn'), wayEl = $('way'), stamp = $('stamp'), shade = $('shade');
  var hud = document.querySelector('.hud'), dial = $('dial'), needle = $('needle'), degNum = $('deg-num');
  var indexLinks = Array.prototype.slice.call(document.querySelectorAll('#index a'));
  var sections = indexLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  var profile = isMobile() ? CFG.mobile : CFG.desktop;
  // A software rasteriser gets the same page with a smaller splat budget. The
  // file is importance-sorted, so the first N splats are the body, not noise.
  var gl = window.FalconSplat ? FalconSplat.probe() : { supported: false, software: false };
  if (gl.software) profile = Object.assign({}, profile, { maxCount: Math.min(profile.maxCount, 70000), maxDpr: 1 });

  /* ------------------------------------------------------------ engine -- */
  var engine = window.ScrollCraft ? ScrollCraft.mount(document.body) : null;

  /* ------------------------------------------------------- the subject -- */
  var splat = null;
  if (gl.supported) {
    splat = FalconSplat.create(splatCanvas, {
      center: CFG.center, up: CFG.up, fov: CFG.fov, accent: CFG.accent,
      maxDpr: profile.maxDpr, maxCount: profile.maxCount, scatter: CFG.scatter
    });
  }
  function cameraDist() {
    if (!profile.fitWidth) return profile.dist;
    var aspect = Math.max(innerWidth, 1) / Math.max(innerHeight, 1);
    var halfTan = Math.tan((CFG.fov * Math.PI / 180) / 2);
    return Math.max(profile.dist, profile.fitWidth / (2 * halfTan * aspect));
  }
  if (splat) {
    arena.classList.add('is-loading');
    splat.set({ yaw: CFG.startYaw, pitch: CFG.pitch, dist: cameraDist(), shift: profile.shift, assemble: 1 });
    splat.on('progress', function (p) {
      loadEl.textContent = 'Loading Kabeer ' + Math.round(p * 100) + '%';
    });
    splat.on('paint', function () {
      arena.classList.add('is-live');
      loadEl.textContent = 'Kabeer is live';
    });
    splat.load(CFG.splat).catch(function (err) {
      console.error('[falcon] splat load failed', err);
      arena.classList.add('no-gl');
    });
  } else {
    // No WebGL2: the poster is the subject. It still sits between the planes.
    arena.classList.add('no-gl');
  }

  /* --------------------------------------------------------- measuring -- */
  var vh = innerHeight, vw = innerWidth;
  var M = { respawnTop: 0, respawnH: 0, travel: 1, turnEnd: 1, wayTop: 0, wayBottom: 0, coverStart: 0, coverEnd: 0 };
  var needsMeasure = true;
  function measure() {
    vh = innerHeight; vw = innerWidth;
    var r = respawnEl.getBoundingClientRect();
    M.respawnTop = r.top + scrollY; M.respawnH = r.height;
    M.travel = Math.max(M.respawnH - vh, 1);
    // He is fully re-formed and facing you at 74% of the peak act's travel.
    M.turnEnd = M.respawnTop + 0.74 * M.travel;
    var w = wayEl.getBoundingClientRect();
    M.wayTop = w.top + scrollY; M.wayBottom = M.wayTop + w.height;
    // Act 4 rises over the arena from coverStart and has covered it by coverEnd.
    M.coverStart = M.wayTop - vh; M.coverEnd = M.wayTop;
    needsMeasure = false;
  }

  /* ------------------------------------------------- assembly from p -- */
  // p is the peak act's pinned progress. Burst, hang, snap.
  function assembleAt(p) {
    if (reduce) return 1;
    if (p < 0.08) return 1;
    if (p < 0.30) return 1 - easeInCubic((p - 0.08) / 0.22);
    if (p < 0.52) return 0;
    if (p < 0.74) return easeOutQuart((p - 0.52) / 0.22);
    return 1;
  }
  function yawAt(y) {
    var t = clamp01(y / Math.max(M.turnEnd, 1));
    // Faster off the line, settling as he comes round to face you.
    return CFG.startYaw + CFG.turn * (1 - Math.pow(1 - t, 1.7));
  }

  /* -------------------------------------------------------- embers ---- */
  var ectx = embersCanvas.getContext('2d');
  var embers = [];
  function seedEmbers() {
    embers.length = 0;
    var n = reduce ? Math.round(profile.embers * 0.5) : profile.embers;
    for (var i = 0; i < n; i++) {
      embers.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, s: 0.12 + Math.random() * 0.35, ph: Math.random() * 6.28, a: 0.25 + Math.random() * 0.55 });
    }
  }
  function sizeEmbers() {
    embersCanvas.width = Math.round(vw); embersCanvas.height = Math.round(vh);
  }
  function drawEmbers(dt, speedBoost, parallaxY) {
    var W = embersCanvas.width, H = embersCanvas.height;
    ectx.clearRect(0, 0, W, H);
    ectx.fillStyle = CFG.accent;
    for (var i = 0; i < embers.length; i++) {
      var e = embers[i];
      if (!reduce) {
        e.y -= e.s * dt * (1 + speedBoost * 3) * 0.06;
        e.ph += dt * 0.9;
        if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
      }
      var x = (e.x + Math.sin(e.ph) * 0.012) * W;
      var y = ((e.y + parallaxY) % 1.1) * H;
      if (y < 0) y += 1.1 * H;
      var glow = 0.6 + 0.4 * Math.sin(e.ph * 1.7);
      ectx.globalAlpha = e.a * glow;
      ectx.beginPath(); ectx.arc(x, y, e.r, 0, 6.2832); ectx.fill();
    }
    ectx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ pointer -- */
  var px = 0.5, py = 0.5, pxs = 0.5, pys = 0.5;
  if (fine && !reduce) {
    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX / vw; py = e.clientY / vh;
    }, { passive: true });
  }

  /* ---------------------------------------------------------- the loop -- */
  var lastY = scrollY, lastT = performance.now(), velocity = 0, sweep = 0;
  var lastState = '', lastActive = -1, lastLight = null, lastLightTop = null, lastDialGone = null;
  var lastDegShown = null;

  function frame(now) {
    requestAnimationFrame(frame);
    if (needsMeasure) measure();
    var dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
    var y = scrollY;
    var dy = y - lastY; lastY = y;
    velocity = lerp(velocity, Math.min(Math.abs(dy) / Math.max(vh, 1) * 8, 1.5), 0.12);

    var covered = y >= M.coverEnd + 4;
    var p = clamp01((y - M.respawnTop) / M.travel);
    var a = assembleAt(p);
    var yaw = yawAt(y);

    // pointer orbit, lerped so it carries momentum
    pxs = lerp(pxs, px, 0.06); pys = lerp(pys, py, 0.06);
    var yawP = fine && !reduce ? (pxs - 0.5) * 12 : 0;
    var pitchP = fine && !reduce ? (0.5 - pys) * 5 : 0;

    if (splat) {
      splat.pause(covered || document.hidden);
      // The swarm's spin is scroll, not time: it turns as fast as the hand does.
      if (!covered) splat.set({ yaw: yaw + yawP, pitch: CFG.pitch + pitchP, assemble: a, spin: (y / Math.max(vh, 1)) * 2.4 });
    }

    // wordmark plane: further away than the document, so slower, and gone before the dossier
    var markT = clamp01(y / (vh * 1.35));
    var markOp = 1 - markT;
    if (!covered) {
      mark.style.transform = reduce ? 'none' : 'translate3d(0,' + (-y * 0.35).toFixed(1) + 'px,0)';
      mark.style.opacity = markOp.toFixed(3);
    }

    // light sweep and floor travel
    sweep = lerp(sweep, y / Math.max(M.turnEnd, 1), 0.08);
    if (!covered) {
      arena.style.setProperty('--sweep-x', (30 + sweep * 45).toFixed(1) + '%');
      arena.style.setProperty('--sweep-y', (62 - sweep * 20).toFixed(1) + '%');
      arena.style.setProperty('--floor-y', (-(y % (vh * 0.06))).toFixed(1) + 'px');
    }

    // embers: nearer plane, moves against the scroll a little, glows with speed
    if (!covered && !document.hidden) drawEmbers(dt, velocity, -(y / vh) * 0.18);

    // shade behind the stamp copies the stamp's own opacity (it must not be a cue itself)
    shade.style.opacity = stamp.style.opacity || '0';

    // HUD dial: heading relative to facing you, so facing reads 0
    var heading = ((yaw - CFG.frontYaw) % 360 + 360) % 360;
    var shown = Math.round(heading) % 360;
    if (shown !== lastDegShown) {
      lastDegShown = shown;
      needle.style.transform = 'rotate(' + heading.toFixed(1) + 'deg)';
      degNum.textContent = shown + '°';
      dial.setAttribute('aria-valuenow', String(shown));
      dial.setAttribute('aria-valuetext', shown + ' degrees');
    }

    // HUD index: active section
    var active = 0;
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (s && s.getBoundingClientRect().top <= vh * 0.45) active = i;
    }
    if (active !== lastActive) {
      lastActive = active;
      indexLinks.forEach(function (a, k) { a.classList.toggle('is-active', k === active); });
    }
    // HUD ink inverts while the lit ground sits under its corners, checked
    // separately for the top row and the bottom row.
    var probeB = y + vh - 40, probeT = y + 30;
    var onLight = probeB >= M.wayTop && probeB <= M.wayBottom;
    var onLightTop = probeT >= M.wayTop && probeT <= M.wayBottom;
    if (onLight !== lastLight) { lastLight = onLight; hud.classList.toggle('on-light', onLight); }
    if (onLightTop !== lastLightTop) { lastLightTop = onLightTop; hud.classList.toggle('on-light-top', onLightTop); }
    // The dial is the subject's heading. Once the document has covered the
    // arena there is no subject to steer, so it leaves rather than sit on copy.
    var dialGone = y > M.coverStart + vh * 0.35;
    if (dialGone !== lastDialGone) { lastDialGone = dialGone; dial.hidden = dialGone; }

    // Publish what actually paints, rounded, so the harness can see change.
    var state = 'yaw:' + (Math.round(heading / 3) * 3) + '|a:' + a.toFixed(2) + '|mark:' + markOp.toFixed(1) + '|cov:' + (covered ? 1 : 0);
    if (state !== lastState) { lastState = state; arena.setAttribute('data-sc-verify-state', state); }
    var hold = !covered && y >= M.turnEnd && a >= 1;
    if (hold) arena.setAttribute('data-sc-verify-hold', 'true'); else arena.removeAttribute('data-sc-verify-hold');
  }

  /* -------------------------------------------------------- the dial ---- */
  // Dragging the dial scrolls the page: heading is bound to scroll, so there is
  // one source of truth and the needle never disagrees with the subject.
  (function () {
    var dragging = false, lastAng = 0;
    function angleOf(e) {
      var r = dial.querySelector('svg').getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    }
    dial.addEventListener('pointerdown', function (e) {
      dragging = true; lastAng = angleOf(e); dial.setPointerCapture(e.pointerId); e.preventDefault();
    });
    dial.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var ang = angleOf(e), d = ang - lastAng;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      lastAng = ang;
      scrollBy({ top: d / CFG.turn * M.turnEnd, behavior: 'instant' });
    });
    var stop = function () { dragging = false; };
    dial.addEventListener('pointerup', stop); dial.addEventListener('pointercancel', stop);
    dial.addEventListener('keydown', function (e) {
      var step = 15 / CFG.turn * M.turnEnd;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { scrollBy({ top: step, behavior: reduce ? 'instant' : 'smooth' }); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { scrollBy({ top: -step, behavior: reduce ? 'instant' : 'smooth' }); e.preventDefault(); }
      else if (e.key === 'Home') { scrollTo({ top: 0, behavior: 'instant' }); e.preventDefault(); }
      else if (e.key === 'End') { scrollTo({ top: M.turnEnd, behavior: 'instant' }); e.preventDefault(); }
    });
  })();

  /* --------------------------------------------------- rail keyboard ---- */
  // The rail's transform is its navigation. A focused card or link that the
  // rail has not yet pulled into view is on screen and still invisible, so
  // park the act at the progress that centres the focused item.
  (function () {
    var act = document.getElementById('squad'), rail = act && act.querySelector('[data-sc-pan]');
    if (!act || !rail) return;
    var extra = parseFloat(rail.getAttribute('data-sc-pan')) || 0;
    act.addEventListener('focusin', function (e) {
      if (reduce) return; // the engine hands the rail back as a scroll region
      var item = e.target.closest('.card, .rail__lead, .rail__tail');
      if (!item) return;
      var over = rail.scrollWidth - vw;
      if (over <= 0) return;
      var want = clamp((item.offsetLeft + item.offsetWidth / 2 - vw / 2) / (over * (1 + extra)), 0, 1);
      var r = act.getBoundingClientRect();
      var top = r.top + scrollY, travel = Math.max(r.height - vh, 1);
      scrollTo({ top: top + want * travel, behavior: 'instant' });
    });
  })();

  /* ------------------------------------------------------- the close ---- */
  (function () {
    var input = $('callsign'), name = $('plate-name'), cta = $('join-cta'), status = $('join-status');
    var joinUrl = (document.querySelector('main').getAttribute('data-join-url') || '').trim();
    function tag() {
      var v = (input.value || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 14);
      return v ? v.toUpperCase() : 'RECRUIT';
    }
    input.addEventListener('input', function () { name.textContent = tag(); });
    if (joinUrl) {
      cta.href = joinUrl;
      cta.rel = 'noopener';
    } else {
      // No destination configured yet: the button still does something real.
      // It copies the visitor's Falcon tag, and only claims success when the
      // clipboard write actually succeeded.
      cta.addEventListener('click', function (e) {
        e.preventDefault();
        var text = 'FALCON // ' + tag();
        var done = function () { status.textContent = 'Tag copied: ' + text + '. Send it to Kabeer.'; };
        var fail = function () { status.textContent = 'Your tag is ' + text + '. Copy it and send it to Kabeer.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
        else fail();
      });
    }
  })();

  /* ------------------------------------------------------------ wiring -- */
  function relayout() {
    vh = innerHeight; vw = innerWidth;
    needsMeasure = true;
    sizeEmbers();
    if (splat) { splat.resize(); splat.set({ dist: cameraDist() }); }
  }
  addEventListener('resize', function () {
    // Ignore URL-bar-only height changes on phones.
    if (innerWidth === vw && isMobile()) { vh = innerHeight; needsMeasure = true; return; }
    relayout();
  }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { needsMeasure = true; });
  addEventListener('load', function () { needsMeasure = true; });
  document.addEventListener('visibilitychange', function () { if (splat) splat.pause(document.hidden); });

  seedEmbers(); sizeEmbers(); measure();
  requestAnimationFrame(frame);

  // For the poster capture and the verification pass.
  window.FALCON = {
    config: CFG, engine: engine, splat: splat, measure: M,
    snapshot: function () { return splat ? splat.snapshot('image/png') : null; }
  };
})();
