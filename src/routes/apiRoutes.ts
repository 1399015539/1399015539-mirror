import { Router } from 'express';
import { ApiController } from '../controllers/apiController.js';
import { validateAccount } from '../middlewares/accountMiddleware.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();
const apiController = new ApiController();

// 请求日志中间件
router.use((req, res, next) => {
    logger.info('[API Route] 收到请求', {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
            origin: req.headers.origin,
            referer: req.headers.referer,
            'user-agent': req.headers['user-agent']
        }
    });
    next();
});

// CORS 预检请求处理
router.options('*', (req, res) => {
    res.status(204).end();
});

// 公开路由 - 不需要账号验证
router.get('/accounts', async (_req, res) => {
    const { AccountManager } = await import('../account/accountManager.js');
    res.json(AccountManager.list());
});

// 需要账号验证的路由
router.use(validateAccount);

// 探索页面数据
router.get('/explore', apiController.getExplore.bind(apiController));

// 模型评分
router.get('/pg/model_ratings', apiController.getModelRatings.bind(apiController));

// 竞赛排名
router.get('/contests/ranking-count', apiController.getContestRanking.bind(apiController));

// Proxima 请求处理
router.all('/proxima/*', (req, res) => {
    logger.info('[API Route] 处理 Proxima 请求', {
        path: req.path,
        method: req.method
    });
    apiController.proxyAny.bind(apiController)(req, res);
});

// 兜底：处理所有其他 API 请求
router.all('*', (req, res) => {
    logger.info('[API Route] 处理通配请求', {
        path: req.path,
        method: req.method
    });
    apiController.proxyAny.bind(apiController)(req, res);
});

// 错误处理中间件
router.use(errorHandler);

export default router; 