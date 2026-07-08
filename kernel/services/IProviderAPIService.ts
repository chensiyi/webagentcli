export interface CacheOptions {
  enabled: boolean;
  sessionCacheKey?: string;
}

import { Settings } from '../models/Settings.js';
import { ToolCall } from '../models/Tool.js';

/** 统一的 Provider 响应格式 */
export interface StandardResponse {
  content: string;
  reasoning_content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage: any;
  model: string;
}

export class BaseProviderAPIService {
  name: string;
  config: Settings;
  cacheOptions: CacheOptions;
  abortController: AbortController | null;

  constructor() {
    this.name = '';
    this.config = new Settings();
    this.cacheOptions = { enabled: false };
    this.abortController = null;
  }

  configure(settings: Settings): void {
    this.config = settings;
  }

  /**
   * 构建 HTTP 请求头部。
   * @param request 可选的请求对象，含 headers 字段供浏览器相关信息注入（如 Referer）
   */
  buildHeaders(request?: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    // 合并 request.headers（由 Shell 层传入浏览器相关头，kernel 不直接引用 window/chrome）
    if (request?.headers) {
      Object.assign(headers, request.headers);
    }
    return headers;
  }

  async chat(_request: any, _onChunk?: (chunk: any) => void): Promise<StandardResponse> { throw new Error('Not implemented'); }
  async chatStream(_request: any, _onChunk?: (chunk: any) => void): Promise<StandardResponse | null> { throw new Error('Not implemented'); }
  shouldApplyCache(_request: any): boolean { return false; }
  cancel(): void {}
}
export default BaseProviderAPIService;