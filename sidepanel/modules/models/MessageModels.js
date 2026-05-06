/**
 * 标准化消息数据模型 - Anthropic 格式
 * 
 * 基于 free-claude-code 项目的 api/models/anthropic.py
 * 定义完整的消息结构，支持工具调用、思考模式等高级功能
 */

// =============================================================================
// 角色枚举
// =============================================================================
export const Role = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
};

// =============================================================================
// 内容块类型
// =============================================================================

/**
 * 文本内容块
 */
export class TextBlock {
  constructor(text) {
    this.type = 'text';
    this.text = text || '';
  }

  static fromString(text) {
    return new TextBlock(text);
  }
}

/**
 * 图片内容块
 */
export class ImageBlock {
  constructor(source) {
    this.type = 'image';
    this.source = source; // { type: 'base64', media_type: 'image/png', data: '...' }
  }
}

/**
 * 工具调用内容块
 */
export class ToolUseBlock {
  constructor(id, name, input) {
    this.type = 'tool_use';
    this.id = id;
    this.name = name;
    this.input = input || {};
  }

  /**
   * 从 OpenAI tool_calls 格式转换
   */
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
export class ToolResultBlock {
  constructor(toolUseId, content) {
    this.type = 'tool_result';
    this.tool_use_id = toolUseId;
    this.content = content; // string | array | object
  }

  /**
   * 序列化工具结果为字符串
   */
  static serializeContent(content) {
    if (content === null || content === undefined) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (typeof content === 'object') {
      return JSON.stringify(content, null, 2);
    }
    return String(content);
  }
}

/**
 * 思考内容块（Thinking Mode）
 */
export class ThinkingBlock {
  constructor(thinking, signature = null) {
    this.type = 'thinking';
    this.thinking = thinking || '';
    this.signature = signature;
  }
}

/**
 * 红皮思考内容块（加密的思考过程）
 */
export class RedactedThinkingBlock {
  constructor(data) {
    this.type = 'redacted_thinking';
    this.data = data;
  }
}

// =============================================================================
// 消息类
// =============================================================================

/**
 * 标准消息类
 * 支持多种内容格式：字符串或内容块数组
 */
export class Message {
  constructor(role, content, options = {}) {
    this.role = role;
    this.content = content; // string | Array<TextBlock|ImageBlock|ToolUseBlock|...>
    this.reasoning_content = options.reasoning_content || null;
    
    // 兼容 OpenAI 格式
    if (role === 'assistant' && options.tool_calls) {
      this.tool_calls = options.tool_calls;
    }
    if (role === 'tool' && options.tool_call_id) {
      this.tool_call_id = options.tool_call_id;
    }
  }

  /**
   * 从 OpenAI 格式转换
   */
  static fromOpenAIMessage(openaiMsg) {
    const role = openaiMsg.role;
    let content = openaiMsg.content;
    
    // 如果有 reasoning_content，提取为单独字段
    const reasoning_content = openaiMsg.reasoning_content || null;
    
    // 如果有 tool_calls，转换为 Anthropic 格式
    const tool_calls = openaiMsg.tool_calls || null;
    
    if (role === 'assistant' && tool_calls) {
      // 将 tool_calls 转换为 content 块数组
      const blocks = [];
      
      // 添加文本内容（如果有）
      if (content && typeof content === 'string' && content.trim()) {
        blocks.push(TextBlock.fromString(content));
      }
      
      // 添加工具调用
      tool_calls.forEach(tc => {
        blocks.push(ToolUseBlock.fromOpenAIToolCall(tc));
      });
      
      content = blocks;
    }
    
    return new Message(role, content, {
      reasoning_content,
      tool_calls: role === 'assistant' ? tool_calls : undefined,
      tool_call_id: role === 'tool' ? openaiMsg.tool_call_id : undefined
    });
  }

  /**
   * 转换为 OpenAI 格式
   */
  toOpenAIFormat() {
    const result = {
      role: this.role
    };

    if (this.role === 'assistant') {
      // 检查是否有工具调用块
      if (Array.isArray(this.content)) {
        const toolUses = this.content.filter(block => block.type === 'tool_use');
        const textBlocks = this.content.filter(block => block.type === 'text');
        
        if (toolUses.length > 0) {
          // 转换为 OpenAI tool_calls 格式
          result.tool_calls = toolUses.map(tu => ({
            id: tu.id,
            type: 'function',
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input)
            }
          }));
          
          // 文本内容
          if (textBlocks.length > 0) {
            result.content = textBlocks.map(tb => tb.text).join('\n\n');
          } else {
            result.content = '';
          }
        } else {
          // 纯文本内容
          result.content = this.content.map(block => {
            if (block.type === 'text') return block.text;
            if (block.type === 'thinking') return `<think>\n${block.thinking}\n</think>`;
            return '';
          }).join('\n\n');
        }
      } else {
        result.content = this.content;
      }
      
