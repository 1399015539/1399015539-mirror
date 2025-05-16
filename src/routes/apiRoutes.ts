import { Router } from 'express';
import { ApiController } from '../controllers/apiController.js';

const router = Router();
const apiController = new ApiController();

// 探索页面数据
router.get('/explore', apiController.getExplore.bind(apiController));

// 模型评分
router.get('/pg/model_ratings', apiController.getModelRatings.bind(apiController));

// 竞赛排名
router.get('/contests/ranking-count', apiController.getContestRanking.bind(apiController));

export default router; 