/**
 * ProtocolAdapter - 协议适配器接口定义
 * 
 * 所有 API 标准适配器必须实现此接口。
 * 职责：仅负责业务模型与协议格式之间的转换，不参与业务流程控制。
 */

class ProtocolAdapter {
  constructor() {
    if (new.target === ProtocolAdapter) {
      throw new Error('Cannot instantiate abstract class ProtocolAdapter');
    }
    
    this.name = null;
    this.config = null;
  }

  // ==================== 配置 ====================

  /**
   * 配置适配器
   * @param {Object} config 
   * @param {string} config.endpoint - API 基础 URL
   * @param {string} [config.apiKey] - API Key
   * @param {string} [config.defaultModel] - 默认模型
   */
  configure(config) {
    throw new Error('Method "configure" must be implemented');
  }

  // ==================== URL 构建（协议相关）====================

  /**
   * 构建完整 URL
   * @param {string} path - 相对路径（如 '/chat'）
   * @returns {string} 完整 URL
   */
  buildUrl(path) {
    throw new Error('Method "buildUrl" must be implemented');
  }

  /**
   * 获取聊天端点路径（相对于 base URL）
   * @returns {string} 如 '/chat' 或 '/chat/completions'
   */
  getChatEndpoint() {
    throw new Error('Method "getChatEndpoint" must be implemented');
  }

  /**
   * 获取模型列表端点路径
   * @returns {string} 如 '/models'
   */
  getModelsEndpoint() {
    throw new Error('Method "getModelsEndpoint" must be implemented');
  }

  // ==================== 请求构建 ====================

  /**
   * 构建 HTTP 请求头
   * @param {Object} [customHeaders] - 自定义请求头
   * @returns {Object} 请求头对象
   */
  buildHeaders(customHeaders = {}) {
    throw new Error('Method "buildHeaders" must be implemented');
  }

  /**
   * 构建请求体（业务参数 → 协议格式）
   * @param {Object} params 
   * @param {Array} params.messages - 消息列表（业务模型）
   * @param {string} params.model - 模型名称
   * @param {number} [params.temperature] - 温度参数
   * @param {number} [params.maxTokens] - 最大 token 数
   * @param {boolean} [params.stream] - 是否流式
   * @param {Array} [params.tools] - 工具定义
   * @returns {Object} 协议格式的请求体
   */
  buildRequestBody(params) {
    throw new Error('Method "buildRequestBody" must be implemented');
  }

  // ==================== 响应解析 ====================

  /**
   * 解析非流式响应（协议格式 → 业务模型）
   * @param {Object} data - API 返回的原始数据
   * @returns {Object} 业务模型格式的响应
   * @returns {string} return.content - 回复内容
   * @returns {Array} [return.tool_calls] - 工具调用列表
   * @returns {Object} [return.usage] - Token 使用情况
   */
  parseResponse(data) {
    throw new Error('Method "parseResponse" must be implemented');
  }

  /**
   * 解析流式响应片段
   * @param {Object} data - SSE chunk 数据
   * @returns {Object|null} 流式事件
   * @returns {string} [return.content] - 增量文本
   * @returns {string} [return.reasoning_content] - 增量思考内容
   * @returns {Array} [return.tool_calls] - 增量工具调用
   * @returns {string} [return.finish_reason] - 结束原因
   */
  parseStreamChunk(data) {
    throw new Error('Method "parseStreamChunk" must be implemented');
  }

  // ==================== 模型管理 ====================

  /**
   * 拉取模型列表
   * @param {string} apiEndpoint - API 基础端点
   * @param {string} [apiKey] - API Key
   * @returns {Promise<Array>} 模型列表
   */
  async fetchModels(apiEndpoint, apiKey) {
    throw new Error('Method "fetchModels" must be implemented');
  }

  /**
   * 检测模型能力
   * @param {string} modelName - 模型名称
   * @returns {Promise<Object>} 模型能力
   */
  async detectCapabilities(modelName) {
    return {
      vision: false,
      audio: false,
      streaming: true,
      tools: true
    };
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ProtocolAdapter = ProtocolAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProtocolAdapter;
}
