import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const corsMiddleware = [
    (req: Request, res: Response, next: NextFunction) => {
        const origin = req.headers.origin || 'http://localhost:3030';
        
        // 允许的域名
        const allowedOrigins = [
            'http://localhost:3030',
            'http://127.0.0.1:3030'
        ];

        if (allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            logger.info('[CORS] 允许请求来源:', origin);
        } else {
            logger.warn('[CORS] 拒绝请求来源:', origin);
            return res.status(403).json({ error: 'Not allowed by CORS' });
        }

        // 允许凭证
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        
        // 允许的请求头
        res.setHeader('Access-Control-Allow-Headers', [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin',
            'Cookie',
            'x-csrf-protection'
        ].join(', '));

        // 允许的请求方法
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        
        // 缓存预检请求结果
        res.setHeader('Access-Control-Max-Age', '86400');

        // 处理预检请求
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        next();
    }
]; 