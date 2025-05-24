import { Router } from 'express';
import { ApiController } from '../controllers/apiController.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { logger } from '../utils/logger.js';
import { AccountManager } from '../account/accountManager.js';
import cookie from 'cookie';

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
            'user-agent': req.headers['user-agent'],
            cookie: req.headers.cookie
        }
    });
    next();
});

// CORS 预检请求处理
router.options('*', (req, res) => {
    res.status(204).end();
});

// 账号中间件 - 从 cookie 获取账号 ID
router.use((req, res, next) => {
    // 定义不需要认证的公开路径
    const publicPaths = [
        '/accounts',           // 账号列表
        '/debug/cache-status'  // 调试状态
    ];
    
    // 如果是公开路径，直接放行
    if (publicPaths.includes(req.path)) {
        next();
        return;
    }
    
    const cookies = cookie.parse(req.headers.cookie || '');
    const accountId = cookies.mj_account || 'guest';
    
    logger.info('[Auth] 处理请求认证', { 
        rawCookieHeader: req.headers.cookie,
        parsedAccountId: accountId,
        path: req.path
    });
    
    const accountCookie = AccountManager.getCookie(accountId);
    if (!accountCookie) {
        logger.error('[Auth] 无效的账号 ID', { accountId });
        res.status(401).json({ error: '无效的账号 ID' });
        return;
    }

    // 设置响应头，确保 cookie 能被正确设置
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3030');
    
    // 如果没有 mj_account cookie，设置它
    if (!cookies.mj_account) {
        res.setHeader('Set-Cookie', cookie.serialize('mj_account', accountId, {
            path: '/',
            httpOnly: true,
            secure: false, // 本地开发环境不需要 secure
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 天
        }));
    }

    req.accountId = accountId;
    req.session = accountCookie;
    next();
});

// 探索页面数据
router.get('/explore', apiController.getExplore.bind(apiController));

// 模型评分
router.get('/pg/model_ratings', apiController.getModelRatings.bind(apiController));

// 竞赛排名
router.get('/contests/ranking-count', apiController.getContestRanking.bind(apiController));

// 账号列表 - 必须放在兜底通配之前
router.get('/accounts', (_req, res) => {
    res.json(AccountManager.list());
});

// 调试端点 - 查看缓存状态
router.get('/debug/cache-status', (req, res) => {
    const cookies = cookie.parse(req.headers.cookie || '');
    const accountId = cookies.mj_account || 'guest';
    
    // 注意：这里我们无法直接访问 server.ts 中的 resourceCache
    // 在实际应用中，你可能需要将缓存状态暴露到一个共享模块中
    
    res.json({
        currentAccount: accountId,
        timestamp: Date.now(),
        message: '缓存状态查询功能需要进一步集成'
    });
});

// 清除账号缓存的端点
router.post('/clear-cache/:accountId', (req, res) => {
    const { accountId } = req.params;
    
    if (!AccountManager.getCookie(accountId)) {
        res.status(404).json({ error: '账号不存在' });
        return;
    }
    
    // 这里我们需要访问 server.ts 中的 clearAccountCache 函数
    // 我们可以通过事件或者将函数暴露出来
    logger.info(`[API] 请求清除账号 ${accountId} 的缓存`);
    
    res.json({ 
        success: true, 
        message: `账号 ${accountId} 的缓存清除请求已接收` 
    });
});

