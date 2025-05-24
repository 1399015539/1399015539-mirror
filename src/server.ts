import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, toolHandlers } from "./tools/index.js";
import { logger } from "./utils/logger.js";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import cors from 'cors';
import { config } from './config/index.js';
import { corsMiddleware } from './middlewares/corsMiddleware.js';
import apiRoutes from './routes/apiRoutes.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookie from 'cookie';
import { AccountManager } from './account/accountManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建缓存实例，默认缓存时间为1小时
const resourceCache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 600, // 每10分钟检查一次过期缓存
  useClones: false  // 禁用克隆以提高性能
});

// 清除特定账号的所有缓存
function clearAccountCache(accountId: string) {
  const keys = resourceCache.keys();
  const accountKeys = keys.filter(key => key.startsWith(`${accountId}:`));
  accountKeys.forEach(key => resourceCache.del(key));
  logger.info(`[Cache] 清除账号 ${accountId} 的 ${accountKeys.length} 个缓存项`);
}

// CORS 配置
const corsOptions = {
  origin: true, // 允许所有来源
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie', 'x-csrf-protection'],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// 处理资源请求
async function handleResourceRequest(req: express.Request, res: express.Response) {
  const startTime = Date.now();
  
  // 标准化请求路径
  let pathStr = req.path;
  
  logger.info(`[Debug] 请求进入 handleResourceRequest: ${pathStr}`, {
    originalUrl: req.originalUrl,
    path: pathStr,
    method: req.method
  });

  // API 请求不应该被这个函数处理，但是作为安全措施
  if (pathStr.startsWith('/api/')) {
    logger.warn(`[Warning] API 请求被 handleResourceRequest 处理，这不应该发生: ${pathStr}`);
    res.status(500).json({ error: 'API 请求路由错误' });
    return;
  }

  // 获取用户账号和对应的登录cookie
  let userSession = '';
  const cookies = cookie.parse(req.headers.cookie || '');
  const accountId = cookies.mj_account || 'guest';
  const accountCookie = AccountManager.getCookie(accountId);
  
  if (accountCookie) {
    userSession = accountCookie;
    logger.info(`[Auth] 使用账号 ${accountId} 的cookie抓取资源`);
  } else {
    logger.warn(`[Auth] 账号 ${accountId} 未找到cookie，使用游客模式`);
  }

  // 构建目标 URL
  let url = '';
  if (pathStr.startsWith('/css2')) {
    url = `https://fonts.googleapis.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  } else if (pathStr === '/gtm.js') {
    url = `https://www.googletagmanager.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  } else {
    url = `https://www.midjourney.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  }

  logger.info(`[Proxy] 开始处理请求: ${url}`);
  
  try {
    // 判断资源类型
    const ext = path.extname(pathStr).toLowerCase();
    const isStaticResource = /\.(js|css|json|png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/i.test(pathStr);
    const isNextJsResource = pathStr.startsWith('/_next/static/');
    const isHtmlPage = !isStaticResource && !isNextJsResource;
    const isCloudflareScript = pathStr.startsWith('/cdn-cgi/challenge-platform/') && pathStr.endsWith('.js');
    
    // 检查缓存
    const cacheKey = `${accountId}:${url}`;
    const cachedResource = resourceCache.get(cacheKey);
    if (cachedResource) {
      logger.info(`[Cache] 命中缓存: ${cacheKey}`);
      
      // 设置正确的 Content-Type 和缓存控制
      let contentType = 'text/plain';
      let cacheControl = 'public, max-age=3600';
      
      switch (ext) {
        case '.js':
          contentType = 'application/javascript; charset=utf-8';
          break;
        case '.css':
          contentType = 'text/css; charset=utf-8';
          break;
        case '.json':
          contentType = 'application/json; charset=utf-8';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.svg':
          contentType = 'image/svg+xml';
          break;
        case '.woff':
          contentType = 'font/woff';
          break;
        case '.woff2':
          contentType = 'font/woff2';
          break;
        case '.ttf':
          contentType = 'font/ttf';
          break;
        default:
          if (isHtmlPage) {
            contentType = 'text/html; charset=utf-8';
          }
      }
      
      res.set({
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff'
      });
      
      res.send(cachedResource);
      return;
    }

    // 获取 fetch_url 工具
    const fetchHandler = toolHandlers['fetch_url'];
    if (!fetchHandler) {
      throw new Error('fetch_url tool not found');
    }

    // 获取资源内容
    const result = await fetchHandler({
      url,
      timeout: 30000,
      extractContent: false,
      returnHtml: true,
      disableMedia: false,
      headers: userSession ? { 'cookie': userSession } : undefined
    });

    if (!result.content?.[0]?.text) {
      throw new Error('获取资源失败: 内容为空');
    }

    let content = result.content[0].text;
    
    // 处理 HTML 页面
    if (isHtmlPage) {
      logger.info(`[HTML] 处理 HTML 页面: ${pathStr}`);
      
      // 移除可能阻止脚本执行的内联 CSP
      content = content.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
      
      // 在 <head> 开始标签后注入拦截器
      const interceptorCode = `
        <script>
          (function() {
            console.log('[Interceptor] 初始化');

            // ----------------- URL 重写工具 -----------------
            function rewriteUrl(raw) {
              try {
                // 只重写指向 www.midjourney.com 的请求
                return raw
                  .replace(/^https?:\/\/(?:www\.)?midjourney\.com/, 'http://localhost:3000');
              } catch (_) { return raw; }
            }
            // -------------------------------------------------

            // 保存原始 fetch / XHR
            const _fetch = window.fetch;
            const _XHR = window.XMLHttpRequest;

            // fetch 拦截
            window.fetch = function(input, init = {}) {
              let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
              const newUrl = rewriteUrl(url);
              if (newUrl !== url) {
                console.log('[Interceptor] fetch', url, '->', newUrl);
                input = typeof input === 'string' ? newUrl : new Request(newUrl, input);
              }
              return _fetch.call(this, input, { ...init, credentials: 'include' });
            };

            // XHR 拦截
            window.XMLHttpRequest = class extends _XHR {
              open(method, url, ...args) {
                const newUrl = rewriteUrl(url);
                if (newUrl !== url) {
                  console.log('[Interceptor] XHR', url, '->', newUrl);
                  url = newUrl;
                }
                return super.open(method, url, ...args);
              }
            };
          })();
        </script>
      `;
      
      // 在 <head> 标签后注入拦截器代码
      // content = content.replace(/<head>/, '<head>' + interceptorCode);
    }
    
    // 处理 JavaScript 文件 —— 直接替换域名，提高命中率
    if (ext === '.js') {
      const beforeLen = content.length;

      // 子域保持路径前缀，其他全部指向根
      content = content
        .replace(/https?:\/\/(?:www\.)?midjourney\.com/gi, 'http://localhost:3000');

      const afterLen = content.length;
      if (afterLen !== beforeLen) {
        logger.info(`[JS] 已替换域名 → ${pathStr}`);
      }
    }
    
    // 缓存并返回资源
    resourceCache.set(cacheKey, content);
    
    // 设置正确的 Content-Type 和缓存控制
    let contentType = 'text/plain';
    let cacheControl = 'public, max-age=3600';
    
    switch (ext) {
      case '.js':
        contentType = 'application/javascript; charset=utf-8';
        break;
      case '.css':
        contentType = 'text/css; charset=utf-8';
        break;
      case '.json':
        contentType = 'application/json; charset=utf-8';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.woff':
        contentType = 'font/woff';
        break;
      case '.woff2':
        contentType = 'font/woff2';
        break;
      case '.ttf':
        contentType = 'font/ttf';
        break;
      default:
        if (isHtmlPage) {
          contentType = 'text/html; charset=utf-8';
        }
    }
    
    res.set({
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff'
    });
    
    res.send(content);
    
  } catch (error: any) {
    logger.error(`[Error] 资源代理失败: ${pathStr}`, { error: error.message });
    res.status(500).send('Error loading resource');
  }
}

export function createServer() {
  const app = express();
  const PORT = config.server.port;

  logger.info(`[Server] 开始初始化服务器...`);

  // 添加请求日志中间件
  app.use((req, res, next) => {
    const startTime = Date.now();
    logger.info(`[Request] ${req.method} ${req.path}`, {
      url: req.url,
      headers: req.headers,
      query: req.query
    });
    
    res.on('finish', () => {
      const processingTime = Date.now() - startTime;
      logger.info(`[Response] ${req.method} ${req.path} - ${res.statusCode} (${processingTime}ms)`, {
        contentType: res.getHeader('content-type'),
        contentLength: res.getHeader('content-length')
      });
    });
    
    next();
  });

  // 处理 OPTIONS 请求 - 放在最前面
  app.options('*', (req, res, next) => {
    logger.info(`[CORS] 处理预检请求: ${req.method} ${req.path}`);
    corsMiddleware.forEach(middleware => middleware(req, res, next));
  });

  // 添加 CORS 中间件
  app.use(corsMiddleware);

  // 解析请求体，支持 JSON 和表单请求
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 直接挂载 /api 路由（包含 GET/POST/OPTIONS 等）- 放在最前面处理所有 API 请求
  app.use(
    '/api',
    (req: Request, res: Response, next: NextFunction) => {
      // 标准化请求路径
      req.url = req.url.replace(/^\/+/, '/');
      
      // 移除任何可能的 localhost:3000 引用
      req.url = req.url.replace(/(?:https?:\/\/)?localhost:3000/g, '');
      
      // 移除重复的 /api/
      req.url = req.url.replace(/\/api\/+api\//g, '/api/');
      
      // 移除路径中的重复斜杠
      req.url = req.url.replace(/\/+/g, '/');
      
      const targetUrl = `https://www.midjourney.com${req.url}`;
      logger.info(`代理 API 请求: ${req.method} ${req.url} -> ${targetUrl}`);
      next();
    },
    apiRoutes
  );

  /* ------------------------------------------------------------------
   * 自定义静态站点 (账号选择页等)
   * public-self 目录仅存放我们自己的页面, 不应被 handleResourceRequest 抓取覆盖
   * ------------------------------------------------------------------ */

  const selfStaticDir = path.join(__dirname, '../public-self');
  app.use(express.static(selfStaticDir));

  // 根路径返回账号选择页
  app.get('/', (_req, res) => {
    res.sendFile(path.join(selfStaticDir, 'index.html'));
  });

  // 处理静态资源请求
  app.get('/_next/static/*', handleResourceRequest);

  // 处理 Cloudflare 挑战平台脚本
  app.get('/cdn-cgi/challenge-platform/scripts/jsd/main.js', (req, res) => {
    logger.info(`[Stub] short-circuit ${req.path}`);
    const stub = '{}';
    res.type('application/javascript')
      .set('Cache-Control', 'public, max-age=31536000')
      .end(stub);
  });
  
  // 处理 Google Tag Manager 请求
  app.get('/gtm.js', handleResourceRequest);
  
  // 处理所有其他请求 - 放在最后
  app.get('*', handleResourceRequest);

  // 错误处理中间件
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`[Error] ${err.message}`, { 
      error: err.message, 
      stack: err.stack,
      path: req.path,
      method: req.method
    });
    res.status(500).send('Internal Server Error');
  });

  // 启动 HTTP 服务器
  app.listen(PORT, () => {
    logger.info(`[HTTP] 服务器运行在 http://localhost:${PORT}`);
  });

  // 创建 MCP 服务器
  const server = new Server(
    {
      name: "browser-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info("[Tools] 列出可用工具");
    return {
      tools,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const handler = toolHandlers[toolName];

    if (!handler) {
      throw new Error(`未知工具: ${toolName}`);
    }

    return handler(request.params.arguments);
  });

  return server;
}
