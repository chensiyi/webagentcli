/**
 * Provider API Service 接口规范
 *
 * 定义所有 AI Provider 服务必须实现的标准接口。
 * chat() 和 chatStream() 统一返回 Promise<StandardResponse>，
 * 内部完成协议解析，Controller 直接操作 ToolCall[] 对象。
 *
 * StandardResponse:
 * {
 *   content: string,
 *   toolCalls: ToolCall[],
 *   reasoning_content: string,
 *   finishReason: string | null,
 *   usage: object | null,
 *   model: string | null
 * }
 */
class IProviderAPIService {
  constructor() {
    if (new.target === IProviderAPIService) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    this.name = 'unknown';
    this.config = null;
    this.abortController = null;

    // === Provider 端前缀缓存支持 ===
    // 按 sessionId 作为 cache key，Provider 可以在会话多轮交互中复用前缀 KV 缓存
    // - 命中后 token 成本与首 token 延迟可下降 50-90%
    // - 默认开启，Provider 内部决定是否可应用
    this.cacheOptions = {
      enabled: true,         // 是否启用缓存
      sessionCacheKey: null, // 调用时由 ChatController 注入
      ttlSeconds: 600,       // 缓存生存时间（各 Provider 实现可调整）
      minPrefixTokens: 1024  // 小于此 token 数的前缀不缓存，避免不划算
    };
  }

  /**
   * 配置服务
   * @param {Object} config
   * @param {string} config.endpoint
   * @param {string} [config.apiKey]
   * @param {string} [config.defaultModel]
   */
  configure(config) {
    throw new Error('Method not implemented: configure');
  }

  /**
   * 发送聊天请求（非流式）
   * @param {MessagesRequest} request
   * @returns {Promise<StandardResponse>}
   */
  chat(request) {
    throw new Error('Method not implemented: chat');
  }

  /**
   * 发送聊天请求（流式）
   * @param {MessagesRequest} request
   * @param {Function} onChunk - (chunk: {content, reasoning_content}) => void，实时 UI 更新
   * @returns {Promise<StandardResponse>} 流结束后的完整响应，含 toolCalls: ToolCall[]
   */
  chatStream(request, onChunk) {
    throw new Error('Method not implemented: chatStream');
  }

  /**
   * 取消正在进行的请求
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 列出可用模型
   * @returns {Promise<Array>}
   */
  listModels() {
    throw new Error('Method not implemented: listModels');
  }

  /**
   * 获取单个模型详情
   * @param {string} modelId
   * @returns {Promise<Object>}
   */
  getModelDetails(modelId) {
    throw new Error('Method not implemented: getModelDetails');
  }
}

window.IProviderAPIService = IProviderAPIService;