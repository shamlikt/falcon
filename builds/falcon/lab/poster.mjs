// Render the no-WebGL posters (assets/poster-desktop.png, assets/poster-mobile.png)
// from the placeholder figure at full splat count, at the landing camera, for
// the two reference viewports. Run from builds/falcon with the server on :4500:
//
//   SCROLLCRAFT_CHROME=<chrome> node lab/poster.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const exe = process.env.SCROLLCRAFT_CHROME || "/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const BASE = process.env.ROSTER_URL || "http://localhost:4500/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: name === "mobile" });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.FALCON_ROSTER && Object.keys(FALCON_ROSTER.figures()).length > 0, null, { timeout: 60000 });
  // A fresh renderer on an offscreen canvas of the viewport's size, full count,
  // the placeholder file, the landing camera. The page's own renderer keeps its
  // software budget; this one does not, so the poster matches a real GPU frame.
  const dataUrl = await page.evaluate(([w, h, mobile]) => new Promise((resolve, reject) => {
    const CFG = FALCON_ROSTER.config, figs = FALCON_ROSTER.figures();
    const ph = figs.avatar;
    const cv = document.createElement("canvas");
    cv.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;visibility:hidden`;
    document.body.appendChild(cv);
    const prof = mobile ? CFG.mobile : CFG.desktop;
    const sp = FalconSplat.create(cv, { center: CFG.center, up: CFG.up, fov: CFG.fov, accent: CFG.accent, maxDpr: 1, maxCount: Infinity, scatter: CFG.scatter });
    let dist = prof.dist;
    if (prof.fitWidth) dist = Math.max(prof.dist, prof.fitWidth / (2 * Math.tan((CFG.fov * Math.PI / 180) / 2) * (w / h)));
    sp.set({ yaw: CFG.startYaw, pitch: CFG.pitch, dist, shift: prof.shift, assemble: 1 });
    let done = false;
    sp.on("progress", (p) => { if (p >= 1 && !done) setTimeout(() => {
      const poll = () => { if (sp.state.drawCount >= sp.state.count && sp.state.count > 0) { done = true; resolve(sp.snapshot("image/png")); } else setTimeout(poll, 100); };
      poll(); }, 200); });
    sp.load(ph.file + "?v=" + ph.rev).catch(reject);
    setTimeout(() => reject(new Error("timeout")), 120000);
  }), [vp.width, vp.height, name === "mobile"]);
  fs.writeFileSync(`assets/poster-${name}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`wrote assets/poster-${name}.png (${vp.width}x${vp.height})`);
  await page.close();
}
await browser.close();
