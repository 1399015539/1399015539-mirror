import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import fetch from '../../utils/fetch.js';
import type { RequestInit } from 'node-fetch';

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
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'x-csrf-protection': '1',
      'priority': 'u=1, i'
    };
  }

  public async makeRequest(path: string, options: RequestInit = {}, session?: string): Promise<any> {
    let targetUrl = '';
    
    try {
      // 标准化路径
      let apiPath = path;
      
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
      
      const isProxima = apiPath.includes('proxima.midjourney.com');
      targetUrl = isProxima ? apiPath : `${this.baseUrl}${apiPath}`;
      
      const headers: CustomHeaders = {
        ...this.defaultHeaders,
        'sec-fetch-site': isProxima ? 'same-site' : 'same-origin',
        'referer': 'https://www.midjourney.com/',
        'origin': 'https://www.midjourney.com'
      };

      if (isProxima) {
        headers['content-type'] = 'application/json';
        
        // 从 session cookie 中提取 metrics token
        if (session) {
          const match = session.match(/__Host-Midjourney\.AuthUserTokenV3_i=([^;]+)/);
          if (match) {
            headers['x-metrics-token'] = match[1];
          }
        }
      }

      if (session) {
        headers['cookie'] = session;
      }

      logger.info(`[API] 发送请求: ${targetUrl}`, { 
        headers,
        path: apiPath
      });
      
      const response = await fetch(targetUrl, {
        ...options,
        headers: headers as any
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[API] 请求失败: ${targetUrl}`, { error: errorMessage });
      return {
        error: true,
        message: errorMessage
      };
    }
  }

  // API 方法
  async getExplore(amount: number, page: number, feed: string, session?: string): Promise<any> {
    logger.info('[API] 处理 explore 请求', { amount, page, feed });
    
    return this.makeRequest(
      `/api/explore?amount=${amount}&page=${page}&feed=${feed}&_ql=explore`,
      {},
      session
    );
  }

  async getModelRatings(session?: string): Promise<any> {
    return this.makeRequest('/api/pg/model_ratings', {}, session);
  }

  async getContestRanking(session?: string): Promise<any> {
    return this.makeRequest('/api/contests/ranking-count', {}, session);
  }

  // 可以根据需要添加更多 API 方法
} 