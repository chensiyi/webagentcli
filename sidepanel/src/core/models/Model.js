/**
 * Model - AI 模型业务模型（协议无关）
 * 
 * 表示一个可用的 AI 模型，包含其元数据和能力信息。
 * 不包含任何 API 标准相关的字段。
 */

class Model {
  /**
   * @param {Object} params
   * @param {string} params.id - 模型唯一标识
   * @param {string} params.name - 模型显示名称
   * @param {string} [params.provider] - 提供商（如 'openai', 'anthropic'）
   * @param {string} [params.architecture] - 架构类型（如 'gpt-4', 'llama-3'）
   * @param {number} [params.context_length] - 最大上下文长度（tokens）
   * @param {Object} [params.capabilities] - 模型能力
   * @param {boolean} [params.capabilities.vision] - 是否支持视觉
   * @param {boolean} [params.capabilities.audio] - 是否支持音频
   * @param {boolean} [params.capabilities.streaming] - 是否支持流式
   * @param {boolean} [params.capabilities.tools] - 是否支持工具调用
   * @param {Array<string>} [params.input_modalities] - 输入模态 ['text', 'image', 'audio']
   * @param {Array<string>} [params.output_modalities] - 输出模态 ['text', 'image']
   * @param {Object} [params.pricing] - 定价信息
   * @param {number} [params.pricing.input_per_1k] - 输入价格（每 1K tokens）
   * @param {number} [params.pricing.output_per_1k] - 输出价格（每 1K tokens）
   * @param {string} [params.description] - 模型描述
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor({
    id,
    name,
    provider = 'unknown',
    architecture = null,
    context_length = 8192,
    capabilities = {},
    input_modalities = ['text'],
    output_modalities = ['text'],
    pricing = null,
    description = '',
    metadata = {}
  }) {
    if (!id) {
      throw new Error('Model id is required');
    }
    
    if (!name) {
      throw new Error('Model name is required');
    }

    this.id = id;
    this.name = name;
    this.provider = provider;
    this.architecture = architecture;
    this.context_length = context_length;
    this.capabilities = {
      vision: false,
      audio: false,
      streaming: true,
      tools: true,
      ...capabilities
    };
    this.input_modalities = input_modalities;
    this.output_modalities = output_modalities;
    this.pricing = pricing;
    this.description = description;
    this.metadata = metadata;
    this.created_at = Date.now();
  }

  /**
   * 检查是否支持某种输入模态
   * @param {string} modality - 'text', 'image', 'audio'
   */
  supportsInputModality(modality) {
    return this.input_modalities.includes(modality);
  }

  /**
   * 检查是否支持某种输出模态
   * @param {string} modality - 'text', 'image'
   */
  supportsOutputModality(modality) {
    return this.output_modalities.includes(modality);
  }

  /**
   * 检查是否为多模态模型
   */
  isMultimodal() {
    return this.input_modalities.length > 1 || 
           this.output_modalities.length > 1;
  }

  /**
   * 检查是否支持视觉
   */
  supportsVision() {
    return this.capabilities.vision || 
           this.input_modalities.includes('image');
  }

  /**
   * 检查是否支持工具调用
   */
  supportsTools() {
    return this.capabilities.tools;
  }

  /**
   * 检查是否支持流式响应
   */
  supportsStreaming() {
    return this.capabilities.streaming;
  }

  /**
   * 获取模型的简短标识（用于显示）
   */
  getShortName() {
    // 如果名称包含 '/'，取后半部分
    if (this.name.includes('/')) {
      return this.name.split('/').pop();
    }
    return this.name;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      architecture: this.architecture,
      context_length: this.context_length,
      capabilities: this.capabilities,
      input_modalities: this.input_modalities,
      output_modalities: this.output_modalities,
      pricing: this.pricing,
      description: this.description,
      metadata: this.metadata,
      created_at: this.created_at
    };
  }

  /**
   * 从普通对象创建 Model 实例
   */
  static fromJSON(obj) {
    return new Model(obj);
  }

  /**
   * 比较函数（按名称排序）
   */
  static compareByName(a, b) {
    return a.name.localeCompare(b.name);
  }

  /**
   * 比较函数（按上下文长度降序）
   */
  static compareByContextLength(a, b) {
    return b.context_length - a.context_length;
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.Model = Model;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Model;
}
