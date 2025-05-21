import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, toolHandlers } from "./tools/index.js";
import { logger } from "./utils/logger.js";
import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import cors from 'cors';
import { config } from './config/index.js';
import { corsMiddleware } from './middlewares/corsMiddleware.js';
import apiRoutes from './routes/apiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建缓存实例，默认缓存时间为1小时
const resourceCache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 600, // 每10分钟检查一次过期缓存
  useClones: false  // 禁用克隆以提高性能
});

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
  
  // 如果路径中包含多个斜杠，将其规范化为单个斜杠
  pathStr = pathStr.replace(/\/+/g, '/');
  
  // 移除路径中可能存在的 localhost:3000
  pathStr = pathStr.replace(/^\/+localhost:3000/g, '');
  
  // 构建目标 URL
  let url = '';
  if (pathStr.startsWith('/api/')) {
    // API 请求直接转发到本地
    logger.info(`[API] 处理 API 请求: ${pathStr}`);
    return apiRoutes(req, res, () => {});
  } else if (pathStr.startsWith('/css2')) {
    // Google Fonts 请求
    url = `https://fonts.googleapis.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  } else if (pathStr === '/gtm.js') {
    // Google Tag Manager 请求
    url = `https://www.googletagmanager.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  } else {
    // Midjourney 请求
    url = `https://www.midjourney.com${pathStr}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  }
  
  logger.info(`[Debug] 请求进入 handleResourceRequest: ${pathStr}`, {
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: pathStr,
    url: req.url,
    method: req.method,
    headers: req.headers,
    targetUrl: url
  });

  logger.info(`[Proxy] 开始处理请求: ${url}`);
  
  try {
    // 判断资源类型
    const ext = path.extname(pathStr).toLowerCase();
    const isStaticResource = /\.(js|css|json|png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/i.test(pathStr);
    const isNextJsResource = pathStr.startsWith('/_next/static/');
    const isHtmlPage = !isStaticResource && !isNextJsResource;
    const isCloudflareScript = pathStr.startsWith('/cdn-cgi/challenge-platform/') && pathStr.endsWith('.js');
    const isApiRequest = pathStr.startsWith('/api/');
    
    logger.info(`[Resource] 资源类型: ${ext}, 是否HTML页面: ${isHtmlPage}, 是否静态资源: ${isStaticResource}, 是否Next.js资源: ${isNextJsResource}, 是否Cloudflare脚本: ${isCloudflareScript}, 是否API请求: ${isApiRequest}, 路径: ${pathStr}`);

    // 检查缓存
    const cachedResource = resourceCache.get(url);
    if (cachedResource) {
      logger.info(`[Cache] 命中缓存: ${url}`);
      const processingTime = Date.now() - startTime;
      logger.info(`[Proxy] 缓存资源处理完成: ${url}, 耗时: ${processingTime}ms`);
      
      // 设置正确的 Content-Type 和缓存控制
      let contentType = 'text/plain';
      let cacheControl = 'public, max-age=31536000';
      
      switch (ext) {
        case '.js':
          contentType = 'application/javascript';
          cacheControl = 'public, max-age=86400';
          break;
        case '.css':
          contentType = 'text/css';
          cacheControl = 'public, max-age=86400';
          break;
        case '.json':
          contentType = 'application/json';
          cacheControl = 'public, max-age=3600';
          break;
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.svg':
          contentType = `image/${ext.substring(1)}`;
          cacheControl = 'public, max-age=31536000';
          break;
        case '.woff':
        case '.woff2':
        case '.ttf':
          contentType = `font/${ext.substring(1)}`;
          cacheControl = 'public, max-age=31536000';
          break;
      }
      
      res.type(contentType);
      res.set('Cache-Control', cacheControl);
      res.set('ETag', `"${Buffer.from(url).toString('base64')}"`);
      res.send(cachedResource);
      return;
    }

    // 获取 fetch_url 工具
    const fetchHandler = toolHandlers['fetch_url'];
    if (!fetchHandler) {
      throw new Error('fetch_url tool not found');
    }

    // 调用工具获取资源
    const result = await fetchHandler({
      url,
      timeout: 30000,
      extractContent: false,
      returnHtml: true,
      disableMedia: false
    });

    if (!result.content?.[0]?.text) {
      throw new Error('获取资源失败: 内容为空');
    }

    // 提取实际内容
    let content = result.content[0].text;
    
    // 如果是 JavaScript 文件，重写 API 请求 URL
    if (ext === '.js') {
      logger.info(`[JS] 开始处理 JavaScript 文件: ${pathStr}`);
      
      // 1. 重写完整的 API URL（包括带引号和不带引号的）
      content = content.replace(
        /https?:\/\/(?:www\.|proxima\.)?midjourney\.com\/api\/[^"'\s)]+/g,
        (match) => {
          // 如果 URL 已经包含 localhost:3000，不要再重写
          if (match.includes('localhost:3000')) {
            return match;
          }
          const apiPath = '/api/' + match.split('/api/')[1];
          const newUrl = `http://localhost:3000${apiPath}`;
          logger.info(`[JS] 重写完整 URL: ${match} -> ${newUrl}`);
          return newUrl;
        }
      );

      // 2. 重写相对路径的 API 请求（支持更多引号类型）
      content = content.replace(
        /(['"`])(?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\//g,
        (match, quote) => {
          // 如果已经包含 localhost:3000，不要再重写
          if (match.includes('localhost:3000')) {
            return match;
          }
          return `${quote}http://localhost:3000/api/`;
        }
      );

      // 3. 重写 URL 构造（支持更多参数形式）
      content = content.replace(
        /new\s+URL\s*\(\s*(['"`])((?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\/[^'"`]+)\1/g,
        (match, quote, path) => {
          // 如果已经包含 localhost:3000，不要再重写
          if (match.includes('localhost:3000')) {
            return match;
          }
          const apiPath = path.includes('/api/') ? '/api/' + path.split('/api/')[1] : path;
          return `new URL(${quote}http://localhost:3000${apiPath}${quote}`;
        }
      );

      // 4. 重写 window.location（支持更多方法）
      content = content.replace(
        /window\.location(?:\.href\s*=|\.replace\s*\(\s*|\.assign\s*\(\s*|\.href\.includes\s*\(\s*)(['"`])((?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\/[^'"`]+)\1/g,
        (_, quote, path) => {
          const apiPath = path.includes('/api/') ? path.split('/api/')[1] : path;
          return `window.location.href = ${quote}http://localhost:3000/api/${apiPath}${quote}`;
        }
      );

      // 5. 重写 fetch 调用（支持更多参数形式）
      content = content.replace(
        /fetch\s*\(\s*(['"`])((?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\/[^'"`]+)\1/g,
        (_, quote, path) => {
          const apiPath = path.includes('/api/') ? path.split('/api/')[1] : path;
          return `fetch(${quote}http://localhost:3000/api/${apiPath}${quote}`;
        }
      );

      // 6. 重写 axios 调用（支持更多方法和参数形式）
      content = content.replace(
        /axios(?:\[['"`](get|post|put|delete|patch)['"`]\]|\.(get|post|put|delete|patch))\s*\(\s*(['"`])((?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\/[^'"`]+)\3/g,
        (_, method1, method2, quote, path) => {
          const method = method1 || method2;
          const apiPath = path.includes('/api/') ? path.split('/api/')[1] : path;
          return `axios.${method}(${quote}http://localhost:3000/api/${apiPath}${quote}`;
        }
      );

      // 7. 重写 jQuery 调用（支持更多方法和参数形式）
      content = content.replace(
        /\$\.(?:(get|post|ajax)\s*\(\s*|ajax\s*\(\s*\{\s*url\s*:\s*)(['"`])((?:https?:\/\/(?:www\.|proxima\.)?midjourney\.com)?\/api\/[^'"`]+)\2/g,
        (_, method, quote, path) => {
          const apiPath = path.includes('/api/') ? path.split('/api/')[1] : path;
          return method ? 
            `$.${method}(${quote}http://localhost:3000/api/${apiPath}${quote}` :
            `$.ajax({ url: ${quote}http://localhost:3000/api/${apiPath}${quote}`;
        }
      );

      // 8. 添加增强版的请求拦截器
      const interceptorCode = `
        // Midjourney API 请求拦截器
        (function() {
          // 保存原始的请求方法
          const origFetch = window.fetch;
          const origXHR = window.XMLHttpRequest;
          
          // 辅助函数：检查和重写 URL
          function rewriteApiUrl(url) {
            try {
              if (url.includes('/api/') || url.includes('midjourney.com/api/')) {
                const urlObj = new URL(url, window.location.origin);
                const apiPath = urlObj.pathname + urlObj.search;
                return 'http://localhost:3000' + apiPath;
              }
            } catch (e) {
              console.error('[Interceptor] URL 重写错误:', e);
            }
            return url;
          }
          
          // 辅助函数：添加必要的请求头
          function addRequiredHeaders(headers = {}) {
            return {
              ...headers,
              'Origin': 'http://localhost:3000',
              'Referer': 'http://localhost:3000/',
              'Accept': '*/*',
              'Accept-Language': 'zh-CN,zh;q=0.9',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-origin',
              'x-csrf-protection': '1'
            };
          }
          
          // 重写 fetch
          window.fetch = function(input, init = {}) {
            let url = typeof input === 'string' ? input : input.url;
            const newUrl = rewriteApiUrl(url);
            
            if (newUrl !== url) {
              console.log('[Interceptor] 重写 fetch 请求:', url, '->', newUrl);
              input = typeof input === 'string' ? newUrl : new Request(newUrl, input);
              init.headers = addRequiredHeaders(init.headers);
              init.credentials = 'include';
            }
            
            return origFetch.call(this, input, init);
          };
          
          // 重写 XMLHttpRequest
          window.XMLHttpRequest = function() {
            const xhr = new origXHR();
            const origOpen = xhr.open;
            
            xhr.open = function(method, url, ...args) {
              const newUrl = rewriteApiUrl(url);
              
              if (newUrl !== url) {
                console.log('[Interceptor] 重写 XHR 请求:', url, '->', newUrl);
                xhr.addEventListener('readystatechange', () => {
                  if (xhr.readyState === 1) {
                    Object.entries(addRequiredHeaders()).forEach(([key, value]) => {
                      xhr.setRequestHeader(key, value);
                    });
                  }
                });
                url = newUrl;
              }
              
              return origOpen.call(this, method, url, ...args);
            };
            
            return xhr;
          };
          
          // 监听动态添加的脚本
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'SCRIPT' && node.src && 
                    (node.src.includes('/api/') || node.src.includes('midjourney.com/api/'))) {
                  node.src = rewriteApiUrl(node.src);
                  console.log('[Interceptor] 重写动态脚本 src:', node.src);
                }
              });
            });
          });
          
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
          
          console.log('[Interceptor] API 请求拦截器已启动');
        })();
      `;

      // 在文件开头插入拦截器代码
      content = interceptorCode + content;

      logger.info(`[JS] JavaScript 文件处理完成: ${pathStr}`);
    }
    
    // 如果是静态资源、CDN资源或 Cloudflare 脚本，直接使用原始内容
    if (isStaticResource || isNextJsResource || isCloudflareScript) {
      // 设置正确的 Content-Type 和缓存控制
      let contentType = 'text/plain';
      let cacheControl = 'public, max-age=31536000';
      
      switch (ext) {
        case '.js':
          contentType = 'application/javascript';
          cacheControl = 'public, max-age=86400';
          break;
        case '.css':
          contentType = 'text/css';
          cacheControl = 'public, max-age=86400';
          break;
        case '.json':
          contentType = 'application/json';
          cacheControl = 'public, max-age=3600';
          break;
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.svg':
          contentType = `image/${ext.substring(1)}`;
          cacheControl = 'public, max-age=31536000';
          break;
        case '.woff':
        case '.woff2':
        case '.ttf':
          contentType = `font/${ext.substring(1)}`;
          cacheControl = 'public, max-age=31536000';
          break;
      }

      // 如果是 Cloudflare 脚本，记录详细日志
      if (isCloudflareScript) {
        logger.info(`[Cloudflare] 处理脚本内容: ${url}`, {
          contentLength: content.length,
          firstChars: content.substring(0, 100)
        });
      }

      // 缓存静态资源
      resourceCache.set(url, content);
      
      // 设置响应头
      res.type(contentType);
      res.set('Cache-Control', cacheControl);
      res.set('ETag', `"${Buffer.from(url).toString('base64')}"`);
      
      const processingTime = Date.now() - startTime;
      logger.info(`[Proxy] 请求处理完成: ${url}, 耗时: ${processingTime}ms`);
      
      res.send(content);
      return;
    }

    // 处理 HTML 内容
    if (isHtmlPage) {
      // 设置响应头
      res.type('text/html');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', `"${Buffer.from(url).toString('base64')}"`);
      
      const processingTime = Date.now() - startTime;
      logger.info(`[Proxy] 请求处理完成: ${url}, 耗时: ${processingTime}ms`);
      
      res.send(content);
      return;
    }

    // 其他情况
    res.type('text/plain');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', `"${Buffer.from(url).toString('base64')}"`);
    
    const processingTime = Date.now() - startTime;
    logger.info(`[Proxy] 请求处理完成: ${url}, 耗时: ${processingTime}ms`);
    
    res.send(content);
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    logger.error(`[Error] 资源代理失败: ${pathStr}`, { 
      error: error.message, 
      stack: error.stack,
      processingTime 
    });
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

  // 直接挂载 /api 路由（包含 GET/POST/OPTIONS 等）- 放在最前面处理所有 API 请求
  app.use('/api', apiRoutes);

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