// 账号切换端点 - 提供更明确的切换接口
router.post('/switch-account/:accountId', async (req, res) => {
    const { accountId } = req.params;
    
    const accountCookie = AccountManager.getCookie(accountId);
    if (!accountCookie) {
        res.status(404).json({ error: '账号不存在' });
        return;
    }
    
    // 设置账号 cookie
    res.setHeader('Set-Cookie', cookie.serialize('mj_account', accountId, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 // 7 天
    }));
    
    logger.info(`[API] 切换到账号: ${accountId}`);
    
    try {
        // 第一步：清除旧账号的所有缓存（如果有的话）
        const oldCookies = cookie.parse(req.headers.cookie || '');
        const oldAccountId = oldCookies.mj_account;
        if (oldAccountId && oldAccountId !== accountId) {
            logger.info(`[API] 清除旧账号缓存: ${oldAccountId}`);
            // 这里应该清除 oldAccountId 的缓存，但我们需要访问 server.ts 中的缓存
            // 暂时先记录，后面我们会通过其他方式实现
        }
        
        // 第二步：预热新账号 - 发送多个轻量级请求来"激活"新账号的会话
        logger.info(`[API] 开始账号预热: ${accountId}`);
        
        const { MidjourneyApiService } = await import('../services/api/midjourneyApi.js');
        const apiService = new MidjourneyApiService();
        
        // 发送多个预热请求，模拟真实的用户行为
        const warmupRequests = [
            // 1. 用户状态请求
            apiService.makeRequest('/user-mutable-state', { method: 'GET' } as any, accountCookie),
            // 2. 编辑器会话同步
            apiService.makeRequest('/editor-sessions-sync', { method: 'GET' } as any, accountCookie),
            // 3. 竞赛排名（轻量级）
            apiService.makeRequest('/contests-ranking-count', { method: 'GET' } as any, accountCookie)
        ];
        
        const warmupResults = await Promise.allSettled(warmupRequests);
        const successCount = warmupResults.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
        
        logger.info(`[API] 预热完成: ${accountId}, ${successCount}/${warmupRequests.length} 请求成功`);
        
        // 第三步：强制刷新imagine相关的缓存
        logger.info(`[API] 强制刷新imagine缓存: ${accountId}`);
        
        // 获取当前账号的用户ID（从cookie中解析JWT）
        let userId = null;
        try {
            // 从JWT token中提取用户ID
            const authToken = accountCookie.match(/__Host-Midjourney\.AuthUserTokenV3_i=([^;]+)/);
            if (authToken) {
                const token = authToken[1];
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                userId = payload.midjourney_id;
                logger.info(`[API] 解析用户ID: ${userId}`);
            }
        } catch (error) {
            logger.warn(`[API] 无法解析用户ID: ${(error as Error).message}`);
        }
        
        // 第四步：如果有用户ID，发送imagine相关的预热请求
        let imagineWarmupSuccess = false;
        if (userId) {
            try {
                const imagineWarmupResult = await apiService.makeRequest(
                    `/imagine?user_id=${userId}&page_size=1`, // 只请求1条数据作为预热
                    { method: 'GET' } as any,
                    accountCookie
                );
                
                if (imagineWarmupResult && !imagineWarmupResult.error) {
                    imagineWarmupSuccess = true;
                    logger.info(`[API] imagine预热成功: ${accountId}`);
                } else {
                    logger.warn(`[API] imagine预热失败: ${accountId}`, imagineWarmupResult);
                }
            } catch (error) {
                logger.warn(`[API] imagine预热异常: ${accountId}`, { error: (error as Error).message });
            }
        }
        
        // 返回详细的切换结果
        res.json({ 
            success: true, 
            accountId,
            message: '账号切换成功',
            warmup: {
                basic: successCount > 0 ? 'success' : 'failed',
                basicSuccess: successCount,
                basicTotal: warmupRequests.length,
                imagine: imagineWarmupSuccess ? 'success' : 'failed',
                userId: userId
            },
            timestamp: Date.now(),
            // 建议前端执行的动作
            recommendation: {
                shouldRefreshPage: true,
                reason: '确保新账号状态完全生效'
            }
        });
        
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[API] 账号切换处理失败: ${accountId}`, { error: errorMessage });
        
        // 即使预热失败，账号切换仍然算成功，但建议刷新页面
        res.json({ 
            success: true, 
            accountId,
            message: '账号切换成功，但预热可能失败',
            warmup: {
                basic: 'failed',
                imagine: 'failed',
                error: errorMessage
            },
            timestamp: Date.now(),
            recommendation: {
                shouldRefreshPage: true,
                reason: '预热失败，强制刷新页面确保状态正确'
            }
        });
    }
});

// 强制刷新端点 - 清除缓存并重置会话
router.post('/force-refresh', async (req, res) => {
    const cookies = cookie.parse(req.headers.cookie || '');
    const accountId = cookies.mj_account || 'guest';
    
    logger.info(`[API] 强制刷新请求: ${accountId}`);
    
    try {
        // 导入 API 服务进行预热
        const { MidjourneyApiService } = await import('../services/api/midjourneyApi.js');
        const apiService = new MidjourneyApiService();
        
        const accountCookie = AccountManager.getCookie(accountId);
        if (accountCookie) {
            // 发送多个轻量级请求来重置会话状态
            const requests = [
                apiService.makeRequest('/user-mutable-state', {} as any, accountCookie),
                apiService.makeRequest('/contests-ranking-count', {} as any, accountCookie)
            ];
            
            const results = await Promise.allSettled(requests);
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            
            logger.info(`[API] 强制刷新完成: ${accountId}, ${successCount}/${requests.length} 请求成功`);
            
            res.json({
                success: true,
                accountId,
                refreshedRequests: successCount,
                totalRequests: requests.length,
                message: '强制刷新完成'
            });
        } else {
            res.status(400).json({ error: '无效的账号' });
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[API] 强制刷新失败: ${accountId}`, { error: errorMessage });
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            message: '强制刷新失败'
        });
    }
});

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