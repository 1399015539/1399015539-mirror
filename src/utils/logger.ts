import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 创建控制台输出格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

// 创建日志记录器
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // 文件输出
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log')
    })
  ]
});

// 添加控制台输出（仅添加一次）
logger.add(new winston.transports.Console({
  format: consoleFormat
}));

// 添加请求追踪功能
export function logRequest(req: any, message: string, meta: any = {}) {
  logger.info(message, {
    method: req.method,
    url: req.url,
    ...meta
  });
}

// 添加错误追踪功能
export function logError(error: Error, context: any = {}) {
  logger.error(`${error.message}`, {
    stack: error.stack,
    ...context
  });
}

// 添加性能追踪功能
export function logPerformance(operation: string, duration: number, meta: any = {}) {
  logger.info(`Performance: ${operation} (${duration}ms)`, meta);
}
