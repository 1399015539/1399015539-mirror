import { Request, Response } from 'express';
import { MidjourneyApiService } from '../services/api/midjourneyApi.js';
import { logger } from '../utils/logger.js';

export class ApiController {
  private apiService: MidjourneyApiService;

  constructor() {
    this.apiService = new MidjourneyApiService();
  }

  async getExplore(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 explore 请求');
      const { amount = '50', page = '0', feed = 'top' } = req.query;
      const data = await this.apiService.getExplore(Number(amount), Number(page), String(feed));
      res.json(data);
    } catch (error) {
      logger.error('[Controller] explore 请求失败', { error });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getModelRatings(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 model_ratings 请求');
      const data = await this.apiService.getModelRatings();
      res.json(data);
    } catch (error) {
      logger.error('[Controller] model_ratings 请求失败', { error });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getContestRanking(req: Request, res: Response) {
    try {
      logger.info('[Controller] 处理 contest_ranking 请求');
      const data = await this.apiService.getContestRanking();
      res.json(data);
    } catch (error) {
      logger.error('[Controller] contest_ranking 请求失败', { error });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
} 