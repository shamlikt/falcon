#!/usr/bin/env node
// Discover player captures and build the figure manifest the roster page reads.
//
//   node tools/build-figures.mjs [--force] [--max N]
//
// 1. Every `<Name>.ply` in the repo root is converted to
//    builds/falcon/assets/<slug>.splat (skipped when the .splat is newer than
//    the .ply; --force reconverts). gaussians.ply is the placeholder figure
//    and converts to assets/avatar.splat.
// 2. Every assets/*.splat is indexed into assets/figures.json with a content
//    hash (`rev`, used by the page for cache-busting) and framing statistics.
//    The file is deterministic and only rewritten when its content changes.
// 3. A report maps each player to a figure or the placeholder and warns about
//    PLYs that match no player, splats with no player, and framing outliers.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { convert, splatStats } from "./ply2splat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const SITE = path.join(ROOT, "builds", "falcon");
const ASSETS = path.join(SITE, "assets");
const MANIFEST = path.join(ASSETS, "figures.json");
const PLACEHOLDER_PLY = "gaussians";   // repo-root file stem, case-insensitive
const PLACEHOLDER_SLUG = "avatar";     // its long-standing asset name

const { PEOPLE, slug } = createRequire(import.meta.url)(path.join(SITE, "players.js"));

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const maxIdx = argv.indexOf("--max");
const max = maxIdx > -1 ? parseInt(argv[maxIdx + 1], 10) : Infinity;

const stem = (file) => path.basename(file).replace(/\.[^.]+$/, "");
const slugForPly = (file) => (stem(file).toLowerCase() === PLACEHOLDER_PLY ? PLACEHOLDER_SLUG : slug(stem(file)));
const mtime = (p) => fs.statSync(p).mtimeMs;

// 1. Convert new or changed captures.
const plys = fs.readdirSync(ROOT).filter((f) => /\.ply$/i.test(f)).sort();
const sourceBySlug = new Map();
for (const ply of plys) {
  const s = slugForPly(ply), src = path.join(ROOT, ply), out = path.join(ASSETS, `${s}.splat`);
  sourceBySlug.set(s, ply);
  if (!force && fs.existsSync(out) && mtime(out) >= mtime(src)) { console.log(`up to date  ${ply} -> assets/${s}.splat`); continue; }
  const t0 = Date.now();
  const r = convert(src, out, { max });
  console.log(`converted   ${ply} -> assets/${s}.splat (${r.kept}/${r.count} splats, ${(r.bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// 2. Index every splat.
const figures = {};
for (const file of fs.readdirSync(ASSETS).filter((f) => /\.splat$/.test(f)).sort()) {
  const buf = fs.readFileSync(path.join(ASSETS, file));
  const st = splatStats(buf);
  figures[stem(file)] = {
    file: `assets/${file}`,
    rev: crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8),
    bytes: buf.length,
    count: st.count,
    center: st.center,
    extent: st.extent,
  };
}
if (!figures[PLACEHOLDER_SLUG]) { console.error(`FAIL: no placeholder figure assets/${PLACEHOLDER_SLUG}.splat (convert ${PLACEHOLDER_PLY}.ply)`); process.exit(1); }
const manifest = { placeholder: PLACEHOLDER_SLUG, figures };
const json = JSON.stringify(manifest, null, 2) + "\n";
const previous = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8") : null;
if (json !== previous) { fs.writeFileSync(MANIFEST, json); console.log(`wrote       assets/figures.json (${Object.keys(figures).length} figures)`); }
else console.log("unchanged   assets/figures.json");

// 3. Report.
const playerSlugs = new Set(PEOPLE.map((p) => slug(p.name)));
console.log("");
for (const p of PEOPLE) {
  const s = slug(p.name);
  console.log(`  ${p.name.padEnd(16)} ${s.padEnd(16)} ${figures[s] ? `figure ${figures[s].file} (${figures[s].count} splats)` : "placeholder"}`);
}
const warnings = [];
for (const [s, ply] of sourceBySlug) if (s !== PLACEHOLDER_SLUG && !playerSlugs.has(s)) warnings.push(`${ply} matches no player (slug "${s}"); check the file name against players.js`);
for (const s of Object.keys(figures)) if (s !== PLACEHOLDER_SLUG && !playerSlugs.has(s)) warnings.push(`assets/${s}.splat belongs to no player; stale asset?`);
const ref = figures[PLACEHOLDER_SLUG];
for (const [s, fig] of Object.entries(figures)) {
  if (s === PLACEHOLDER_SLUG) continue;
  const off = fig.center.map((v, k) => Math.abs(v - ref.center[k]));
  const tall = fig.extent[2] / ref.extent[2];
  if (off.some((d) => d > 0.12) || tall > 1.12) {
    warnings.push(`assets/${s}.splat is framed differently from the placeholder (centre offset ${off.map((d) => d.toFixed(2)).join("/")}, height x${tall.toFixed(2)}); check its landing screenshot and add a frame override in players.js if needed`);
  }
}
console.log("");
for (const w of warnings) console.log("warn:", w);
console.log(`${Object.keys(figures).length - 1} player figures, ${PEOPLE.length - PEOPLE.filter((p) => figures[slug(p.name)]).length} on the placeholder, ${warnings.length} warning(s)`);
