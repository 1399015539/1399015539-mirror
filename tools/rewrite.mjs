import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { load } from 'cheerio';

const SRC = 'mirror';
const OUT = 'dist';

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

for (const file of glob.sync(`${SRC}/**/*.html`)) {
  const htmlSrc = await fs.readFile(file, 'utf8');
  const $ = load(htmlSrc);

  /* 1️⃣ 把官网域名换成 /mj/__asset__ */
  $('*[src], *[href]').each((_, el) => {
    const attr = el.attribs.src ? 'src' : 'href';
    const url  = $(el).attr(attr);
    if (/^https:\/\/www\.midjourney\.com/.test(url)) {
      $(el).attr(attr, url.replace(
        'https://www.midjourney.com', '/mj/__asset__'));
    }
  });

  /* 2️⃣ 注入加强版补丁脚本 */
  $('body').append(`
    <script>
      (() => {
        const swap = (u) => {
          if (typeof u === 'string') {
            return u.replace(/^https:\\/\\/www\\.midjourney\\.com/, '/mj');
          }
          const url = String(u.url || u);
          const fixed = url.replace(/^https:\\/\\/www\\.midjourney\\.com/, '/mj');
          return new Request(fixed, u.clone ? u : undefined);
        };
        const _f = window.fetch;
        window.fetch = (u, o) => _f(swap(u), o);

        const _WS = window.WebSocket;
        window.WebSocket = function(u, p) {
          if (u.startsWith('wss://www.midjourney.com'))
            return new _WS(u.replace('wss://www.midjourney.com','/mj/ws'), p);
          return new _WS(u, p);
        };
      })();
    </script>
  `);

  /* 3️⃣ 把 "/_next/" 改成 "/mj/_next/"（双引号、单引号、绝对 URL 三种） */
  let htmlOut = $.html()
    .replace(/="\/_next\//g,  '="/mj/_next/')
    .replace(/='\/_next\//g,  "='/mj/_next/")
    .replace(/https:\/\/www\.midjourney\.com\/_next\//g, '/mj/_next/');

  const target = path.join(OUT, path.relative(SRC, file));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, htmlOut);
}

/* 4️⃣ 复制非 HTML 资源 */
for (const file of glob.sync(`${SRC}/**/*`, { nodir: true })) {
  if (file.endsWith('.html')) continue;
  const dest = path.join(OUT, path.relative(SRC, file));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(file, dest);
}
