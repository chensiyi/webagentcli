/**
 * Model - AI 模型业务模型（协议无关）
 * 
 * 描述 AI 模型的能力和元数据，不包含任何 API 标准相关的字段。
 * 基于 LM Studio /api/v1/models 响应格式设计。
 */

class Model extends window.BaseModel {
  /**
   * @param {Object} params
   * @param {string} params.id - 模型唯一标识（如 'qwen2-vl-7b-instruct'）
   * @param {string} params.name - 模型显示名称
   * @param {string} [params.type] - 模型类型 ('llm' | 'vlm' | 'embeddings')
   * @param {string} [params.publisher] - 发布者/提供商
   * @param {string} [params.architecture] - 模型架构（如 'llama', 'qwen2_vl', 'nomic-bert'）
   * @param {Object} [params.capabilities] - 模型能力
   * @param {boolean} [params.capabilities.vision] - 是否支持视觉输入
   * @param {boolean} [params.capabilities.toolUse] - 是否支持工具调用
   * @param {boolean} [params.capabilities.streaming] - 是否支持流式响应
   * @param {boolean} [params.capabilities.reasoning] - 是否支持思考过程
   * @param {boolean} [params.capabilities.jsonMode] - 是否支持 JSON 模式输出
   * @param {Array<string>} [params.inputModalities] - 输入模态 ['text', 'image', 'audio']
   * @param {Array<string>} [params.outputModalities] - 输出模态 ['text']
   * @param {number} [params.contextLength] - 最大上下文长度（tokens）
   * @param {number} [params.maxOutputTokens] - 最大单次输出长度（tokens）
   * @param {string} [params.quantization] - 量化等级（如 'Q4_K_M', '4bit', 'Q8'）
   * @param {string} [params.compatibilityType] - 兼容类型（如 'gguf', 'mlx'）
   * @param {string} [params.state] - 加载状态 ('loaded' | 'not-loaded' | 'loading')
   * @param {number} [params.sizeBytes] - 模型文件大小（字节）
   * @param {string} [params.paramsString] - 参数字符串（如 '7B', '13B'）
   * @param {string} [params.description] - 模型描述
   * @param {Object} [params.pricing] - 价格信息 { prompt: number, completion: number }
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor(params = {}) {
    super(params);
    
    const {
      id,
      name,
      type = 'llm',
      publisher = 'unknown',
      architecture = null,
      capabilities = {},
      inputModalities = ['text'],
      outputModalities = ['text'],
      contextLength = 8192,
      maxOutputTokens = null,
      quantization = null,
      compatibilityType = null,
      state = 'not-loaded',
      sizeBytes = null,
      paramsString = null,
      description = '',
      pricing = null,
      metadata = {}
    } = params;

    if (!id) throw new Error('Model id is required');
    if (!name) throw new Error('Model name is required');

    this.id = id;
    this.name = name;
    this.type = type; // 'llm' | 'vlm' | 'embeddings'
    this.publisher = publisher;
    this.architecture = architecture;
    this.capabilities = {
      vision: false,
      toolUse: true,
      streaming: true,
      reasoning: true, // 默认开启思考能力
      jsonMode: false,
      ...capabilities
    };
    this.inputModalities = inputModalities;
    this.outputModalities = outputModalities;
    this.contextLength = contextLength;
    this.maxOutputTokens = maxOutputTokens;
    this.quantization = quantization; // 'Q4_K_M', '4bit', 'Q8', etc.
    this.compatibilityType = compatibilityType; // 'gguf', 'mlx', etc.
    this.state = state; // 'loaded' | 'not-loaded' | 'loading'
    this.sizeBytes = sizeBytes;
    this.paramsString = paramsString; // '7B', '13B', '70B', etc.
    this.description = description;
    this.pricing = pricing;
    this.metadata = metadata;
  }

  /**
   * 检查是否支持某种输入模态
   */
  supportsInputModality(modality) {
    return this.inputModalities.includes(modality);
  }

