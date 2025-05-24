import { Request, Response } from 'express';
import { MidjourneyApiService } from '../services/api/midjourneyApi.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../middlewares/errorHandler.js';

export class ApiController {
  private apiService: MidjourneyApiService;

  constructor() {
    this.apiService = new MidjourneyApiService();
  }

  async getExplore(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 explore 请求', {
        query: req.query,
        path: req.path,
        session: req.session ? '(cookie已设置)' : '(无cookie)'
      });
      
      const { amount = '50', page = '0', feed = 'top_week' } = req.query;
      const data = await this.apiService.getExplore(
        Number(amount),
        Number(page),
        String(feed),
        req.session
      );

      res.json(data);
    } catch (error) {
      logger.error('[Controller] explore 请求失败', { error });
      throw new ApiError(500, '获取探索数据失败');
    }
  }

  async getModelRatings(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 model_ratings 请求', {
        session: req.session ? '(cookie已设置)' : '(无cookie)'
      });
      const data = await this.apiService.getModelRatings(req.session);
      res.json(data);
    } catch (error) {
      logger.error('[Controller] model_ratings 请求失败', { error });
      throw new ApiError(500, '获取模型评分失败');
    }
  }

  async getContestRanking(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 contest_ranking 请求', {
        session: req.session ? '(cookie已设置)' : '(无cookie)'
      });
      const data = await this.apiService.getContestRanking(req.session);
      res.json(data);
    } catch (error) {
      logger.error('[Controller] contest_ranking 请求失败', { error });
      throw new ApiError(500, '获取竞赛排名失败');
    }
  }

  async proxyAny(req: Request, res: Response) {
    try {
      const apiPath = req.url;
      logger.info('[Controller] 通配代理 API 请求: ' + apiPath, {
        session: req.session ? '(cookie已设置)' : '(无cookie)'
      });
      
      const options: RequestInit = {
        method: req.method as RequestInit['method'],
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      };
      
      const data = await this.apiService.makeRequest(apiPath, options, req.session);
      
      res.json(data);
    } catch (error) {
      logger.error('[Controller] 通配代理失败', { error, path: req.path });
      throw new ApiError(502, '代理请求失败');
    }
  }
} 