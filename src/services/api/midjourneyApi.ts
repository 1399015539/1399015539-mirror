import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
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

      // 添加更强的缓存破坏参数
      const urlObj = new URL(url);
      const timestamp = Date.now().toString();
      const random1 = Math.random().toString(36).substring(7);
      const random2 = Math.random().toString(16).substring(2);
      
      urlObj.searchParams.set('_t', timestamp);
      urlObj.searchParams.set('_cb', random1);
      urlObj.searchParams.set('_r', random2);
      urlObj.searchParams.set('_nocache', '1');
      
      // 重试逻辑：最多重试 2 次，但简化处理
      let lastError: any;
      let finalUrl = url; // 初始化 finalUrl
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 每次重试更新缓存破坏参数
          if (attempt > 1) {
            urlObj.searchParams.set('_t', Date.now().toString());
            urlObj.searchParams.set('_cb', Math.random().toString(36).substring(7));
            urlObj.searchParams.set('_retry', attempt.toString());
          }
          
          finalUrl = urlObj.toString();

          // 构建 curl 命令 - 移除可能导致问题的状态码输出
          const curlArgs = [
            `'${finalUrl}'`,
            `-H 'accept: */*'`,
            `-H 'accept-language: zh-CN,zh;q=0.9'`,
            `-H 'content-type: application/json'`,
            `-H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'`,
            `-H 'x-csrf-protection: 1'`,
            `-H 'origin: https://www.midjourney.com'`,
            `-H 'referer: https://www.midjourney.com/'`,
            `-H 'priority: u=1, i'`,
            `-H 'cache-control: no-cache, no-store, must-revalidate'`, // 更强的缓存控制
            `-H 'pragma: no-cache'`,
            `-H 'expires: 0'`, // 立即过期
            `-H 'if-modified-since: Mon, 01 Jan 1990 00:00:00 GMT'`, // 强制刷新
            `-H 'sec-ch-ua: "Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"'`,
            `-H 'sec-ch-ua-mobile: ?0'`,
            `-H 'sec-ch-ua-platform: "macOS"'`,
            `-H 'sec-fetch-dest: empty'`,
            `-H 'sec-fetch-mode: cors'`,
            `-H 'sec-fetch-site: same-origin'`,
            cookieHeader ? `-b '${cookieHeader}'` : '',
            (options as any).method === 'POST' && (options as any).body ? `--data-raw '${(options as any).body}'` : '',
            `-s`, // 静默模式
            `--max-time 30`, // 30秒超时
            `--compressed` // 支持压缩
          ].filter(Boolean);

          const curlCommand = `curl ${curlArgs.join(' ')}`;
          
          if (attempt > 1) {
            logger.info(`[API] 第 ${attempt} 次重试请求: ${finalUrl}`);
            // 重试前等待一小段时间
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.info(`[API] 执行 curl: ${curlCommand}`);
          }
          
          const { stdout, stderr } = await execAsync(curlCommand);
          
          if (stderr) {
            logger.warn(`[API] curl stderr: ${stderr}`);
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