      // 添加 reasoning_content
      if (this.reasoning_content) {
        result.reasoning_content = this.reasoning_content;
      }
    } else if (this.role === 'tool') {
      result.tool_call_id = this.tool_call_id;
      result.content = ToolResultBlock.serializeContent(this.content);
    } else {
      result.content = this.content;
    }

    return result;
  }

  /**
   * 判断是否包含工具调用
   */
  hasToolCalls() {
    if (this.tool_calls && this.tool_calls.length > 0) {
      return true;
    }
    if (Array.isArray(this.content)) {
      return this.content.some(block => block.type === 'tool_use');
    }
    return false;
  }

  /**
   * 获取所有工具调用
   */
  getToolCalls() {
    if (this.tool_calls) {
      return this.tool_calls;
    }
    if (Array.isArray(this.content)) {
      return this.content
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        }));
    }
    return [];
  }
}

// =============================================================================
// 工具定义
// =============================================================================

/**
 * 工具定义类
 */
export class Tool {
  constructor(name, description, inputSchema, options = {}) {
    this.name = name;
    this.description = description || '';
    this.input_schema = inputSchema || { type: 'object', properties: {} };
    this.type = options.type || null; // 用于 Anthropic server tools
  }

  /**
   * 从 OpenAI 格式转换
   */
  static fromOpenAITool(openaiTool) {
    return new Tool(
      openaiTool.function.name,
      openaiTool.function.description || '',
      openaiTool.function.parameters || { type: 'object', properties: {} }
    );
  }

  /**
   * 转换为 OpenAI 格式
   */
  toOpenAIFormat() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.input_schema
      }
    };
  }
}

// =============================================================================
// 请求模型
// =============================================================================

/**
 * 思考配置
 */
export class ThinkingConfig {
  constructor(enabled = true, budgetTokens = null) {
    this.enabled = enabled;
    this.budget_tokens = budgetTokens;
  }
}

/**
 * 消息请求
 */
export class MessagesRequest {
  constructor(options) {
    this.model = options.model;
    this.messages = options.messages || [];
    this.system = options.system || null;
    this.max_tokens = options.max_tokens || 2000;
    this.temperature = options.temperature || 0.7;
    this.top_p = options.top_p || null;
    this.top_k = options.top_k || null;
    this.stop_sequences = options.stop_sequences || null;
    this.stream = options.stream !== false;
    this.tools = options.tools || null;
    this.tool_choice = options.tool_choice || null;
    this.thinking = options.thinking || null;
    this.metadata = options.metadata || null;
  }

  /**
   * 验证请求
   */
  validate() {
    if (!this.model) {
      throw new Error('model is required');
    }
    if (!this.messages || this.messages.length === 0) {
      throw new Error('messages cannot be empty');
    }
    return true;
  }

  /**
   * 转换为 API 请求体
   */
  toRequestBody() {
    const body = {
      model: this.model,
      messages: this.messages.map(msg => 
        msg instanceof Message ? msg.toOpenAIFormat() : msg
      ),
      max_tokens: this.max_tokens,
      temperature: this.temperature,
      stream: this.stream
    };

    if (this.system) {
      body.system = this.system;
    }
    if (this.top_p !== null) {
      body.top_p = this.top_p;
    }
    if (this.top_k !== null) {
      body.top_k = this.top_k;
    }
    if (this.stop_sequences) {
      body.stop = this.stop_sequences;
    }
    if (this.tools) {
      body.tools = this.tools.map(tool =>
        tool instanceof Tool ? tool.toOpenAIFormat() : tool
      );
    }
    if (this.tool_choice) {
      body.tool_choice = this.tool_choice;
    }

    return body;
  }
}

// =============================================================================
// 导出
// =============================================================================
export default {
  Role,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
  Message,
  Tool,
  ThinkingConfig,
  MessagesRequest
};
