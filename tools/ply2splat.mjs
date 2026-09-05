#!/usr/bin/env node
// Convert a 3D Gaussian Splatting PLY into the compact 32-byte-per-splat
// ".splat" layout (pos f32x3, scale f32x3, rgba u8x4, rot u8x4), sorted by
// importance (volume * opacity) so a partial download already shows the body.
// Usage: node ply2splat.mjs in.ply out.splat [--max N]
import fs from "node:fs";

const [,, inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) { console.error("usage: ply2splat in.ply out.splat [--max N]"); process.exit(1); }
const maxArg = rest.indexOf("--max"); const MAX = maxArg > -1 ? parseInt(rest[maxArg + 1], 10) : Infinity;

const buf = fs.readFileSync(inPath);
const headerEnd = buf.indexOf("end_header\n");
const header = buf.subarray(0, headerEnd).toString("ascii");
const count = parseInt(/element vertex (\d+)/.exec(header)[1], 10);
const SIZES = { float: 4, double: 8, uchar: 1, char: 1, ushort: 2, short: 2, uint: 4, int: 4 };
const props = []; let stride = 0;
for (const line of header.split("\n")) {
  if (!line.startsWith("property ")) continue;
  const [, type, name] = line.split(" ");
  props.push({ name, type, off: stride }); stride += SIZES[type];
}
const off = Object.fromEntries(props.map(p => [p.name, p.off]));
const need = ["x","y","z","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3","opacity","f_dc_0"];
for (const n of need) if (!(n in off)) throw new Error("missing property " + n);
const data = buf.subarray(headerEnd + "end_header\n".length);
const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
const f = (i, name) => dv.getFloat32(i * stride + off[name], true);

const SH_C0 = 0.28209479177387814;
const sig = x => 1 / (1 + Math.exp(-x));

// importance
const imp = new Float32Array(count);
const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const sum = [0, 0, 0]; let wsum = 0;
for (let i = 0; i < count; i++) {
  const s0 = Math.exp(f(i, "scale_0")), s1 = Math.exp(f(i, "scale_1")), s2 = Math.exp(f(i, "scale_2"));
  const a = sig(f(i, "opacity"));
  imp[i] = s0 * s1 * s2 * a;
  const p = [f(i, "x"), f(i, "y"), f(i, "z")];
  for (let k = 0; k < 3; k++) { if (p[k] < bbox.min[k]) bbox.min[k] = p[k]; if (p[k] > bbox.max[k]) bbox.max[k] = p[k]; sum[k] += p[k] * a; }
  wsum += a;
}
const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => imp[b] - imp[a]);
const keep = Math.min(count, MAX);

const out = Buffer.alloc(32 * keep);
for (let j = 0; j < keep; j++) {
  const i = order[j]; const o = 32 * j;
  out.writeFloatLE(f(i, "x"), o); out.writeFloatLE(f(i, "y"), o + 4); out.writeFloatLE(f(i, "z"), o + 8);
  out.writeFloatLE(Math.exp(f(i, "scale_0")), o + 12);
  out.writeFloatLE(Math.exp(f(i, "scale_1")), o + 16);
  out.writeFloatLE(Math.exp(f(i, "scale_2")), o + 20);
  const c = k => Math.max(0, Math.min(255, Math.round((0.5 + SH_C0 * f(i, "f_dc_" + k)) * 255)));
  out[o + 24] = c(0); out[o + 25] = c(1); out[o + 26] = c(2);
  out[o + 27] = Math.max(0, Math.min(255, Math.round(sig(f(i, "opacity")) * 255)));
  const q = [f(i, "rot_0"), f(i, "rot_1"), f(i, "rot_2"), f(i, "rot_3")];
  const ql = Math.hypot(...q) || 1;
  for (let k = 0; k < 4; k++) out[o + 28 + k] = Math.max(0, Math.min(255, Math.round((q[k] / ql) * 128 + 128)));
}
fs.writeFileSync(outPath, out);
const centroid = sum.map(v => v / wsum);
const ext = bbox.max.map((v, k) => v - bbox.min[k]);
console.log(JSON.stringify({ count, kept: keep, bytes: out.length, bbox, centroid, extent: ext }, null, 1));
