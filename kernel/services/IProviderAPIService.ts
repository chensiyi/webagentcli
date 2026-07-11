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

/** 模型能力的归一化权威结构：各 Provider listModels 统一产出，UI 直接消费 */
export interface ModelInfo {
  id: string;
  name: string;
  created?: number;
  owned_by?: string;
  context_length: number | null;
  max_output_tokens?: number | null;
  modality?: string;
  input_modalities: string[];
  pricing: { prompt: number | null; completion: number | null };
  supports_reasoning: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_audio: boolean;
  supports_video: boolean;
  description?: string | null;
  /** 透传原始 Provider 字段（...m），保留 owned_by / architecture 等扩展信息 */
  [key: string]: any;
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

  /**
   * 模型能力归一化（基类组装公共形状，Provider 差异通过覆写下方 extractor 消解）。
   * 派生类 listModels 直接 `return raws.map(m => this.normalizeModel(m))`。
   */
  protected normalizeModel(m: any): ModelInfo {
    const inputModalities = this.extractInputModalities(m);
    return {
      id: m.id || m.key || '',
      name: m.name || m.id || m.key || '',
      created: m.created ?? undefined,
      owned_by: m.owned_by || m.owner || m.publisher || 'local',
      context_length: m.context_length ?? m.max_context_length ?? null,
      max_output_tokens: m.max_output_tokens ?? null,
      modality: this.extractModality(m, inputModalities),
      input_modalities: inputModalities,
      pricing: this.extractPricing(m),
      supports_reasoning: this.extractSupportsReasoning(m),
      supports_tools: this.extractSupportsTools(m),
      supports_vision: inputModalities.includes('image'),
      supports_audio: inputModalities.includes('audio'),
      supports_video: inputModalities.includes('video'),
      description: m.description || null,
      ...m, // 透传原始字段（owned_by/architecture 等），扩展信息不丢
    };
  }

  /** 输入模态数组：默认兼容 input_modalities / modalities / architecture.input_modalities */
  protected extractInputModalities(m: any): string[] {
    const raw = m?.input_modalities || m?.modalities || m?.architecture?.input_modalities || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((x: any) => String(x).toLowerCase());
  }

  protected extractSupportsReasoning(m: any): boolean {
    return !!(m?.capabilities?.reasoning);
  }

  protected extractSupportsTools(m: any): boolean {
    return !!(m?.capabilities?.toolUse || m?.capabilities?.functionCalling);
  }

  protected extractModality(_m: any, inputModalities: string[]): string {
    return inputModalities.includes('image') ? 'text+image->text' : 'text->text';
  }

  protected extractPricing(m: any): { prompt: number | null; completion: number | null } {
    const p = m?.pricing;
    if (!p) return { prompt: 0, completion: 0 };
    const num = (v: any) => (typeof v === 'string' ? parseFloat(v) : v) || 0;
    return { prompt: num(p.prompt), completion: num(p.completion) };
  }

  async chat(_request: any, _onChunk?: (chunk: any) => void): Promise<StandardResponse> { throw new Error('Not implemented'); }
  async chatStream(_request: any, _onChunk?: (chunk: any) => void): Promise<StandardResponse | null> { throw new Error('Not implemented'); }
  shouldApplyCache(_request: any): boolean { return false; }
  cancel(): void {}
}
export default BaseProviderAPIService;