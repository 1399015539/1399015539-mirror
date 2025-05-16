import fetch from 'node-fetch';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export class MidjourneyApiService {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.defaultHeaders = {
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'referer': 'https://www.midjourney.com/explore',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-csrf-protection': '1',
      'origin': 'http://localhost:3000'
    };
  }

  private async makeRequest(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...this.defaultHeaders,
      ...options.headers
    };

    let retries = config.api.retries;
    while (retries >= 0) {
      try {
        logger.info(`[API] 发送请求: ${url}`, { headers });
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body: options.body ? String(options.body) : undefined
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        logger.info(`[API] 请求成功: ${url}`);
        return data;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[API] 请求失败: ${url}`, { error: errorMessage });
        if (retries === 0) throw error;
        retries--;
        await new Promise(resolve => setTimeout(resolve, config.api.retryDelay * 1000));
      }
    }
  }

  // API 方法
  async getExplore(amount: number, page: number, feed: string): Promise<any> {
    return this.makeRequest(`/api/explore?amount=${amount}&page=${page}&feed=${feed}&_ql=explore`);
  }

  async getModelRatings(): Promise<any> {
    return this.makeRequest('/api/pg/model_ratings');
  }

  async getContestRanking(): Promise<any> {
    return this.makeRequest('/api/contests/ranking-count');
  }

  // 可以根据需要添加更多 API 方法
} 