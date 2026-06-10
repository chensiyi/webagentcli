/**
 * ToolDefinition - 工具契约（静态、不可变）
 *
 * 职责：
 * 1. 声明一个工具的名字、描述、参数 JSON Schema
 * 2. 不含任何执行逻辑、不含协议字段
 *
 * 设计原则：
 * - 纯数据：只表达"是什么"，不表达"做什么"
 * - 一旦创建不可变（冻结）
 * - 协议无关：OpenAI/Anthropic 的转换在 MessageStructure 中处理
 */
class ToolDefinition {
  /**
   * @param {Object} params
   * @param {string} params.name - 工具唯一名（如 'get_page_content'）
   * @param {string} params.description - 工具描述（供 LLM 理解）
   * @param {Object} params.parameters - JSON Schema (OpenAI function calling 格式)
   * @param {boolean} [params.requiresApproval=false] - 是否需要用户确认才能执行
   * @param {Object} [params.metadata] - 额外元数据（分类、图标等）
   */
  constructor({ name, description, parameters, requiresApproval = false, metadata = {} } = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('ToolDefinition: name must be a non-empty string');
    }
    if (typeof description !== 'string') {
      throw new Error('ToolDefinition: description must be a string');
    }
    if (!parameters || typeof parameters !== 'object' || parameters.type !== 'object') {
      throw new Error('ToolDefinition: parameters must be a JSON Schema with type:"object"');
    }

    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.requiresApproval = !!requiresApproval;
    this.metadata = metadata;

    // 冻结：ToolDefinition 一旦声明不可变
    Object.freeze(this);
  }

  /**
   * 序列化为 OpenAI function calling 格式
   * 注意：协议字段隔离在 M 层外
   */
  toOpenAIFunction() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      requiresApproval: this.requiresApproval,
      metadata: this.metadata
    };
  }

  static fromJSON(obj) {
    return new ToolDefinition(obj);
  }
}

if (typeof window !== 'undefined') {
  window.ToolDefinition = ToolDefinition;
}