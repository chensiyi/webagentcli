/**
 * Provider API Service 接口规范
 * 
 * 定义所有 AI Provider 服务必须实现的标准接口
 * 包括：OpenAI、LM Studio、Ollama、OpenRouter、Anthropic 等
 * 
 * 这是 Services 层的核心抽象层
 * 采用类继承模式（类似 C++）
 */

/**
 * IProviderAPIService 基类
 * 
 * 所有具体的 Provider 服务实现都必须继承此基类
 */
class IProviderAPIService {
  constructor() {
    if (new.target === IProviderAPIService) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    
    this.name = 'unknown';
    this.config = null;
    this.abortController = null;
  }
  
  /**
   * 配置服务
   * @param {Object} config - 配置对象
   * @param {string} config.endpoint - API 端点
   * @param {string} [config.apiKey] - API Key（可选）
   * @param {string} [config.defaultModel] - 默认模型
   */
  configure(config) {
    throw new Error('Method not implemented: configure');
  }
  
  /**
   * 构建 API URL（子类可重写）
   * @param {string} path - 路径
   * @returns {string} 完整的 URL
   */
  buildUrl(path) {
    throw new Error('Method not implemented: buildUrl');
  }
  
  /**
   * 构建请求头（子类可重写）
   * @returns {Object} 请求头对象
   */
  buildHeaders() {
    throw new Error('Method not implemented: buildHeaders');
  }
  
  /**
   * 格式化消息（子类可重写）
   * @param {Array} messages - 消息数组
   * @returns {Array} 格式化后的消息数组
   */
  formatMessages(messages) {
    throw new Error('Method not implemented: formatMessages');
  }
  
  /**
   * 构建请求体（子类可重写）
   * @param {Object} params - 请求参数
   * @returns {Object} 请求体对象
   */
  buildRequestBody(params) {
    throw new Error('Method not implemented: buildRequestBody');
  }
  
  /**
   * 解析响应（子类可重写）
   * @param {Object} data - API 响应数据
   * @returns {Object} 标准化响应 { content, role, toolCalls, finishReason, usage, model }
   */
  parseResponse(data) {
    throw new Error('Method not implemented: parseResponse');
  }
  
  /**
   * 解析流式片段（子类可重写）
   * @param {Object} data - 流式数据块
   * @returns {Object|null} 标准化数据块 { content, role, toolCalls, finishReason }
   */
  parseStreamChunk(data) {
    throw new Error('Method not implemented: parseStreamChunk');
  }
  
  /**
   * 发送聊天请求（非流式）
   * @param {Object} params - 请求参数
   * @returns {Promise<Object>} 标准化响应
   */
  async chat(params) {
    throw new Error('Method not implemented: chat');
  }
  
  /**
   * 发送流式聊天请求
   * @param {Object} params - 请求参数
   * @param {Function} onChunk - 数据块回调
   * @param {Function} onComplete - 完成回调
   * @returns {Promise<void>}
   */
  async chatStream(params, onChunk, onComplete) {
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
   * 获取模型列表
   * @returns {Promise<Array>} 模型列表（包含详细信息）
   */
  async listModels() {
    throw new Error('Method not implemented: listModels');
  }
  
  /**
   * 获取单个模型的详细信息
   * @param {string} modelId - 模型 ID
   * @returns {Promise<Object>} 模型详细信息
   */
  async getModelDetails(modelId) {
    throw new Error('Method not implemented: getModelDetails');
  }
}

// 导出到全局
window.IProviderAPIService = IProviderAPIService;
