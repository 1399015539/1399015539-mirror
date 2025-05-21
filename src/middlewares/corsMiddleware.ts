import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// 移除 Set-Cookie 响应头的中间件
const removeSetCookieHeader = (req: Request, res: Response, next: NextFunction) => {
  res.removeHeader('set-cookie');
  next();
};

export const corsMiddleware = [
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = config.allowedOrigins || ['http://localhost:3000'];
      
      if (!origin || allowedOrigins.includes(origin)) {
        logger.info(`[CORS] 允许请求来源: ${origin || 'localhost'}`);
        callback(null, true);
      } else {
        logger.warn(`[CORS] 拒绝请求来源: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Cookie'
    ],
    exposedHeaders: [
      'Content-Type',
      'Content-Length'
    ],
    maxAge: 3600,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }),
  removeSetCookieHeader
]; 