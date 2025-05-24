import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import type { RequestInit } from 'node-fetch';

const execAsync = promisify(exec);

interface CustomHeaders {
  [key: string]: string;
}

export class MidjourneyApiService {
  private baseUrl: string;
  private defaultHeaders: CustomHeaders;

  constructor() {
    this.baseUrl = 'https://www.midjourney.com';
    this.defaultHeaders = {
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'x-csrf-protection': '1',
      'priority': 'u=1, i',
      'origin': 'https://www.midjourney.com'
    };
  }

  public async makeRequest(path: string, options: RequestInit = {}, session?: string): Promise<any> {
    try {
      // 构建 API URL
      const apiPath = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`;
      const targetUrl = `${this.baseUrl}${apiPath}`;
      
      logger.info(`[API] 处理请求: ${targetUrl}`);
      console.log(`cookie: ${session}`);
      
      // 使用 curl 避免 Node.js fetch 被 Cloudflare 检测
      return await this.makeRequestWithCurl(targetUrl, options, session);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[API] 请求失败: ${path}`, { error: errorMessage });
      return {
        error: true,
        message: errorMessage
      };
    }
  }

  private async makeRequestWithCurl(url: string, options: RequestInit = {}, session?: string): Promise<any> {
    try {
      // 过滤危险 cookie
      let cookieHeader = '';
      if (session) {
        const sanitizedCookie = session
          .split(';')
          .map((kv) => kv.trim())
          .filter((kv) => {
            const name = kv.split('=')[0].trim();
            return !/^(_?cfuvid|__cf_bm|cf_clearance)$/i.test(name);
          })
          .join('; ');
        cookieHeader = sanitizedCookie;
      }

      // 基于 cookie 生成会话标识，确保不同账号有不同的缓存
      const sessionId = cookieHeader ? 
        'sess_' + crypto.createHash('md5').update(cookieHeader).digest('hex').substring(0, 8) : 
        'no_session';

      // 生成基于账号的用户代理变化
      const baseUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
      const accountUA = sessionId !== 'no_session' ? 
        `${baseUA} SessionID/${sessionId}` : baseUA;

      // 检查是否是imagine接口，如果是则使用最激进的缓存破坏策略
      const isImagineRequest = url.includes('/imagine');
      
      // 添加更强的缓存破坏参数
      const urlObj = new URL(url);
      const timestamp = Date.now().toString();
      const random1 = Math.random().toString(36).substring(7);
      const random2 = Math.random().toString(16).substring(2);
      const random3 = Math.random().toString(36).substring(2, 10);
      const sessionNonce = crypto.createHash('md5').update(`${sessionId}-${timestamp}`).digest('hex').substring(0, 12);
      
      // 基础缓存破坏参数
      urlObj.searchParams.set('_t', timestamp);
      urlObj.searchParams.set('_cb', random1);
      urlObj.searchParams.set('_r', random2);
      urlObj.searchParams.set('_nocache', '1');
      urlObj.searchParams.set('_sid', sessionId); // 会话标识
      urlObj.searchParams.set('_nonce', sessionNonce); // 会话随机数
      urlObj.searchParams.set('_v', random3); // 额外版本参数
      urlObj.searchParams.set('_bust', Date.now().toString(36)); // 额外时间戳
      
      // 对imagine接口使用额外的缓存破坏策略
      if (isImagineRequest) {
        const imagineRandom1 = crypto.randomUUID().split('-')[0];
        const imagineRandom2 = Math.random().toString(36) + Math.random().toString(16);
        const imagineTimestamp = (Date.now() + Math.floor(Math.random() * 1000)).toString();
        
        urlObj.searchParams.set('_imagine_key', imagineRandom1);
        urlObj.searchParams.set('_imagine_nonce', imagineRandom2);
        urlObj.searchParams.set('_imagine_ts', imagineTimestamp);
        urlObj.searchParams.set('_account_hash', crypto.createHash('md5').update(`${sessionId}-${timestamp}`).digest('hex').substring(0, 16));
        urlObj.searchParams.set('_refresh', 'force');
        urlObj.searchParams.set('_bypass', Date.now().toString(16));
        logger.info(`[API] 使用imagine特殊缓存破坏策略: ${imagineRandom1}`);
      }
      
      // 重试逻辑：最多重试 2 次，但简化处理
      let lastError: any;
      let finalUrl = url; // 初始化 finalUrl
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 每次重试更新缓存破坏参数
          if (attempt > 1) {
            const retryTimestamp = Date.now().toString();
            urlObj.searchParams.set('_t', retryTimestamp);
            urlObj.searchParams.set('_cb', Math.random().toString(36).substring(7));
            urlObj.searchParams.set('_retry', attempt.toString());
            urlObj.searchParams.set('_force', retryTimestamp); // 强制参数
            urlObj.searchParams.set('_attempt', `${attempt}_${Date.now()}`); // 尝试标识
            
            // imagine重试时的额外参数
            if (isImagineRequest) {
              urlObj.searchParams.set('_imagine_retry', attempt.toString());
              urlObj.searchParams.set('_imagine_force', Date.now().toString(36));
              urlObj.searchParams.set('_no_cache_please', 'true');
            }
          }
          
          finalUrl = urlObj.toString();

          // 构建 curl 命令 - 增加缓冲区大小并添加更强的缓存破坏头
          const curlArgs = [
            `'${finalUrl}'`,
            `-H 'accept: */*'`,
            `-H 'accept-language: zh-CN,zh;q=0.9'`,
            `-H 'content-type: application/json'`,
            `-H 'user-agent: ${accountUA}'`, // 使用账号特定的 UA
            `-H 'x-csrf-protection: 1'`,
            `-H 'origin: https://www.midjourney.com'`,
            `-H 'referer: https://www.midjourney.com/'`,
            `-H 'priority: u=1, i'`,
            `-H 'cache-control: no-cache, no-store, must-revalidate'`, // 更强的缓存控制
            `-H 'pragma: no-cache'`,
            `-H 'expires: 0'`, // 立即过期
            `-H 'if-modified-since: Mon, 01 Jan 1990 00:00:00 GMT'`, // 强制刷新
            `-H 'if-none-match: *'`, // 忽略 ETag
            `-H 'x-session-id: ${sessionId}'`, // 会话标识头部
            `-H 'x-session-nonce: ${sessionNonce}'`, // 会话随机数头部
            `-H 'x-cache-bust: ${timestamp}'`, // 缓存破坏头部
            `-H 'x-request-id: ${crypto.randomUUID()}'`, // 唯一请求ID
            `-H 'sec-ch-ua: "Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"'`,
            `-H 'sec-ch-ua-mobile: ?0'`,
            `-H 'sec-ch-ua-platform: "macOS"'`,
            `-H 'sec-fetch-dest: empty'`,
            `-H 'sec-fetch-mode: cors'`,
            `-H 'sec-fetch-site: same-origin'`
          ];

          // 对imagine接口添加额外的缓存破坏头部
          if (isImagineRequest) {
            curlArgs.push(
              `-H 'x-imagine-session: ${sessionId}'`,
              `-H 'x-imagine-timestamp: ${timestamp}'`,
              `-H 'x-imagine-unique: ${crypto.randomUUID()}'`,
              `-H 'x-force-fresh: true'`,
              `-H 'x-bypass-cache: ${Date.now()}'`,
              `-H 'x-no-304: please'`
            );
          }

          // 添加cookie和POST数据
          if (cookieHeader) curlArgs.push(`-b '${cookieHeader}'`);
          if ((options as any).method === 'POST' && (options as any).body) {
            curlArgs.push(`--data-raw '${(options as any).body}'`);
          }

          // 添加curl选项
          curlArgs.push(
            `-s`, // 静默模式
            `--max-time 30`, // 30秒超时
            `--compressed` // 支持压缩
          );

          const curlCommand = `curl ${curlArgs.join(' ')}`;
          
          if (attempt > 1) {
            logger.info(`[API] 第 ${attempt} 次重试请求: ${finalUrl}`);
            // 重试前等待一小段时间
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.info(`[API] 执行 curl: ${curlCommand}`);
          }
          
          // 增加缓冲区大小到 50MB，以处理大响应
          const { stdout, stderr } = await execAsync(curlCommand, {
            maxBuffer: 50 * 1024 * 1024, // 50MB 缓冲区
            timeout: 35000 // 35秒超时
          });
          
          if (stderr) {
            logger.warn(`[API] curl stderr: ${stderr}`);
          }

          // 检查响应是否为空
          if (!stdout || stdout.trim() === '') {
            throw new Error('响应为空');
          }

          // 直接解析响应，不再检测状态码
          const data = JSON.parse(stdout);
          
          // 检查是否为错误响应
          if (data && typeof data === 'object' && data.error) {
            logger.warn(`[API] 服务器返回错误 (尝试 ${attempt}/2): ${data.message || '未知错误'}`);
            if (attempt < 2) {
              lastError = new Error(data.message || '服务器返回错误');
              continue; // 重试
            }
          }

          logger.info(`[API] curl 请求成功 (尝试 ${attempt}/2): ${finalUrl}`);
          return data;
          
        } catch (error: unknown) {
          lastError = error;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // 如果是JSON解析错误或其他错误，重试
          if (attempt < 2) {
            logger.warn(`[API] 第 ${attempt} 次尝试失败，准备重试: ${errorMessage}`);
            continue;
          } else {
            logger.error(`[API] 所有重试都失败了: ${finalUrl}`, { error: errorMessage });
            break;
          }
        }
      }
      
      throw lastError;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[API] curl 请求失败: ${url}`, { error: errorMessage });
      throw error;
    }
  }

  async getExplore(amount: number, page: number, feed: string, session?: string): Promise<any> {
    logger.info('[API] 处理 explore 请求', { amount, page, feed });
    
    const params = new URLSearchParams({
      amount: String(amount),
      page: String(page),
      feed: String(feed),
      _ql: 'explore'
    });
    
    return this.makeRequest(
      `/explore?${params.toString()}`,
      {},
      session
    );
  }

  async getModelRatings(session?: string): Promise<any> {
    return this.makeRequest('pg/model_ratings', {}, session);
  }

  async getContestRanking(session?: string): Promise<any> {
    return this.makeRequest('contests/ranking-count', {}, session);
  }

  // 可以根据需要添加更多 API 方法
} 