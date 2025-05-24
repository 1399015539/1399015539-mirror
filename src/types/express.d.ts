import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      accountId?: string;
      session?: string;
    }
  }
}

export {}; 