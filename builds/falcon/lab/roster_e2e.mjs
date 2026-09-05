// End-to-end checks for the Team Falcon roster: per-player URLs, the picker
// as navigation, history, badges, the placeholder path, figure framing, and
// the no-WebGL fallback. Run from builds/falcon with the server on :4500:
//
//   SCROLLCRAFT_CHROME=<chrome> node lab/roster_e2e.mjs
//
// Headless WebGL is SwiftShader, so the page's 70k software budget applies.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { PEOPLE, slug, DEFAULT_PLAYER } = require("../players.js");

const exe = process.env.SCROLLCRAFT_CHROME || "/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const BASE = process.env.ROSTER_URL || "http://localhost:4500/";
const OUT = "lab/roster";
fs.mkdirSync(OUT, { recursive: true });

const manifest = await (await fetch(BASE + "assets/figures.json")).json();
const live = (p) => !!manifest.figures[slug(p.name)];
const expectedDefault = (() => {
  const d = PEOPLE.find((p) => p.name === DEFAULT_PLAYER);
  if (d && live(d)) return d;
  return PEOPLE.find(live) || d;
})();
const liveSlugs = PEOPLE.filter(live).map((p) => slug(p.name));
const placeholderPlayer = PEOPLE.find((p) => !live(p));

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });

async function open(vp, touch) {
  const page = await browser.newPage({ viewport: vp, hasTouch: !!touch });
  const errors = [], splats = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const t = r.failure()?.errorText || ""; if (!/ERR_ABORTED/.test(t)) errors.push("requestfailed " + r.url() + " " + t); });
  page.on("request", (r) => { if (/\.splat/.test(r.url())) splats.push(r.url().replace(BASE, "")); });
  return { page, errors, splats };
}
const ready = (page) => page.waitForFunction(() => {
  const a = document.getElementById("arena");
  return a.classList.contains("is-live") || a.classList.contains("no-gl");
}, null, { timeout: 90000 });
const state = (page) => page.evaluate(() => ({
  rname: document.getElementById("rname").textContent,
  selected: document.querySelector(".pick.is-selected")?.dataset.slug || null,
  current: document.querySelector('.pick[aria-current="page"]')?.dataset.slug || null,
  dossierName: document.querySelector("#dossier-lines .dossier__title--name")?.textContent || null,
  dossierLabel: document.querySelector("#dossier-lines .dossier__label")?.textContent || null,
  rsub: document.getElementById("rsub").textContent,
  badge: document.querySelector(".pick.is-selected .pick__badge")?.textContent || null,
  search: location.search, title: document.title, scrollY: Math.round(scrollY),
}));
const settle = (page, ms = 400) => page.waitForTimeout(ms);

