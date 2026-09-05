#!/usr/bin/env node
// Checks builds/falcon/players.js against the poster and the caption rules.
// Exit 1 on any failure; soft warnings do not fail the run.
//   node tools/check-roster.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { EVENTS, PEOPLE, slug, DEFAULT_PLAYER } = createRequire(import.meta.url)(path.join(here, "..", "builds", "falcon", "players.js"));

// The squad: the 16 printed on the poster (1000990425.jpg), captains first,
// then the two columns, plus the players who joined after it was printed.
const POSTER = [
  "Lifin", "Ashna",
  "Nabeela Abdul", "Hamsa", "AnsinaMHaroon", "Shamlik", "RemyaK", "AhamedKabir", "Bajal",
  "PMMuneer", "SakeerSheik", "SinashShajahan", "Basheer", "SarinJalal", "Shameer", "Reas",
  "Sehiya", "Ashiyana", "Amirah", "Firoze Kotta",
];
const STOP = new Set(["the", "of", "and"]);
const LABELS = ["Callsign", "Doctrine", "Verdict"];

const failures = [], warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const uniq = (label, values) => {
  const seen = new Map();
  values.forEach((v, i) => { if (seen.has(v)) fail(`${label} duplicated: "${v}" (entries ${seen.get(v)} and ${i})`); else seen.set(v, i); });
};

// Names match the squad list exactly, in any order.
const names = PEOPLE.map((p) => p.name);
const missing = POSTER.filter((n) => !names.includes(n));
const extra = names.filter((n) => !POSTER.includes(n));
if (missing.length) fail(`squad members missing from players.js: ${missing.join(", ")}`);
if (extra.length) fail(`players not in the squad list: ${extra.join(", ")}`);
if (PEOPLE.length !== POSTER.length) fail(`expected ${POSTER.length} players, found ${PEOPLE.length}`);
if (PEOPLE.filter((p) => p.captain).length !== 2) fail("expected exactly two captains");
if (!PEOPLE.some((p) => p.name === DEFAULT_PLAYER)) fail(`DEFAULT_PLAYER "${DEFAULT_PLAYER}" is not a player`);

uniq("name", names);
uniq("slug", names.map(slug));
uniq("number", PEOPLE.map((p) => p.num));
uniq("initials", PEOPLE.map((p) => p.initials));

// Captions: three labelled lines each, all unique across players, each set names its event.
const allLines = [];
for (const p of PEOPLE) {
  if (!Number.isInteger(p.event) || !EVENTS[p.event]) { fail(`${p.name}: event index ${p.event} out of range`); continue; }
  if (!Array.isArray(p.lines) || p.lines.length !== 3) { fail(`${p.name}: expected 3 caption lines`); continue; }
  p.lines.forEach((ln, i) => {
    if (ln[0] !== LABELS[i]) fail(`${p.name}: line ${i + 1} label is "${ln[0]}", expected "${LABELS[i]}"`);
    if (!ln[1] || !ln[1].trim()) fail(`${p.name}: line ${i + 1} is empty`);
    allLines.push({ who: p.name, text: ln[1] });
  });
  const ev = EVENTS[p.event];
  const terms = `${ev.epic} ${ev.real}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const joined = p.lines.map((l) => l[1]).join(" ").toLowerCase();
  if (!terms.some((t) => new RegExp(`\\b${t}`).test(joined))) fail(`${p.name}: captions never mention their event (${ev.real}); expected one of ${terms.join(", ")}`);
  if (p.frame) {
    const v3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
    if (p.frame.center !== undefined && !v3(p.frame.center)) fail(`${p.name}: frame.center must be three numbers`);
    if (p.frame.up !== undefined && !v3(p.frame.up)) fail(`${p.name}: frame.up must be three numbers`);
    if (p.frame.distScale !== undefined && !(p.frame.distScale > 0)) fail(`${p.name}: frame.distScale must be positive`);
  }
}
uniq("caption", allLines.map((l) => norm(l.text)));

// Soft: two players opening a line with the same three words read as a copy.
const openers = new Map();
for (const l of allLines) {
  const key = norm(l.text).split(" ").slice(0, 3).join(" ");
  if (openers.has(key) && openers.get(key) !== l.who) warn(`${l.who} and ${openers.get(key)} both open a line with "${key} ..."`);
  else openers.set(key, l.who);
}

for (const w of warnings) console.log("warn:", w);
for (const f of failures) console.log("FAIL:", f);
console.log(`${PEOPLE.length} players, ${allLines.length} captions, ${failures.length} failure(s), ${warnings.length} warning(s)`);
process.exit(failures.length ? 1 : 0);
