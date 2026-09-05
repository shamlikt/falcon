import pw from 'playwright-core';
const { chromium } = pw;
const exe = process.env.SCROLLCRAFT_CHROME
  || '/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const OUT = process.env.OUT || '.';
const URL = 'http://localhost:4500/roster.html';
const browser = await chromium.launch({ executablePath: exe, headless: true });

const off = (page, id) => page.evaluate(i => { let t = 0, n = document.getElementById(i); while (n) { t += n.offsetTop; n = n.offsetParent; } return t; }, id);

async function run(prefix, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => document.getElementById('arena').classList.contains('is-live'), { timeout: 9000 }).catch(() => {});

  // 1) hero - default subject (PMMuneer)
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${prefix}_hero.png` });

  // 2) dossier captions
  const dTop = await off(page, 'dossier');
  await page.evaluate(y => scrollTo(0, y + Math.round(innerHeight * 0.55)), dTop);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/${prefix}_dossier.png` });

  // 3) the picker
  const sTop = await off(page, 'squad');
  await page.evaluate(y => scrollTo(0, y + 40), sTop);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${prefix}_picker.png` });

  // 4) select AhamedKabir (data-i=1) -> loads their 3D + scrolls to top
  await page.evaluate(() => document.querySelector('.pick[data-i="1"]').click());
  await page.waitForTimeout(600);
  await page.waitForFunction(() => document.getElementById('arena').classList.contains('is-live'), { timeout: 9000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${prefix}_hero2.png` });

  const stats = await page.evaluate(() => ({
    picks: document.querySelectorAll('#squad-grid .pick').length,
    selected: document.querySelector('.pick.is-selected .pick__name')?.textContent,
    rname: document.getElementById('rname').textContent,
    live: document.getElementById('arena').classList.contains('is-live'),
    noOverflowX: document.documentElement.scrollWidth <= innerWidth + 1
  }));
  await page.close();
  return { errs, stats };
}

const d = await run('d', 1440, 900);
const m = await run('m', 390, 780);
await browser.close();
console.log(JSON.stringify({ desktop: d.stats, desktop_errs: d.errs, mobile: m.stats, mobile_errs: m.errs }, null, 2));
