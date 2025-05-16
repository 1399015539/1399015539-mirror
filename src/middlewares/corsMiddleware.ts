import cors from 'cors';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const corsMiddleware = cors({
  ...config.cors,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  origin: (origin, callback) => {
    logger.info(`[CORS] 处理请求来源: ${origin}`);
    // 允许所有来源
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Referer',
    'Cookie',
    'x-csrf-protection',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'Cache-Control',
    'Pragma',
    'Accept-Language'
  ],
  exposedHeaders: [
    'Content-Type',
    'Content-Length',
    'ETag',
    'Last-Modified',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers'
  ],
  maxAge: 86400 // 预检请求结果缓存 24 小时
}); 