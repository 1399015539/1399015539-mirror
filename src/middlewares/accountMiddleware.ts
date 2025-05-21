import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';
import { AccountManager } from '../account/accountManager.js';
import cookie from 'cookie';
import { logger } from '../utils/logger.js';

export const validateAccount = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const raw = req.headers.cookie;
    if (!raw) {
      throw new ApiError(401, '未提供 Cookie');
    }

    const parsed = cookie.parse(raw);
    const accId = parsed['mj_account'];
    if (!accId) {
      throw new ApiError(401, '未选择账号');
    }

    const sess = AccountManager.getCookie(accId);
    if (!sess) {
      throw new ApiError(401, '账号未找到或 cookie 已失效');
    }

    // 将验证后的 session 存储到请求对象中
    req.session = sess;
    logger.info('[Auth] 账号验证成功', { accId });
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(500, '账号验证过程中发生错误'));
    }
  }
}; 