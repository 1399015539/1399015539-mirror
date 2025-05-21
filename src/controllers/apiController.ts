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
        url: req.url
      });
      
      const { amount = '50', page = '0', feed = 'top' } = req.query;
      
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
      logger.info('[Controller] 处理 model_ratings 请求');
      const data = await this.apiService.getModelRatings(req.session);
      res.json(data);
    } catch (error) {
      logger.error('[Controller] model_ratings 请求失败', { error });
      throw new ApiError(500, '获取模型评分失败');
    }
  }

  async getContestRanking(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 contest_ranking 请求');
      const data = await this.apiService.getContestRanking(req.session);
      res.json(data);
    } catch (error) {
      logger.error('[Controller] contest_ranking 请求失败', { error });
      throw new ApiError(500, '获取竞赛排名失败');
    }
  }

  // 通配代理：兜底转发未显式声明的接口
  async proxyAny(req: Request, res: Response) {
    try {
      // 标准化 API 路径
      let apiPath = req.url;
      
      // 移除开头的重复斜杠
      apiPath = apiPath.replace(/^\/+/, '/');
      
      // 移除 localhost:3000
      apiPath = apiPath.replace(/\/+localhost:3000\/+/g, '/');
      
      // 确保路径以单个 /api/ 开头
      if (!apiPath.startsWith('/api/')) {
        apiPath = '/api' + apiPath;
      }
      
      // 移除重复的 /api/
      apiPath = apiPath.replace(/\/api\/+api\//g, '/api/');
      
      logger.info('[Controller] 通配代理 API 请求: ' + apiPath);
      
      const data = await this.apiService.makeRequest(apiPath, {}, req.session);
      res.json(data);
    } catch (error) {
      logger.error('[Controller] 通配代理失败', { error, path: req.url });
      throw new ApiError(502, '代理请求失败');
    }
  }
} 