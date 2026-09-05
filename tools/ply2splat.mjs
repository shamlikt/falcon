#!/usr/bin/env node
// Convert a 3D Gaussian Splatting PLY into the compact 32-byte-per-splat
// ".splat" layout (pos f32x3, scale f32x3, rgba u8x4, rot u8x4), sorted by
// importance (volume * opacity) so a partial download already shows the body.
//
//   node tools/ply2splat.mjs in.ply out.splat [--max N]
//
// Also importable: convert(inPath, outPath, { max }) and splatStats(buffer),
// which build-figures.mjs uses to keep one conversion and one stats routine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROW = 32;

const SIZES = { float: 4, double: 8, uchar: 1, char: 1, ushort: 2, short: 2, uint: 4, int: 4 };
const SH_C0 = 0.28209479177387814;
const sig = (x) => 1 / (1 + Math.exp(-x));
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Convert one PLY to a .splat file. Returns { count, kept, bytes }. */
export function convert(inPath, outPath, { max = Infinity } = {}) {
  const buf = fs.readFileSync(inPath);
  const headerEnd = buf.indexOf("end_header\n");
  if (headerEnd < 0) throw new Error(`${inPath}: no PLY header`);
  const header = buf.subarray(0, headerEnd).toString("ascii");
  const count = parseInt(/element vertex (\d+)/.exec(header)[1], 10);
  const props = []; let stride = 0;
  for (const line of header.split("\n")) {
    if (!line.startsWith("property ")) continue;
    const [, type, name] = line.split(" ");
    props.push({ name, type, off: stride }); stride += SIZES[type];
  }
  const off = Object.fromEntries(props.map((p) => [p.name, p.off]));
  for (const n of ["x", "y", "z", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3", "opacity", "f_dc_0"]) {
    if (!(n in off)) throw new Error(`${inPath}: missing property ${n}`);
  }
  const data = buf.subarray(headerEnd + "end_header\n".length);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const f = (i, name) => dv.getFloat32(i * stride + off[name], true);

  // Importance: volume times opacity. Big opaque splats first.
  const imp = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    imp[i] = Math.exp(f(i, "scale_0")) * Math.exp(f(i, "scale_1")) * Math.exp(f(i, "scale_2")) * sig(f(i, "opacity"));
  }
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => imp[b] - imp[a]);
  const kept = Math.min(count, max);

  const out = Buffer.alloc(ROW * kept);
  for (let j = 0; j < kept; j++) {
    const i = order[j]; const o = ROW * j;
    out.writeFloatLE(f(i, "x"), o); out.writeFloatLE(f(i, "y"), o + 4); out.writeFloatLE(f(i, "z"), o + 8);
    out.writeFloatLE(Math.exp(f(i, "scale_0")), o + 12);
    out.writeFloatLE(Math.exp(f(i, "scale_1")), o + 16);
    out.writeFloatLE(Math.exp(f(i, "scale_2")), o + 20);
    out[o + 24] = u8((0.5 + SH_C0 * f(i, "f_dc_0")) * 255);
    out[o + 25] = u8((0.5 + SH_C0 * f(i, "f_dc_1")) * 255);
    out[o + 26] = u8((0.5 + SH_C0 * f(i, "f_dc_2")) * 255);
    out[o + 27] = u8(sig(f(i, "opacity")) * 255);
    const q = [f(i, "rot_0"), f(i, "rot_1"), f(i, "rot_2"), f(i, "rot_3")];
    const ql = Math.hypot(...q) || 1;
    for (let k = 0; k < 4; k++) out[o + 28 + k] = u8((q[k] / ql) * 128 + 128);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  return { count, kept, bytes: out.length };
}

/**
 * Framing statistics from a .splat buffer: count, alpha-weighted centroid,
 * bounding box, and a robust body box (5th to 95th percentile of splats with
 * meaningful opacity) as `center` and `extent`. The robust box is what to
 * compare between captures; the raw bbox is dominated by floaters.
 */
export function splatStats(buf) {
  const n = Math.floor(buf.length / ROW);
  const axes = [[], [], []];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const sum = [0, 0, 0]; let wsum = 0;
  for (let i = 0; i < n; i++) {
    const o = ROW * i, a = buf[o + 27] / 255;
    const p = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k];
      sum[k] += p[k] * a;
      if (a > 0.2) axes[k].push(p[k]);
    }
    wsum += a;
  }
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))] : 0;
  const lo = [], hi = [];
  for (let k = 0; k < 3; k++) {
    const a = Float32Array.from(axes[k]).sort();
    lo[k] = pct(a, 0.05); hi[k] = pct(a, 0.95);
  }
  return {
    count: n,
    centroid: sum.map((v) => r3(v / (wsum || 1))),
    bbox: { min: min.map(r3), max: max.map(r3) },
    center: lo.map((v, k) => r3((v + hi[k]) / 2)),
    extent: lo.map((v, k) => r3(hi[k] - v)),
  };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inPath, outPath, ...rest] = process.argv;
  if (!inPath || !outPath) { console.error("usage: ply2splat in.ply out.splat [--max N]"); process.exit(1); }
  const maxArg = rest.indexOf("--max");
  const max = maxArg > -1 ? parseInt(rest[maxArg + 1], 10) : Infinity;
  const result = convert(inPath, outPath, { max });
  console.log(JSON.stringify({ ...result, ...splatStats(fs.readFileSync(outPath)) }, null, 1));
}
