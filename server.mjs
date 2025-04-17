import fs from 'fs';
import path from 'path';
import https from 'https';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { exec } from 'child_process';

const PORT = 5443;
const COOKIE_FILE = path.join('cookies', 'default.txt');

function loadHeaders() {
  if (!fs.existsSync(COOKIE_FILE)) return { cookie:'', ua:'', sec:'' };
  const l = fs.readFileSync(COOKIE_FILE, 'utf8').trim().split(/\r?\n/);
  return {
    cookie: l.find(x=>x.startsWith('cookie='))?.slice(7) ?? '',
    ua:     l.find(x=>x.startsWith('ua='))?.slice(3)     ?? '',
    sec:    l.find(x=>x.startsWith('sec='))?.slice(4)    ?? '',
  };
}

const proxy = createProxyMiddleware({
  target: 'https://www.midjourney.com',
  changeOrigin: true,
  secure: true,
  ws: true,
  timeout: 0,
  proxyTimeout: 0,
  on: {
    proxyReq(pReq, req) {
      const { cookie, ua, sec } = loadHeaders();
      pReq.setHeader('cookie', cookie);
      pReq.setHeader('user-agent', ua);
      if (sec) pReq.setHeader('sec-ch-ua', sec);
      pReq.setHeader('accept', 'text/html,application/json;q=0.9,*/*;q=0.8');
      pReq.setHeader('accept-language', 'zh-CN,zh;q=0.9,en;q=0.8');
      console.log('[Req]', req.url, '|ck', cookie.length);
    },
    proxyRes(pRes, req) {
      console.log('[Res]', req.url, '→', pRes.statusCode);
      if (pRes.statusCode === 403) {
        console.log('403 → refresh-cookie.mjs');
        exec('node refresh-cookie.mjs');
      }
      pRes.headers['Access-Control-Allow-Origin'] = '*';
      delete pRes.headers['x-frame-options'];
      delete pRes.headers['content-security-policy'];
      if (pRes.headers.location)
        pRes.headers.location = pRes.headers.location.replace(
          /^https:\/\/www\.midjourney\.com/, '',
        );
    },
  },
});

const app = express();
app.use('/', proxy);
app.use('/cdn-cgi', proxy);

https.createServer({
  key:  fs.readFileSync('cert/localhost-key.pem'),
  cert: fs.readFileSync('cert/localhost.pem'),
}, app).listen(PORT, () =>
  console.log(`🟢  https://localhost:${PORT}/explore?tab=top`));