  /**
   * 检查是否为视觉语言模型（VLM）
   */
  isVisionModel() {
    return this.type === 'vlm' || 
           this.capabilities.vision || 
           this.inputModalities.includes('image');
  }

  /**
   * 检查是否为嵌入模型
   */
  isEmbeddingModel() {
    return this.type === 'embeddings';
  }

  /**
   * 检查是否为多模态模型
   */
  isMultimodal() {
    return this.inputModalities.length > 1 || 
           this.outputModalities.length > 1;
  }

  /**
   * 检查是否支持工具调用
   */
  supportsToolUse() {
    return this.capabilities.toolUse && !this.isEmbeddingModel();
  }

  /**
   * 检查是否支持流式响应
   */
  supportsStreaming() {
    return this.capabilities.streaming;
  }

  /**
   * 检查是否已加载到内存
   */
  isLoaded() {
    return this.state === 'loaded';
  }

  /**
   * 获取参数量字符串（如 '7B', '13B'）
   */
  getParamsString() {
    return this.paramsString || 'Unknown';
  }

  /**
   * 检查是否支持 JSON 模式
   */
  supportsJsonMode() {
    return this.capabilities.jsonMode;
  }

  /**
   * 检查是否支持思考/推理过程
   */
  supportsReasoning() {
    return this.capabilities.reasoning;
  }

  /**
   * 获取量化的简短描述
   */
  getQuantizationLabel() {
    if (!this.quantization) return 'Unknown';
    
    // 标准化量化标签
    const q = this.quantization.toUpperCase();
    if (q.includes('Q4')) return '4-bit';
    if (q.includes('Q5')) return '5-bit';
    if (q.includes('Q6')) return '6-bit';
    if (q.includes('Q8')) return '8-bit';
    if (q.includes('FP16') || q.includes('F16')) return 'FP16';
    if (q.includes('FP32') || q.includes('F32')) return 'FP32';
    
    return this.quantization;
  }

  /**
   * 获取模型大小的可读字符串
   */
  getSizeLabel() {
    if (!this.sizeBytes) return 'Unknown';
    
    const gb = this.sizeBytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)} GB`;
    }
    
    const mb = this.sizeBytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      ...super.toJSON(),
      ...this.name && { name: this.name },
      ...this.type && { type: this.type },
      ...this.publisher && { publisher: this.publisher },
      ...this.architecture && { architecture: this.architecture },
      ...this.capabilities && { capabilities: this.capabilities },
      ...this.inputModalities && { inputModalities: this.inputModalities },
      ...this.outputModalities && { outputModalities: this.outputModalities },
      ...this.contextLength && { contextLength: this.contextLength },
      ...this.maxOutputTokens && { maxOutputTokens: this.maxOutputTokens },
      ...this.quantization && { quantization: this.quantization },
      ...this.compatibilityType && { compatibilityType: this.compatibilityType },
      ...this.state && { state: this.state },
      ...this.sizeBytes && { sizeBytes: this.sizeBytes },
      ...this.paramsString && { paramsString: this.paramsString },
      ...this.description && { description: this.description },
      ...this.pricing && { pricing: this.pricing },
      ...this.metadata && { metadata: this.metadata },
      
      // 兼容性字段 (snake_case)，用于现有 UI（如 SettingsPage）
      ...this.contextLength && { context_length: this.contextLength },
      ...this.maxOutputTokens && { max_output_tokens: this.maxOutputTokens },
      ...this.inputModalities && { input_modalities: this.inputModalities },
      ...this.outputModalities && { output_modalities: this.outputModalities },
      ...this.inputModalities && { modality: this.inputModalities.join('->') + '->' + this.outputModalities.join(',') },
      ...this.capabilities.reasoning && { supports_reasoning: this.capabilities.reasoning },
      ...this.capabilities.toolUse && { supports_tools: this.capabilities.toolUse },
      ...this.capabilities.jsonMode && { supports_json_mode: this.capabilities.jsonMode }
    };
  }

  /**
   * 从普通对象创建实例
   */
  static fromJSON(obj) {
    return new Model(obj);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.Model = Model;
}
