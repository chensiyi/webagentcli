// 消息类型定义和扩展框架
// 支持未来新增的各种 AI 交互能力

(function() {
  'use strict';

  /**
   * 消息内容类型枚举
   */
  const ContentType = {
    TEXT: 'text',              // 普通文本
    IMAGE_URL: 'image_url',    // 图片 URL
    AUDIO_URL: 'audio_url',    // 音频 URL
    VIDEO_URL: 'video_url',    // 视频 URL
    
    // 工具和函数调用
    TOOL_CALL: 'tool_call',    // 工具调用请求
    TOOL_RESULT: 'tool_result', // 工具执行结果
    FUNCTION: 'function',      // 函数调用（旧版）
    
    // 思考和推理
    REASONING: 'reasoning',    // 思考过程（thinking mode）
    THINKING: 'thinking',      // 深度思考过程
    
    // 代码相关
    CODE: 'code',              // 代码块
    CODE_RESULT: 'code_result', // 代码执行结果
    JS_CODE: 'js_code',        // JavaScript 代码
    
    // RAG 相关
    RAG_SOURCE: 'rag_source',  // RAG 引用来源
    RAG_CONTEXT: 'rag_context', // RAG 检索的上下文
    CITATION: 'citation',      // 引用标注
  };

  /**
   * 消息角色枚举
   */
  const MessageRole = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    TOOL: 'tool',              // 工具执行结果
    FUNCTION: 'function',      // 函数执行结果（旧版）
  };

  /**
   * 模型能力标志
   */
  const ModelCapability = {
    // 多模态能力
    VISION: 'vision',          // 视觉理解
    AUDIO: 'audio',            // 音频处理
    VIDEO: 'video',            // 视频处理
    
    // 工具和函数调用
    TOOL_CALLING: 'tool_calling',      // 工具调用
    FUNCTION_CALLING: 'function_calling', // 函数调用（旧版）
    PARALLEL_TOOL_CALLS: 'parallel_tool_calls', // 并行工具调用
    
    // 思考和推理
    THINKING: 'thinking',      // 思考模式
    REASONING: 'reasoning',    // 推理能力
    
    // 代码能力
    CODE_EXECUTION: 'code_execution',   // 代码执行
    JS_EXECUTION: 'js_execution',       // JavaScript 执行
    
    // RAG 能力
    RAG: 'rag',                // 检索增强生成
    WEB_SEARCH: 'web_search',  // 网络搜索
    KNOWLEDGE_BASE: 'knowledge_base', // 知识库检索
    
    // 其他能力
    STREAMING: 'streaming',    // 流式输出
    JSON_MODE: 'json_mode',    // JSON 结构化输出
    AGENT: 'agent',            // Agent 工作流
  };

  /**
   * 消息内容项接口
   * @typedef {Object} ContentItem
   * @property {string} type - 内容类型（ContentType 枚举值）
   * @property {string} [text] - 文本内容
   * @property {Object} [image_url] - 图片 URL 对象 { url: string, detail?: 'low' | 'high' | 'auto' }
   * @property {Object} [audio_url] - 音频 URL 对象 { url: string }
   * @property {Object} [video_url] - 视频 URL 对象 { url: string }
   * @property {Object} [tool_call] - 工具调用对象 { id: string, type: 'function', function: { name: string, arguments: string } }
   * @property {Object} [tool_result] - 工具结果对象 { tool_call_id: string, content: string }
   * @property {string} [reasoning] - 思考过程内容
   * @property {string} [thinking] - 深度思考内容
   * @property {Object} [code] - 代码对象 { language: string, code: string, result?: string }
   * @property {Object} [js_code] - JavaScript 代码 { code: string, result?: any }
   * @property {Array<Object>} [rag_sources] - RAG 引用来源 { title: string, url: string, relevance: number }
   * @property {string} [rag_context] - RAG 检索的上下文
   * @property {Array<Object>} [citations] - 引用标注 { text: string, source: string }
   */

  /**
   * 消息接口
   * @typedef {Object} ChatMessage
   * @property {string} role - 消息角色（MessageRole 枚举值）
   * @property {string|Array<ContentItem>} content - 消息内容
   * @property {string} [name] - 消息名称（用于 function/tool 消息）
   * @property {Array<Object>} [tool_calls] - 工具调用列表
   * @property {string} [tool_call_id] - 工具调用 ID（用于 tool 消息）
   * @property {Object} [additional_kwargs] - 额外参数（如 reasoning_content）
   * @property {boolean} [isError] - 是否为错误消息
   * @property {number} [timestamp] - 时间戳
   */

  /**
   * 模型能力配置
   * @typedef {Object} ModelCapabilities
   * @property {boolean} vision - 是否支持视觉
   * @property {boolean} audio - 是否支持音频
   * @property {boolean} video - 是否支持视频
   * @property {boolean} tool_calling - 是否支持工具调用
   * @property {boolean} function_calling - 是否支持函数调用
   * @property {boolean} parallel_tool_calls - 是否支持并行工具调用
   * @property {boolean} thinking - 是否支持思考模式
   * @property {boolean} reasoning - 是否支持推理
   * @property {boolean} code_execution - 是否支持代码执行
   * @property {boolean} js_execution - 是否支持 JavaScript 执行
   * @property {boolean} rag - 是否支持检索增强生成
   * @property {boolean} web_search - 是否支持网络搜索
   * @property {boolean} knowledge_base - 是否支持知识库检索
   * @property {boolean} streaming - 是否支持流式输出
   * @property {boolean} json_mode - 是否支持 JSON 模式
   * @property {boolean} agent - 是否支持 Agent 工作流
   * @property {number} context_window - 上下文窗口大小
   * @property {number} max_output_tokens - 最大输出 token 数
   */

  /**
   * 流式响应块
   * @typedef {Object} StreamChunk
   * @property {string} type - 块类型：'chunk' | 'complete' | 'error' | 'tool_call' | 'reasoning'
   * @property {string} [content] - 文本内容
   * @property {string} [reasoning_content] - 思考过程内容
   * @property {Array<Object>} [tool_calls] - 工具调用列表
   * @property {Object} [usage] - 使用情况统计
   * @property {string} [error] - 错误信息
   */

  /**
   * 工具定义
   * @typedef {Object} ToolDefinition
   * @property {string} type - 工具类型，通常为 'function'
   * @property {Object} function - 函数定义
   * @property {string} function.name - 函数名称
   * @property {string} function.description - 函数描述
   * @property {Object} function.parameters - 参数 schema（JSON Schema 格式）
   */

  /**
   * 工具调用结果
   * @typedef {Object} ToolCallResult
   * @property {string} tool_call_id - 工具调用 ID
   * @property {string} name - 工具名称
   * @property {string} content - 执行结果
   */

  /**
   * 消息处理器注册表
   * 用于注册不同类型消息的处理逻辑
   */
  class MessageHandlerRegistry {
    constructor() {
      this.handlers = new Map();
    }

    /**
     * 注册消息处理器
     * @param {string} contentType - 内容类型
     * @param {Function} handler - 处理函数 (contentItem, options) => HTMLElement
     */
    register(contentType, handler) {
      this.handlers.set(contentType, handler);
      console.log(`[MessageHandlerRegistry] Registered handler for: ${contentType}`);
    }

    /**
     * 获取消息处理器
     * @param {string} contentType - 内容类型
     * @returns {Function|null} 处理函数
     */
    getHandler(contentType) {
      return this.handlers.get(contentType) || null;
    }

    /**
     * 检查是否有处理器
     * @param {string} contentType - 内容类型
     * @returns {boolean}
     */
    hasHandler(contentType) {
      return this.handlers.has(contentType);
    }

    /**
     * 获取所有已注册的内容类型
     * @returns {Array<string>}
     */
    getRegisteredTypes() {
      return Array.from(this.handlers.keys());
    }
  }

  /**
   * 模型能力管理器
   * 统一管理模型能力的检测和配置
   */
  class CapabilityManager {
    constructor() {
      this.capabilityCache = new Map();
      this.customDetectors = new Map();
    }

    /**
     * 注册自定义能力检测器
     * @param {string} capability - 能力名称
     * @param {Function} detector - 检测函数 (modelName) => boolean
     */
    registerDetector(capability, detector) {
      this.customDetectors.set(capability, detector);
      console.log(`[CapabilityManager] Registered detector for: ${capability}`);
    }

    /**
     * 检测模型能力
     * @param {string} modelName - 模型名称
     * @param {string} capability - 能力名称
     * @returns {boolean}
     */
    checkCapability(modelName, capability) {
      const cacheKey = `${modelName}:${capability}`;
      
      // 检查缓存
      if (this.capabilityCache.has(cacheKey)) {
        return this.capabilityCache.get(cacheKey);
      }

      let result = false;

      // 先使用自定义检测器
      if (this.customDetectors.has(capability)) {
        result = this.customDetectors.get(capability)(modelName);
      } else {
        // 使用默认检测逻辑
        result = this.defaultDetectCapability(modelName, capability);
      }

      // 缓存结果
      this.capabilityCache.set(cacheKey, result);
      return result;
    }

    /**
     * 默认能力检测逻辑
     * @param {string} modelNameLower - 模型名称（小写）
     * @param {string} capability - 能力名称
     * @returns {boolean}
     */
    defaultDetectCapability(modelNameLower, capability) {
      switch (capability) {
        case ModelCapability.VISION:
          return this.checkVisionSupport(modelNameLower);
        case ModelCapability.AUDIO:
          return this.checkAudioSupport(modelNameLower);
        case ModelCapability.THINKING:
          return this.checkThinkingSupport(modelNameLower);
        case ModelCapability.TOOL_CALLING:
          return this.checkToolCallingSupport(modelNameLower);
        default:
          return false;
      }
    }

    /**
     * 检查视觉支持
     */
    checkVisionSupport(modelNameLower) {
      const visionModels = [
        'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3', 'gemini-1.5', 'gemini-2.0',
        'gemma', 'qwen-vl', 'llava', 'yi-vision', 'glm-4v'
      ];
      
      if (visionModels.some(keyword => modelNameLower.includes(keyword))) {
        return true;
      }

      const visionKeywords = ['vision', 'vl', 'visual', 'image', 'img'];
      return visionKeywords.some(keyword => {
        const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
        return regex.test(modelNameLower);
      });
    }

    /**
     * 检查音频支持
     */
    checkAudioSupport(modelNameLower) {
      const audioModels = [
        'gpt-4o-realtime', 'gpt-4o-audio',
        'whisper', 'speech-to-text'
      ];
      
      if (audioModels.some(keyword => modelNameLower.includes(keyword))) {
        return true;
      }

      const audioKeywords = ['audio', 'voice', 'speech', 'sound', 'realtime'];
      return audioKeywords.some(keyword => {
        const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
        return regex.test(modelNameLower);
      });
    }

    /**
     * 检查思考模式支持
     */
    checkThinkingSupport(modelNameLower) {
      const thinkingModels = [
        'deepseek-r1', 'qwq', 'qwen3', 'glm-4.5',
        'o1', 'o3', 'claude-3-opus'
      ];
      
      if (thinkingModels.some(keyword => modelNameLower.includes(keyword))) {
        return true;
      }

      const thinkingKeywords = ['thinking', 'reasoning', 'think', 'r1', 'qwq'];
      return thinkingKeywords.some(keyword => {
        const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
        return regex.test(modelNameLower);
      });
    }

    /**
     * 检查代码执行支持
     */
    checkCodeExecutionSupport(modelNameLower) {
      // 大多数现代模型都支持生成代码，但执行需要沙箱环境
      const codeModels = [
        'gpt-4', 'gpt-3.5', 'claude', 'gemini',
        'qwen', 'glm', 'llama', 'codellama', 'codeqwen'
      ];
      
      return codeModels.some(keyword => modelNameLower.includes(keyword));
    }

    /**
     * 检查 RAG 支持
     */
    checkRagSupport(modelNameLower) {
      // RAG 通常是应用层功能，不依赖模型本身
      // 这里返回 true 表示系统支持 RAG
      return true;
    }

    /**
     * 检查网络搜索支持
     */
    checkWebSearchSupport(modelNameLower) {
      // 网络搜索是外部工具，不依赖模型
      return true;
    }

    /**
     * 检查工具调用支持
     */
    checkToolCallingSupport(modelNameLower) {
      const toolModels = [
        'gpt-4', 'gpt-3.5-turbo', 'claude', 'gemini',
        'qwen', 'glm', 'llama-3'
      ];
      
      return toolModels.some(keyword => modelNameLower.includes(keyword));
    }

    /**
     * 获取模型的完整能力配置
     * @param {string} modelName - 模型名称
     * @returns {ModelCapabilities}
     */
    getModelCapabilities(modelName) {
      const lower = modelName.toLowerCase();
      
      return {
        // 多模态能力
        vision: this.checkCapability(lower, ModelCapability.VISION),
        audio: this.checkCapability(lower, ModelCapability.AUDIO),
        video: this.checkCapability(lower, ModelCapability.VIDEO),
        
        // 工具和函数调用
        tool_calling: this.checkCapability(lower, ModelCapability.TOOL_CALLING),
        function_calling: this.checkCapability(lower, ModelCapability.FUNCTION_CALLING),
        parallel_tool_calls: this.checkCapability(lower, ModelCapability.PARALLEL_TOOL_CALLS),
        
        // 思考和推理
        thinking: this.checkCapability(lower, ModelCapability.THINKING),
        reasoning: this.checkCapability(lower, ModelCapability.REASONING),
        
        // 代码能力
        code_execution: this.checkCapability(lower, ModelCapability.CODE_EXECUTION),
        js_execution: this.checkCapability(lower, ModelCapability.JS_EXECUTION),
        
        // RAG 能力
        rag: this.checkCapability(lower, ModelCapability.RAG),
        web_search: this.checkCapability(lower, ModelCapability.WEB_SEARCH),
        knowledge_base: this.checkCapability(lower, ModelCapability.KNOWLEDGE_BASE),
        
        // 其他能力
        streaming: true, // 大部分模型都支持
        json_mode: lower.includes('gpt-4') || lower.includes('claude'),
        agent: lower.includes('gpt-4') || lower.includes('claude') || lower.includes('gemini'),
        
        // 性能参数
        context_window: this.estimateContextWindow(lower),
        max_output_tokens: this.estimateMaxOutputTokens(lower)
      };
    }

    /**
     * 估算上下文窗口大小
     */
    estimateContextWindow(modelNameLower) {
      if (modelNameLower.includes('gpt-4o')) return 128000;
      if (modelNameLower.includes('gpt-4-32k')) return 32768;
      if (modelNameLower.includes('gpt-4')) return 8192;
      if (modelNameLower.includes('gpt-3.5')) return 16385;
      if (modelNameLower.includes('claude-3')) return 200000;
      if (modelNameLower.includes('claude-2')) return 100000;
      if (modelNameLower.includes('gemini')) return 32768;
      if (modelNameLower.includes('llama-3')) return 8192;
      return 8192;
    }

    /**
     * 估算最大输出 token 数
     */
    estimateMaxOutputTokens(modelNameLower) {
      if (modelNameLower.includes('claude-3')) return 8192;
      if (modelNameLower.includes('gemini')) return 8192;
      if (modelNameLower.includes('gpt-4')) return 4096;
      return 2048;
    }

    /**
     * 清除缓存
     */
    clearCache() {
      this.capabilityCache.clear();
    }
  }

  /**
   * 消息构建器
   * 用于构建不同格式的消息
   */
  class MessageBuilder {
    /**
     * 创建文本消息
     * @param {string} text - 文本内容
     * @param {string} role - 角色
     * @returns {ChatMessage}
     */
    static createTextMessage(text, role = MessageRole.USER) {
      return {
        role,
        content: text,
        timestamp: Date.now()
      };
    }

    /**
     * 创建多模态消息
     * @param {Array<ContentItem>} contentItems - 内容项数组
     * @param {string} role - 角色
     * @returns {ChatMessage}
     */
    static createMultiModalMessage(contentItems, role = MessageRole.USER) {
      return {
        role,
        content: contentItems,
        timestamp: Date.now()
      };
    }

    /**
     * 添加工具调用到消息
     * @param {ChatMessage} message - 原始消息
     * @param {Array<Object>} toolCalls - 工具调用列表
     * @returns {ChatMessage}
     */
    static addToolCalls(message, toolCalls) {
      return {
        ...message,
        tool_calls: toolCalls
      };
    }

    /**
     * 创建工具结果消息
     * @param {string} toolCallId - 工具调用 ID
     * @param {string} content - 执行结果
     * @param {string} name - 工具名称
     * @returns {ChatMessage}
     */
    static createToolResultMessage(toolCallId, content, name) {
      return {
        role: MessageRole.TOOL,
        content,
        tool_call_id: toolCallId,
        name,
        timestamp: Date.now()
      };
    }

    /**
     * 添加思考过程到消息
     * @param {ChatMessage} message - 原始消息
     * @param {string} reasoning - 思考过程
     * @returns {ChatMessage}
     */
    static addReasoning(message, reasoning) {
      return {
        ...message,
        additional_kwargs: {
          ...(message.additional_kwargs || {}),
          reasoning_content: reasoning
        }
      };
    }
  }

  /**
   * 消息解析器
   * 用于解析不同格式的响应
   */
  class MessageParser {
    /**
     * 解析流式响应块
     * @param {Object} chunkData - 原始 chunk 数据
     * @returns {StreamChunk}
     */
    static parseStreamChunk(chunkData) {
      const chunk = {
        type: 'chunk'
      };

      // 检查错误
      if (chunkData.error) {
        return {
          type: 'error',
          error: chunkData.error.message || JSON.stringify(chunkData.error)
        };
      }

      // 检查是否完成
      if (chunkData.choices === undefined || chunkData.choices.length === 0) {
        return {
          type: 'complete',
          usage: chunkData.usage
        };
      }

      const choice = chunkData.choices[0];
      const delta = choice.delta || {};

      // 提取文本内容
      if (delta.content) {
        chunk.content = delta.content;
      }

      // 提取思考过程
      if (delta.reasoning_content || delta.reasoning) {
        chunk.reasoning_content = delta.reasoning_content || delta.reasoning;
        chunk.type = 'reasoning';
      }

      // 提取工具调用
      if (delta.tool_calls && delta.tool_calls.length > 0) {
        chunk.tool_calls = delta.tool_calls;
        chunk.type = 'tool_call';
      }

      // 提取使用情况
      if (chunkData.usage) {
        chunk.usage = chunkData.usage;
      }

      return chunk;
    }

    /**
     * 解析完整响应
     * @param {Object} responseData - 完整响应数据
     * @returns {ChatMessage}
     */
    static parseCompleteResponse(responseData) {
      const choice = responseData.choices?.[0];
      if (!choice) {
        throw new Error('Invalid response format');
      }

      const message = choice.message;
      const result = {
        role: message.role,
        content: message.content || '',
        timestamp: Date.now()
      };

      // 添加工具调用
      if (message.tool_calls && message.tool_calls.length > 0) {
        result.tool_calls = message.tool_calls;
      }

      // 添加额外参数
      if (message.additional_kwargs) {
        result.additional_kwargs = message.additional_kwargs;
      }

      return result;
    }
  }

  // 导出全局对象
  window.MessageTypes = {
    ContentType,
    MessageRole,
    ModelCapability,
    MessageHandlerRegistry: new MessageHandlerRegistry(),
    CapabilityManager: new CapabilityManager(),
    MessageBuilder,
    MessageParser
  };

  console.log('[MessageTypes] Initialized with support for:', Object.keys(ContentType));
})();
