// Contact sheet without ffmpeg: lay the harness shots out in an HTML grid with
// their scroll position and act, then screenshot the grid.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright-core");
const exe = process.env.SCROLLCRAFT_CHROME || "/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const dir = path.resolve(process.argv[2] || "lab/shots");
const cols = parseInt(process.argv[3] || "6", 10);
const report = fs.existsSync(path.join(dir, "report.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")) : [];
const rows = Array.isArray(report) ? report : (report.report || report.shots || []);
const files = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort();
const items = files.map((f, i) => {
  const r = rows[i] || {};
  const label = `${f.replace(".png", "")}  y=${r.y ?? "?"}  ${r.act ?? ""} ${r.pct != null ? r.pct + "%" : ""}`;
  return `<figure><img src="${f}"><figcaption>${label}</figcaption></figure>`;
});
const html = `<!doctype html><style>body{margin:0;background:#111;color:#ddd;font:11px monospace}
.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}figure{margin:0}img{width:100%;display:block;border:1px solid #333}figcaption{padding:2px 0 0}</style>
<div class="g">${items.join("")}</div>`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
// Served over http rather than inlined: 35 base64 screenshots in one document
// is enough to take the renderer down.
fs.writeFileSync(path.join(dir, "sheet.html"), html);
const rel = path.relative(process.cwd(), dir).split(path.sep).join("/");
await page.goto(`http://localhost:4500/${rel}/sheet.html`, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(dir, "sheet.png"), fullPage: true });
await browser.close();
console.log("sheet:", path.join(dir, "sheet.png"), files.length, "shots");
