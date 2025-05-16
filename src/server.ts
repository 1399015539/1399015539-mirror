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
  let url = `https://www.midjourney.com${req.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  
  logger.info(`[Debug] 请求进入 handleResourceRequest: ${req.path}`, {
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    url: req.url,
    method: req.method,
    headers: req.headers
  });

  // 处理 API 请求
  if (req.path.startsWith('/api/')) {
    logger.info(`[API] 处理 API 请求: ${req.path}`);
    // 转发到 API 路由处理
    return apiRoutes(req, res, () => {});
  }
  
  // 处理 Google Fonts 请求
  if (req.path.startsWith('/css2')) {
    url = `https://fonts.googleapis.com${req.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  }
  
  // 处理 Google Tag Manager 请求
  if (req.path === '/gtm.js') {
    url = `https://www.googletagmanager.com${req.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  }
  
  // 处理 CDN 资源请求
  if (req.path.startsWith('/cdn-cgi/') || req.path.startsWith('/4a41d126-') || req.path.startsWith('/8140f81c-') || req.path.startsWith('/be5f45c4-') || req.path.startsWith('/54ff92c3-') || req.path.startsWith('/f1cd8ce1-') || req.path.startsWith('/04a7e85a-') || req.path.startsWith('/669cc353-') || req.path.startsWith('/6429bfda-') || req.path.startsWith('/6c2b1b72-') || req.path.startsWith('/d3a4b904-') || req.path.startsWith('/918df861-') || req.path.startsWith('/231b1ef0-')) {
    url = `https://cdn.midjourney.com${req.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    // 添加必要的请求头
    const headers = new Headers();
    headers.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    headers.append('Referer', 'https://www.midjourney.com/');
    headers.append('Origin', 'https://www.midjourney.com');
    
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`CDN request failed: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/webp';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(buffer));
      return;
    } catch (error: any) {
      logger.error(`[CDN] 资源获取失败: ${url}`, { error: error.message });
      res.status(500).send('Error loading CDN resource');
      return;
    }
  }

  logger.info(`[Proxy] 开始处理请求: ${url}`);
  
  try {
    // 判断资源类型
    const ext = path.extname(req.path).toLowerCase();
    const isStaticResource = /\.(js|css|json|png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/i.test(req.path);
    const isNextJsResource = req.path.startsWith('/_next/static/');
    const isHtmlPage = !isStaticResource && !isNextJsResource;
    const isCloudflareScript = req.path.startsWith('/cdn-cgi/challenge-platform/')
                            && req.path.endsWith('.js');
    const isApiRequest = req.path.startsWith('/api/');
    const isCdnResource = req.path.startsWith('/cdn-cgi/') || req.path.startsWith('/4a41d126-') || req.path.startsWith('/8140f81c-') || req.path.startsWith('/be5f45c4-');
    
    logger.info(`[Resource] 资源类型: ${ext}, 是否HTML页面: ${isHtmlPage}, 是否静态资源: ${isStaticResource}, 是否Next.js资源: ${isNextJsResource}, 是否Cloudflare脚本: ${isCloudflareScript}, 是否API请求: ${isApiRequest}, 是否CDN资源: ${isCdnResource}, 路径: ${req.path}`);

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
      waitUntil: 'networkidle',
      extractContent: false,
      returnHtml: isHtmlPage,
      waitForNavigation: true,
      disableMedia: false
    });

    if (!result.content?.[0]?.text) {
      throw new Error('获取资源失败: 内容为空');
    }

    // 提取实际内容
    let content = result.content[0].text;
    
    // 如果是 JavaScript 文件，重写 API 请求 URL
    if (ext === '.js') {
      // 重写完整的 API 请求 URL
      content = content.replace(
        /(https?:\/\/www\.midjourney\.com\/api\/[^"'\s)]*)/g,
        (match) => {
          const newUrl = match.replace('https://www.midjourney.com/api/', 'http://localhost:3000/api/');
          logger.info(`[JS] 重写完整 URL: ${match} -> ${newUrl}`);
          return newUrl;
        }
      );
      // 重写相对路径的 API 请求
      content = content.replace(
        /(fetch|axios\.get|axios\.post|axios\.put|axios\.delete)\s*\(\s*['"]\/api\//g,
        '$1("http://localhost:3000/api/'
      );
      // 额外处理字符串中的完整 URL
      content = content.replace(
        /['"](https?:\/\/www\.midjourney\.com\/api\/[^'"]+)['"]/g,
        (match, url) => {
          const newUrl = url.replace('https://www.midjourney.com/api/', 'http://localhost:3000/api/');
          logger.info(`[JS] 重写字符串中的 URL: ${url} -> ${newUrl}`);
          return `"${newUrl}"`;
        }
      );
      logger.info(`[JS] 重写 JavaScript 文件中的 API 请求 URL: ${req.path}`);
    }
    
    // 如果是静态资源、CDN资源或 Cloudflare 脚本，直接使用原始内容
    if (isStaticResource || isNextJsResource || isCloudflareScript || isCdnResource) {
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
    logger.error(`[Error] 资源代理失败: ${req.path}`, { 
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
    corsMiddleware(req, res, next);
  });

  // 添加 CORS 中间件
  app.use(corsMiddleware);

  // 处理所有请求
  app.all('*', (req, res, next) => {
    // 如果是 API 请求，转发到 API 路由
    if (req.path.startsWith('/api/')) {
      logger.info(`[API] 转发 API 请求: ${req.path}`);
      return apiRoutes(req, res, next);
    }
    // 否则，继续处理其他请求
    next();
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
