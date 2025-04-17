// tools/fetch-with-puppeteer.mjs
import fs from 'fs';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';

puppeteer.use(Stealth());

const START = 'https://www.midjourney.com/explore?tab=top';
const ASSET_BASE = '/_next/static/';

(async () => {
  /* 0️⃣ 读取 cookie */
  if (!fs.existsSync('cookie.txt')) throw new Error('cookie.txt 不存在');
  const rawCookie = fs.readFileSync('cookie.txt', 'utf8').trim();
  if (!rawCookie.includes('cf_clearance'))
    throw new Error('cookie.txt 必须包含 cf_clearance');

  /* 1️⃣ 启动浏览器（用 Stealth） */
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ cookie: rawCookie });
  console.log('✅ 已注入 Cookie');

  /* 2️⃣ 导航并等待真正页面跑出来 */
  await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 0 });

  // 若仍被跳到 Cloudflare 验证页，再等一会＋截图调试
  if (page.url().includes('/cdn-cgi/')) {
    console.log('⚠️ 仍在 Cloudflare Challenge，等待自动跳转…');
    await page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle0' });
  }

  /* 3️⃣ 再确认一次地址 */
  if (!page.url().startsWith('https://www.midjourney.com/explore')) {
    await page.screenshot({ path: 'cf_block.png' });
    throw new Error(
      `仍未进入 Explore 页面，已截图 cf_block.png，检查 cookie 是否失效`
    );
  }

  /* 4️⃣ 拿 Next.js 数据 */
  await page.waitForSelector('#__NEXT_DATA__', { timeout: 60000 });
  const nextData = await page.evaluate(() =>
    JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
  );
  console.log('Next.js buildId =', nextData.buildId);

  /* 5️⃣ 先把最终 HTML 抓下来 —— 必须在导航其它 URL 之前 */
  const mainHtml = await page.content();
  const urls = await page.evaluate((ASSET_BASE) => {
    const s = new Set();
    document
      .querySelectorAll('script[src],link[rel=preload][href]')
      .forEach((el) => {
        const u = el.src || el.href;
        if (u.includes(ASSET_BASE)) s.add(u);
      });
    return Array.from(s);
  }, ASSET_BASE);

  console.log('发现静态文件', urls.length, '个');
  await mkdir('mirror/_next/static', { recursive: true });

  for (const u of urls) {
    // 不再用 page.goto —— 直接在 node 侧 fetch，或用浏览器 fetch
    const resp = await page.evaluate(async (assetUrl) => {
      const r = await fetch(assetUrl);
      const buf = new Uint8Array(await r.arrayBuffer());
      return Array.from(buf);          // 通过 JSON 传回来
    }, u);
    const buffer = Buffer.from(resp);
    const rel = decodeURIComponent(
      new URL(u).pathname.replace(ASSET_BASE, '')
    );
    const file = path.join('mirror/_next/static', rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);  
    console.log('✓', rel);
  }

  /* 6️⃣ 保存 index.html */
  await writeFile('mirror/index.html', mainHtml);
  console.log('🎉 抓取完成，文件已存 mirror/');
  await browser.close();
})();
