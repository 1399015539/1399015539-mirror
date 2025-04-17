import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';

puppeteer.use(Stealth());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'cookies', 'default.txt');

const browser = await puppeteer.launch({
  headless: 'new',            // 第一次手动点验证；之后可改 'new'
  defaultViewport: null,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

await page.goto('https://www.midjourney.com/explore?tab=top', {
  waitUntil: 'networkidle2',
  timeout: 0,
});
console.log('👉  如有 Turnstile，请点一次。加载完后自动继续…');
await page.waitForFunction(() => document.readyState === 'complete', { timeout: 0 });

/* 1️⃣ 取 Cookie */
const keep = ['cf_clearance', '__cf_bm', '__Secure-next-auth.session-token'];
const ckLine = (await page.cookies())
  .filter(c => keep.includes(c.name))
  .map(c => `${c.name}=${c.value}`)
  .join('; ');
if (!ckLine.includes('cf_clearance=')) throw new Error('未拿到 cf_clearance');

/* 2️⃣ 取 UA & Sec‑CH‑UA */
const ua = await page.evaluate(() => navigator.userAgent);
const brands = await page.evaluate(() =>
  navigator.userAgentData?.brands?.map(b => `${b.brand};v="${b.version}"`).join(', ') || ''
);
const secLine = brands && `\"${brands}\"`;

/* 3️⃣ 写文件（3 行） */
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `cookie=${ckLine}\n` +
  `ua=${ua}\n` +
  (secLine ? `sec=${secLine}\n` : '')
);
console.log('✅ Cookie & UA 写入完成\n', fs.readFileSync(OUT,'utf8'));
await browser.close();
process.exit();
