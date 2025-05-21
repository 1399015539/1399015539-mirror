import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ApiError) {
    logger.error('[Error] API错误', {
      path: req.path,
      statusCode: err.statusCode,
      message: err.message,
      isOperational: err.isOperational
    });

    return res.status(err.statusCode).json({
      error: true,
      message: err.message
    });
  }

  // 未知错误
  logger.error('[Error] 未知错误', {
    path: req.path,
    error: err.message,
    stack: err.stack
  });

  res.status(500).json({
    error: true,
    message: '服务器内部错误'
  });
}; 