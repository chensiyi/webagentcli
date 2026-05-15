/**
 * OpenRouter Service
 * 
 * 继承自 OpenAIService
 * OpenRouter 使用 OpenAI 兼容的 API 标准
 * 默认端点和模型列表接口有所不同
 */

class OpenRouterService extends OpenAIService {
  constructor() {
    super();
    this.name = 'openrouter';
  }

  /**
   * 配置服务
   */
  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'openai/gpt-3.5-turbo',
      ...config
    };
    
    if (!this.config.apiKey) {
      throw new Error('OpenRouter: apiKey is required');
    }
    
    console.log('[OpenRouterService] Configured:', this.config);
  }

  /**
   * 构建请求头
   * OpenRouter 需要额外的 headers
   */
  buildHeaders() {
    const headers = super.buildHeaders();
    
    // 添加 OpenRouter 特定的 headers
    headers['HTTP-Referer'] = window.location.href || 'http://localhost';
    headers['X-Title'] = 'Web Agent Client';
    
    return headers;
  }

  /**
   * 构建请求体
   * OpenRouter 支持额外的参数
   */
  buildRequestBody(params) {
    const body = super.buildRequestBody(params);
    
    // OpenRouter 支持 transforms 参数
    if (params.transforms) {
      body.transforms = params.transforms;
    }
    
    // OpenRouter 支持 provider 参数
    if (params.provider) {
      body.provider = params.provider;
    }
    
    // OpenRouter 支持 route 参数
    if (params.route) {
      body.route = params.route;
    }
    
    return body;
  }

  /**
   * 列出可用模型
   * OpenRouter 使用不同的端点和数据结构，提供更丰富的模型详情
   */
  async listModels() {
    // OpenRouter 使用不同的模型列表端点
    const modelsEndpoint = this.config.endpoint.replace(/\/$/, '') + '/models';
    
    const response = await fetch(modelsEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    if (result.data && Array.isArray(result.data)) {
      return result.data.map(model => {
        // 提取 pricing 信息
        const pricing = model.pricing || {};
        const promptPrice = pricing.prompt ? parseFloat(pricing.prompt) : null;
        const completionPrice = pricing.completion ? parseFloat(pricing.completion) : null;
        
        // 提取支持的参数
        const supportedParams = model.supported_parameters || [];
        
        return {
          id: model.id,
          name: model.name || model.id,
          created: model.created || null,
          owned_by: model.owned_by || model.owner || 'openrouter',
          
          // 核心能力参数
          context_length: model.context_length || null,
          max_output_tokens: model.max_output_tokens || null,
          modality: model.architecture?.modality || 'text->text',
          
          // 价格信息 (每百万 tokens)
          pricing: {
            prompt: promptPrice,
            completion: completionPrice,
            request: pricing.request || null,
            image: pricing.image || null
          },
          
          // 特性支持
          supports_reasoning: supportedParams.includes('reasoning'),
          supports_tools: supportedParams.includes('tools') || supportedParams.includes('tool_use'),
          supports_function_calling: supportedParams.includes('function_calling'),
          supports_json_mode: supportedParams.includes('json_mode'),
          supports_speculative_decoding: supportedParams.includes('speculative_decoding'),
          
          // 描述与链接
          description: model.description || null,
          top_provider: model.top_provider || null,
          link: model.link || `https://openrouter.ai/models/${model.id}`,
          
          // 原始数据备份
          _raw: model
        };
      });
    }
    
    return [];
  }

  /**
   * 获取单个模型的详细信息
   * OpenRouter 模型详情在 listModels 中已包含完整信息
   */
  async getModelDetails(modelId) {
    try {
      // 通过 listModels 获取所有模型，然后查找指定模型
      const models = await this.listModels();
      const model = models.find(m => m.id === modelId);
      
      if (!model) {
        console.warn(`[OpenRouterService] Model ${modelId} not found`);
        return null;
      }
      
      return model;
    } catch (error) {
      console.error('[OpenRouterService] Failed to get model details:', error);
      return null;
    }
  }
}

window.OpenRouterService = OpenRouterService;
