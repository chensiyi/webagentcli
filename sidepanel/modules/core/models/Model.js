/**
 * Model - AI 模型业务模型（协议无关）
 * 
 * 描述 AI 模型的能力和元数据，不包含任何 API 标准相关的字段。
 */

class Model {
  /**
   * @param {Object} params
   * @param {string} params.id - 模型唯一标识
   * @param {string} params.name - 模型显示名称
   * @param {string} [params.provider] - 提供商名称
   * @param {Object} [params.capabilities] - 模型能力
   * @param {boolean} [params.capabilities.multimodal] - 是否支持多模态输入
   * @param {boolean} [params.capabilities.toolCalling] - 是否支持工具调用
   * @param {boolean} [params.capabilities.streaming] - 是否支持流式响应
   * @param {boolean} [params.capabilities.thinking] - 是否支持思考过程
   * @param {Array<string>} [params.supportedInputTypes] - 支持的输入类型 ['text', 'image', 'audio']
   * @param {Array<string>} [params.supportedOutputTypes] - 支持的输出类型 ['text']
   * @param {number} [params.contextLimit] - 上下文长度限制（tokens）
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor({
    id,
    name,
    provider = 'unknown',
    capabilities = {},
    supportedInputTypes = ['text'],
    supportedOutputTypes = ['text'],
    contextLimit = 8192,
    metadata = {}
  }) {
    if (!id) throw new Error('Model id is required');
    if (!name) throw new Error('Model name is required');

    this.id = id;
    this.name = name;
    this.provider = provider;
    this.capabilities = {
      multimodal: false,
      toolCalling: true,
      streaming: true,
      thinking: false,
      ...capabilities
    };
    this.supportedInputTypes = supportedInputTypes;
    this.supportedOutputTypes = supportedOutputTypes;
    this.contextLimit = contextLimit;
    this.metadata = metadata;
    this.createdAt = Date.now();
  }

  /**
   * 检查是否支持某种输入类型
   */
  supportsInputType(type) {
    return this.supportedInputTypes.includes(type);
  }

  /**
   * 检查是否为多模态模型
   */
  isMultimodal() {
    return this.capabilities.multimodal || this.supportedInputTypes.length > 1;
  }

  /**
   * 检查是否支持工具调用
   */
  supportsToolCalling() {
    return this.capabilities.toolCalling;
  }

  /**
   * 检查是否支持流式响应
   */
  supportsStreaming() {
    return this.capabilities.streaming;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      capabilities: this.capabilities,
      supportedInputTypes: this.supportedInputTypes,
      supportedOutputTypes: this.supportedOutputTypes,
      contextLimit: this.contextLimit,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }

  /**
   * 从普通对象创建实例
   */
  static fromJSON(obj) {
    return new Model(obj);
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.Model = Model;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Model;
}
