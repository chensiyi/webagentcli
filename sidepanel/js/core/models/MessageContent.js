/**
 * MessageContent - 富媒体消息结构定义
 * 
 * 职责：
 * 1. 定义消息中的富媒体内容块（TextBlock, ImageBlock, ToolUseBlock 等）
 * 2. 提供消息结构的转换逻辑（如从 OpenAI 格式转换为块格式）
 * 3. 包含多媒体资源的处理逻辑 (MediaContent)
 */

// =============================================================================
// 内容块类型
// =============================================================================

/**
 * 文本内容块
 */
class TextBlock {
  constructor(text) {
    this.type = 'text';
    this.text = text || '';
  }
  static fromString(text) { return new TextBlock(text); }
}

/**
 * 图片内容块
 */
class ImageBlock {
  constructor(source) {
    this.type = 'image';
    this.source = source; // { type: 'base64', media_type: 'image/png', data: '...' }
  }
}

/**
 * 工具调用内容块
 */
class ToolUseBlock {
  constructor(id, name, input) {
    this.type = 'tool_use';
    this.id = id;
    this.name = name;
    this.input = input || {};
  }
  static fromOpenAIToolCall(toolCall) {
    return new ToolUseBlock(
      toolCall.id,
      toolCall.function.name,
      JSON.parse(toolCall.function.arguments || '{}')
    );
  }
}

/**
 * 工具结果内容块
 */
class ToolResultBlock {
  constructor(toolUseId, content) {
    this.type = 'tool_result';
    this.tool_use_id = toolUseId;
    this.content = content; // string | array | object
  }
  static serializeContent(content) {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    return JSON.stringify(content, null, 2);
  }
}

/**
 * 思考内容块
 */
class ThinkingBlock {
  constructor(thinking, signature = null) {
    this.type = 'thinking';
    this.thinking = thinking || '';
    this.signature = signature;
  }
}

/**
 * 思考配置
 */
class ThinkingConfig {
  /**
   * @param {string} effort - 思考强度 ('off' | 'low' | 'medium' | 'high')
   */
  constructor(effort = 'off') {
    this.effort = effort;
    this.enabled = effort !== 'off';
  }

  /**
   * 转换为 API 格式
   */
  toAPIFormat() {
    if (!this.enabled) return null;
    return {
      type: 'enabled',
      budget_tokens: 4000 // 默认值，或者从 settings 获取
    };
  }
}

// =============================================================================
// MediaContent - 多媒体内容模型
// =============================================================================
class MediaContent {
  constructor({ type, text = null, dataUrl = null, url = null, filename = null, mimeType = null, size = null, metadata = {} }) {
    this.type = type;
    this.text = text;
    this.dataUrl = dataUrl;
    this.url = url;
    this.filename = filename;
    this.mimeType = mimeType;
    this.size = size;
    this.metadata = metadata;
  }

  static fromJSON(obj) { return new MediaContent(obj); }
  static createText(text) { return new MediaContent({ type: 'text', text }); }
  static createImage(dataUrlOrUrl, options = {}) {
    const isDataUrl = dataUrlOrUrl.startsWith('data:');
    return new MediaContent({
      type: 'image',
      dataUrl: isDataUrl ? dataUrlOrUrl : null,
      url: isDataUrl ? null : dataUrlOrUrl,
      ...options
    });
  }
}

// =============================================================================
// 消息结构工厂与转换器
// =============================================================================
class MessageStructure {
  /**
   * 将消息转换为各厂商 API 所需的请求体格式
   */
  static toAPIFormat(message, standard = 'openai') {
    if (standard === 'openai') {
      const result = { role: message.role };
      
      // 优先处理工具调用 (兼容 OpenAI 格式)
      if (message.tool_calls && message.tool_calls.length > 0) {
        result.tool_calls = message.tool_calls;
      }

      if (Array.isArray(message.content)) {
        // 如果是块数组，根据 role 转换
        if (message.role === 'assistant') {
          const toolUses = message.content.filter(b => b.type === 'tool_use');
          const texts = message.content.filter(b => b.type === 'text');
          
          // 如果 content 中有 tool_use 块，且 result 中还没有 tool_calls
          if (toolUses.length > 0 && !result.tool_calls) {
            result.tool_calls = toolUses.map(tu => ({
              id: tu.id,
              type: 'function',
              function: { name: tu.name, arguments: JSON.stringify(tu.input) }
            }));
          }
          
          result.content = texts.map(t => t.text).join('\n\n') || null;
        } else {
          result.content = message.getText();
        }
      } else {
        result.content = message.content;
      }

      if (message.reasoning_content) {
        result.reasoning_content = message.reasoning_content;
      }
      if (message.role === 'tool') {
        result.tool_call_id = message.tool_call_id;
      }
      
      return result;
    }
    return message.toJSON();
  }

  /**
   * 从 API 响应解析为块结构
   */
  static fromAPIResponse(responseMsg) {
    // 逻辑实现...
  }
}

// =============================================================================
// 消息请求模型
// =============================================================================

/**
 * MessagesRequest - 统一的消息请求对象
 * 
 * 职责：
 * 1. 封装发送给 Provider API 的完整请求参数
 * 2. 包含消息列表、模型、采样参数等
 * 3. 包含思考模式 (ThinkingConfig) 配置
 */
class MessagesRequest {
  /**
   * @param {Object} options
   * @param {string} options.model - 模型 ID
   * @param {Array<Message>} options.messages - 消息对象数组
   * @param {string} [options.system] - 系统提示词
   * @param {number} [options.maxTokens] - 最大生成长度
   * @param {number} [options.temperature] - 温度
   * @param {boolean} [options.stream=true] - 是否流式
   * @param {ThinkingConfig} [options.thinking] - 思考模式配置
   * @param {Array} [options.tools] - 工具定义列表
   * @param {Object} [options.metadata] - 额外元数据
   */
  constructor(options) {
    this.model = options.model;
    this.messages = options.messages || [];
    this.system = options.system || null;
    this.maxTokens = options.maxTokens || 2000;
    this.temperature = options.temperature ?? 0.7;
    this.stream = options.stream !== false;
    this.thinking = options.thinking || null;
    this.tools = options.tools || null;
    this.metadata = options.metadata || {};
  }

  /**
   * 验证请求参数
   */
  validate() {
    if (!this.model) throw new Error('Model is required');
    if (!this.messages || this.messages.length === 0) throw new Error('Messages cannot be empty');
    return true;
  }
}

// =============================================================================
// 导出到全局
// =============================================================================
if (typeof window !== 'undefined') {
  window.MessageContent = {
    TextBlock,
    ImageBlock,
    ToolUseBlock,
    ToolResultBlock,
    ThinkingBlock,
    ThinkingConfig,
    MessagesRequest,
    MediaContent,
    MessageStructure
  };
}
