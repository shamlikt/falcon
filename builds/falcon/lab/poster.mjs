// Capture the subject plane as a transparent PNG at the landing state, desktop
// and phone, so the no-WebGL and reduced-motion paths show the same composition.
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright-core");
const exe = process.env.SCROLLCRAFT_CHROME || "/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, hasTouch: name === "mobile" });
  const errors = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("requestfailed", r => errors.push("requestfailed: " + r.url() + " " + (r.failure() && r.failure().errorText)));
  await page.goto("http://localhost:4500/", { waitUntil: "load" });
  await page.waitForFunction(() => window.FALCON && FALCON.splat && FALCON.splat.state.drawCount > 0 && FALCON.splat.state.drawCount >= FALCON.splat.state.count && FALCON.splat.state.count > 100000, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ count: FALCON.splat.state.count, draw: FALCON.splat.state.drawCount, yaw: FALCON.splat.state.yaw, dist: FALCON.splat.state.dist }));
  const data = await page.evaluate(() => FALCON.snapshot());
  fs.writeFileSync(`assets/poster-${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  await page.screenshot({ path: `lab/landing-${name}.png` });
  console.log(name, JSON.stringify(info), "errors:", errors.filter(e => !/poster-|favicon/.test(e)));
  await page.close();
}
await browser.close();
