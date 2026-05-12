/**
 * API 服务层 - 基于 free-claude-code 的 ClaudeProxyService 模式
 * 
 * 职责：
 * 1. 请求验证和优化
 * 2. 模型路由和 Provider 选择
 * 3. Token 计数
 * 4. 错误处理和日志记录
 */

import { MessagesRequest } from '../models/MessageModels.js';

class APIService {
  constructor(settings, providerRegistry) {
    this.settings = settings;
    this.providerRegistry = providerRegistry;
    this.requestCounter = 0;
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    this.requestCounter++;
    return `req_${Date.now()}_${this.requestCounter}`;
  }

  /**
   * 创建消息响应（流式）
   * 
   * @param {MessagesRequest} requestData - 消息请求
   * @param {Function} onChunk - 流式数据块回调
   * @param {Function} onComplete - 完成回调
   * @returns {Promise<void>}
   */
  async createMessage(requestData, onChunk, onComplete) {
    const requestId = this.generateRequestId();
    
    try {
      // 1. 验证请求
      this.validateRequest(requestData);
      
      // 2. 记录请求日志
      this.logRequest(requestId, requestData);
      
      // 3. 计算输入 token
      const inputTokens = this.countTokens(requestData);
      
      // 4. 获取 Provider
      const provider = this.getProvider(requestData.model);
      
      // 5. 预检流式连接
      if (provider.preflightStream) {
        provider.preflightStream(requestData);
      }
      
      // 6. 发送流式请求
      await provider.streamResponse(
        requestData,
        inputTokens,
        requestId,
        onChunk,
        onComplete
      );
      
    } catch (error) {
      this.handleError(error, requestId, 'CREATE_MESSAGE_ERROR');
      throw error;
    }
  }

  /**
   * 验证请求
   */
  validateRequest(requestData) {
    if (!requestData) {
      throw new Error('Request data is required');
    }
    
    if (requestData instanceof MessagesRequest) {
      requestData.validate();
    } else if (!requestData.messages || requestData.messages.length === 0) {
      throw new Error('messages cannot be empty');
    }
  }

  /**
   * 记录请求日志
   */
  logRequest(requestId, requestData) {
    const model = requestData.model || 'unknown';
    const messageCount = requestData.messages ? requestData.messages.length : 0;
    
    console.log(`[API] REQUEST: request_id=${requestId} model=${model} messages=${messageCount}`);
    
    if (this.settings.logRawPayloads) {
      console.debug(`[API] FULL_PAYLOAD [${requestId}]:`, JSON.stringify(requestData, null, 2));
    }
  }

  /**
   * 计算 Token 数量
   */
  countTokens(requestData) {
    // TODO: 实现 token 计数逻辑
    // 可以集成 tiktoken 或其他 tokenizer
    const messages = requestData.messages || [];
    let totalTokens = 0;
    
    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        // 粗略估算：每4个字符约1个token
        totalTokens += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach(block => {
          if (block.type === 'text' && block.text) {
            totalTokens += Math.ceil(block.text.length / 4);
          }
        });
      }
    });
    
    return totalTokens;
  }

  /**
   * 获取 Provider
   */
  getProvider(model) {
    if (!this.providerRegistry) {
      throw new Error('Provider registry not configured');
    }
    
    const provider = this.providerRegistry.getProvider(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }
    
    return provider;
  }

  /**
   * 错误处理
   */
  handleError(error, requestId, context) {
    if (this.settings.logErrorTracebacks) {
      console.error(`[API] ${context} request_id=${requestId}:`, error);
      console.error(error.stack);
    } else {
      console.error(`[API] ${context} request_id=${requestId} exc_type=${error.constructor.name}`);
    }
  }

  /**
   * 统计 Token（独立接口）
   */
  async countTokensStandalone(requestData) {
    const requestId = this.generateRequestId();
    
    try {
      this.validateRequest(requestData);
      const tokens = this.countTokens(requestData);
      
      console.log(`[API] COUNT_TOKENS: request_id=${requestId} tokens=${tokens}`);
      
      return {
        input_tokens: tokens
      };
    } catch (error) {
      this.handleError(error, requestId, 'COUNT_TOKENS_ERROR');
      throw error;
    }
  }
}

/**
 * Provider 注册表
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  /**
   * 注册 Provider
   */
  registerProvider(id, provider) {
    this.providers.set(id, provider);
  }

  /**
   * 获取 Provider
   */
  getProvider(model) {
    // 简单策略：根据模型名称匹配 provider
    // 可以实现更复杂的路由逻辑
    
    for (const [id, provider] of this.providers) {
      if (provider.supportsModel(model)) {
        return provider;
      }
    }
    
    // 默认返回第一个 provider
    if (this.providers.size > 0) {
      return this.providers.values().next().value;
    }
    
    return null;
  }

  /**
   * 清理所有 Provider
   */
  async cleanup() {
    for (const [id, provider] of this.providers) {
      if (provider.cleanup) {
        await provider.cleanup();
      }
    }
  }
}

/**
 * Base Provider 接口
 */
class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * 检查是否支持指定模型
   */
  supportsModel(model) {
    throw new Error('Method not implemented');
  }

  /**
   * 预检流式连接
   */
  preflightStream(requestData) {
    // 可选实现
  }

  /**
   * 流式响应
   */
  async streamResponse(requestData, inputTokens, requestId, onChunk, onComplete) {
    throw new Error('Method not implemented');
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 可选实现
  }
}

export { APIService, ProviderRegistry, BaseProvider };
export default APIService;
