import fs from 'fs';
import path from 'path';
import https from 'https';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app  = express();
const DIST = 'dist';

/* ---------- 1. 精确静态资源 ---------- */
app.use('/mj/__asset__',
  express.static(DIST, { maxAge: '1y', index: false }));

app.use('/mj/_next',
  express.static(path.join(DIST, '_next'), { maxAge: '1y', index: false }));

/* ---------- 2. 动态 API / WSS ---------- */
const proxyBase = {
  target: 'https://www.midjourney.com',
  changeOrigin: true,
  secure: true,
  headers: { host: 'www.midjourney.com' },
  onProxyRes: (_, res) => {
    res.headers['Access-Control-Allow-Origin'] = '*';
  },
};

app.use('/mj/api',
  createProxyMiddleware({ ...proxyBase, pathRewrite: { '^/mj/api': '/api' } }));

app.use('/mj/ws',
  createProxyMiddleware({ ...proxyBase, ws: true,
    pathRewrite: { '^/mj/ws':  '/ws'  } }));

/* ---------- 3. 兜底路由 ---------- */
app.get(/^\/mj\/(?!(__asset__|_next)\/).*$/, (_, res) =>
  res.type('html').sendFile('index.html', { root: DIST }));

/* ---------- 4. 本地 HTTPS ---------- */
https.createServer({
  key:  fs.readFileSync('cert/localhost-key.pem'),
  cert: fs.readFileSync('cert/localhost.pem'),
}, app).listen(5443, () =>
  console.log('🔗  https://localhost:5443/mj/explore?tab=top'));