for (const [label, vp, touch] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const { page, errors, splats } = await open(vp, touch);
  const px = (n) => `${label}: ${n}`;

  // 1. Default URL
  await page.goto(BASE, { waitUntil: "load" }); await ready(page); await settle(page);
  let s = await state(page);
  check(px("default player is " + expectedDefault.name), s.rname === expectedDefault.name && s.selected === slug(expectedDefault.name), s.rname);
  check(px("default URL stays clean"), s.search === "", s.search);
  check(px("exactly one splat requested on landing"), splats.length === 1, splats.slice());
  check(px("title names the player"), s.title.startsWith(expectedDefault.name), s.title);

  // 2. Deep link to a live player
  const liveP = PEOPLE.find((p) => live(p) && p !== expectedDefault) || expectedDefault;
  const liveS = slug(liveP.name);
  await page.goto(`${BASE}?player=${liveS}`, { waitUntil: "load" }); await ready(page); await settle(page);
  s = await state(page);
  check(px(`deep link ?player=${liveS} loads the player`), s.rname === liveP.name && s.dossierName === liveP.name && s.current === liveS, { rname: s.rname, dossier: s.dossierName });
  check(px("live badge and subtitle"), s.badge === "3D" && s.rsub === "Respawned. Facing you.", { badge: s.badge, rsub: s.rsub });
  check(px("live figure file requested with a version"), splats.some((u) => u.includes(`${liveS}.splat?v=`)), splats.slice(-1));

  // 3. Deep link to a placeholder player
  if (placeholderPlayer) {
    const phS = slug(placeholderPlayer.name);
    await page.goto(`${BASE}?player=${phS}`, { waitUntil: "load" }); await ready(page); await settle(page);
    s = await state(page);
    check(px(`placeholder player ${placeholderPlayer.name} uses the placeholder figure`), splats.slice(-1)[0]?.includes("avatar.splat"), splats.slice(-1));
    check(px("placeholder badge and subtitle"), s.badge === "Placeholder" && /Placeholder figure/.test(s.rsub), { badge: s.badge, rsub: s.rsub });
    check(px("placeholder page still shows the player's dossier"), s.dossierName === placeholderPlayer.name, s.dossierName);
  }

  // 4. Unknown slug
  await page.goto(`${BASE}?player=nobody`, { waitUntil: "load" }); await ready(page); await settle(page);
  s = await state(page);
  check(px("unknown player falls back to the default and cleans the URL"), s.rname === expectedDefault.name && s.search === "", { rname: s.rname, search: s.search });

  // 7. Cards are links with distinct slugs; no horizontal overflow anywhere
  const cards = await page.evaluate(() => [...document.querySelectorAll("#squad-grid a.pick")].map((a) => ({ href: a.getAttribute("href"), slug: a.dataset.slug })));
  check(px("16 cards, each a link to ?player=<slug>"), cards.length === PEOPLE.length && cards.every((c) => c.href === "?player=" + c.slug) && new Set(cards.map((c) => c.slug)).size === cards.length, cards.length);
  const expectedOrder = [...PEOPLE.filter(live), ...PEOPLE.filter((p) => !live(p))].map((p) => slug(p.name));
  check(px("captured players first, then the rest, in players.js order"), cards.map((c) => c.slug).join(",") === expectedOrder.join(","), cards.slice(0, 6).map((c) => c.slug));
  let overflow = 0;
  for (const id of ["arrival", "dossier", "respawn", "squad", "join"]) {
    await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "start", behavior: "instant" }), id);
    await settle(page, 150);
    overflow = Math.max(overflow, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  }
  check(px("no horizontal overflow"), overflow <= 1, overflow);

  if (label === "desktop") {
    // 5. Picker click + history
    await page.goto(BASE, { waitUntil: "load" }); await ready(page); await settle(page);
    const before = splats.length;
    const target = PEOPLE.find((p) => live(p) && p !== expectedDefault) || PEOPLE.find((p) => p !== expectedDefault);
    const tS = slug(target.name);
    await page.evaluate(() => document.getElementById("squad").scrollIntoView({ block: "start", behavior: "instant" }));
    await settle(page, 300);
    const pickerY = await page.evaluate(() => Math.round(scrollY));
    await page.click(`a.pick[data-slug="${tS}"]`);
    await page.waitForFunction((q) => location.search === q, `?player=${tS}`, { timeout: 5000 });
    await page.waitForFunction(() => scrollY < 5, null, { timeout: 4000 }).catch(() => {});
    await ready(page); await settle(page);
    s = await state(page);
    check(px("picker click routes to the player and scrolls to top"), s.search === `?player=${tS}` && s.rname === target.name && s.scrollY < 5, { search: s.search, rname: s.rname, scrollY: s.scrollY });
    check(px("picker click fetched exactly one more splat"), splats.length === before + 1, splats.slice(before));
    // Back: the browser restores the picker position, so the arena is covered
    // and the figure paints only once it is uncovered. Do not wait for is-live here.
    await page.goBack(); await settle(page, 600);
    s = await state(page);
    check(px("back returns to the previous player"), s.rname === expectedDefault.name && s.search === "", { rname: s.rname, search: s.search });
    check(px("back restores the picker scroll position"), Math.abs(s.scrollY - pickerY) < vp.height, { scrollY: s.scrollY, pickerY });
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" })); await ready(page); await settle(page);
    check(px("figure paints once uncovered after back"), (await state(page)).rname === expectedDefault.name && splats.length === before + 2, splats.slice(before));
    await page.goForward(); await ready(page); await settle(page);
    s = await state(page);
    check(px("forward re-applies the player"), s.rname === target.name && s.search === `?player=${tS}`, { rname: s.rname, search: s.search });

    // 6. Hash anchors do not touch the subject
    const n0 = splats.length;
    await page.click(".hud__cta"); await settle(page, 600);
    await page.goBack(); await settle(page, 600);
    s = await state(page);
    check(px("hash anchor + back leaves the figure alone"), splats.length === n0 && s.rname === target.name, { splats: splats.length - n0, rname: s.rname });

    // 9. No-WebGL
    const b2 = await chromium.launch({ executablePath: exe, headless: true, args: ["--disable-3d-apis"] });
    const p2 = await b2.newPage({ viewport: vp });
    const e2 = [];
    p2.on("pageerror", (e) => e2.push(e.message));
    await p2.goto(`${BASE}?player=${liveS}`, { waitUntil: "load" }); await ready(p2); await settle(p2, 800);
    const ng = await p2.evaluate(() => ({ cls: document.getElementById("arena").className, lines: document.querySelectorAll("#dossier-lines .dossier__line").length, poster: getComputedStyle(document.getElementById("poster")).opacity }));
    check(px("no-WebGL shows the poster and the captions"), /no-gl/.test(ng.cls) && ng.lines === 3 && ng.poster === "1" && e2.length === 0, ng);
    await p2.screenshot({ path: `${OUT}/${label}_nowebgl.png` });
    await b2.close();
  }

  // 8. Gallery: every live figure plus one placeholder, framed and upright
  const gallery = [...liveSlugs, ...(placeholderPlayer ? [slug(placeholderPlayer.name)] : [])];
  for (const gs of gallery) {
    await page.goto(`${BASE}?player=${gs}`, { waitUntil: "load" }); await ready(page);
    await page.waitForFunction(() => {
      const sp = window.FALCON_ROSTER && FALCON_ROSTER.splat();
      return sp && sp.state.count > 0 && sp.state.drawCount >= sp.state.count;
    }, null, { timeout: 120000 }).catch(() => {});
    await settle(page, 600);
    await page.screenshot({ path: `${OUT}/${label}_${gs}.png` });
    const box = await page.evaluate(() => new Promise((resolve) => {
      const sp = FALCON_ROSTER.splat(); if (!sp) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
        for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
          if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        resolve(x1 < 0 ? null : { x0: x0 / c.width, x1: x1 / c.width, y0: y0 / c.height, y1: y1 / c.height, count: sp.state.drawCount });
      };
      img.src = sp.snapshot();
    }));
    if (!box) { check(px(`figure ${gs} rendered`), false, "no pixels"); continue; }
    // Upright and framed: the top of the head sits in the upper half without
    // being clipped, the bust is horizontally centred-to-right, and (when the
    // shoulders are not cropped by the viewport edges, as they are on a phone)
    // the silhouette is taller than it is wide.
    const w = box.x1 - box.x0, h = box.y1 - box.y0, cx = (box.x0 + box.x1) / 2;
    const cropped = box.x0 < 0.05 || box.x1 > 0.95;   // shoulders reaching the edge region
    const ok = box.y0 >= 0.05 && box.y0 <= 0.45 && cx >= 0.3 && cx <= 0.8 && w >= 0.12 && (cropped || w / h < 1.3);
    check(px(`figure ${gs} upright and framed`), ok, { x: [box.x0, box.x1].map((v) => +v.toFixed(2)), y: [box.y0, box.y1].map((v) => +v.toFixed(2)), splats: box.count });
  }

  check(px("no console or page errors"), errors.length === 0, errors);
  await page.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length} checks, ${failures} failure(s). Screenshots in ${OUT}/`);
process.exit(failures ? 1 : 0);
