// Functional checks the scroll harness does not cover: rail overflow, keyboard
// order and visibility, the dial as a scrubber, the callsign preview and the
// join action, horizontal overflow, console errors, and the no-WebGL / no-JS
// fallbacks. Run after shoot.mjs so the two do not fight for the CPU.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright-core");
const exe = process.env.SCROLLCRAFT_CHROME || "/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const URL = "http://localhost:4500/";
const out = [];
const log = (k, v) => { out.push([k, v]); console.log(k.padEnd(34), typeof v === "string" ? v : JSON.stringify(v)); };

async function ready(page) {
  await page.waitForFunction(() => window.FALCON && (!FALCON.splat || (FALCON.splat.state.drawCount >= FALCON.splat.state.count && FALCON.splat.state.count > 1000)), null, { timeout: 120000 });
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });

for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }], ["compact", { width: 360, height: 640 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: label !== "desktop" });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("requestfailed", r => { const t = r.failure()?.errorText || ""; if (!/ERR_ABORTED/.test(t)) errors.push("requestfailed " + r.url() + " " + t); });
  await page.goto(URL, { waitUntil: "load" });
  await ready(page);

  // Horizontal overflow at the top and at every section.
  const ids = ["arrival", "kabeer", "respawn", "way", "squad", "join"];
  let maxOverflow = 0;
  for (const id of ids) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: "start", behavior: "instant" }), id);
    await page.waitForTimeout(150);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    maxOverflow = Math.max(maxOverflow, o);
  }
  log(`${label}: max horizontal overflow px`, maxOverflow);

  // Rail overflow must be a healthy positive number, and the last card reachable.
  const rail = await page.evaluate(() => { const r = document.querySelector(".rail"); return { over: r.scrollWidth - innerWidth, cards: r.querySelectorAll(".card").length }; });
  log(`${label}: rail overflow px`, rail);

  // Page length in viewport-heights.
  log(`${label}: page length (vh)`, await page.evaluate(() => +(document.documentElement.scrollHeight / innerHeight).toFixed(1)));

  // Turntable state at a few scroll positions.
  const states = [];
  for (const f of [0, 0.5, 1.0, 2.0, 3.0, 3.6, 4.0, 4.6, 5.2, 6.0]) {
    await page.evaluate((f) => scrollTo({ top: f * innerHeight, behavior: "instant" }), f);
    await page.waitForTimeout(250);
    states.push(await page.evaluate(() => document.getElementById("arena").getAttribute("data-sc-verify-state")));
  }
  log(`${label}: verify-state samples`, states);

  if (label === "desktop") {
    // Dial drag: scrolls the page.
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(100);
    const svg = await page.$("#dial svg");
    const b = await svg.boundingBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.width / 2 - 4;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 0.9; await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a)); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(200);
    log("desktop: scrollY after dial drag", await page.evaluate(() => Math.round(scrollY)));
    log("desktop: dial aria-valuenow after drag", await page.evaluate(() => document.getElementById("dial").getAttribute("aria-valuenow")));

    // Keyboard order: tab through and record what receives focus and whether it is visible.
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(100);
    const order = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(120);
      order.push(await page.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return "body";
        const r = el.getBoundingClientRect();
        const op = (() => { let e = el, o = 1; while (e && e !== document.body) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o; })();
        const onscreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
        return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} [${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 18)}] on=${onscreen} op=${op.toFixed(2)}`;
      }));
    }
    log("desktop: tab order", order);

    // Callsign preview and the join action.
    await page.evaluate(() => document.getElementById("join").scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(300);
    await page.fill("#callsign", "nyx_9!!");
    log("desktop: plate after typing 'nyx_9!!'", await page.textContent("#plate-name"));
    await page.click("#join-cta");
    await page.waitForTimeout(300);
    log("desktop: join status text", (await page.textContent("#join-status")).trim());
    log("desktop: join cta href", await page.getAttribute("#join-cta", "href"));
  }

  log(`${label}: console/pageerrors`, errors);
  await page.close();
}

// No WebGL: the poster must carry the subject and the page must still read.
{
  const b2 = await chromium.launch({ executablePath: exe, headless: true, args: ["--disable-3d-apis"] });
  const page = await b2.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  log("no-webgl: arena class / poster opacity", await page.evaluate(() => [document.getElementById("arena").className, getComputedStyle(document.getElementById("poster")).opacity, !!(window.FALCON && FALCON.splat)]));
  await page.screenshot({ path: "lab/fallback-nowebgl.png" });
  await page.evaluate(() => scrollTo({ top: innerHeight * 4.2, behavior: "instant" }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "lab/fallback-nowebgl-peak.png" });
  log("no-webgl: pageerrors", errors);
  await b2.close();
}

// No JavaScript: a readable document with the poster in place.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "lab/fallback-nojs.png" });
  await page.screenshot({ path: "lab/fallback-nojs-full.png", fullPage: true });
  log("no-js: h1 text / sections", await page.evaluate(() => [document.querySelector("h1").textContent, document.querySelectorAll("section").length]));
  await ctx.close();
}

await browser.close();
