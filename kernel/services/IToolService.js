/**
 * IToolService - 工具统一接口
 *
 * 每个工具实现此接口，覆盖完整生命周期：
 * 注册 → 启用/关闭 → 调用（带异常/计时） → 销毁
 *
 * ServiceCenter 在 initialization 时注册内置工具，
 * 用户可通过 Settings 页面开关。
 */
class IToolService {
  constructor() {
    if (new.target === IToolService) {
      throw new Error('Cannot instantiate abstract class directly');
    }

    /** @type {ToolDefinition|null} */
    this.definition = null;
    /** @type {boolean} */
    this.enabled = false;
    /** @type {Function|null} handler(toolCallArgs, context) => Promise<any> */
    this._handler = null;
  }

  /**
   * 注册工具定义并挂载执行器
   * @param {ToolDefinition} definition
   * @param {Function} handler - (args: object, context: object) => Promise<any>
   */
  register(definition, handler) {
    if (!definition || !(definition instanceof window.ToolDefinition)) {
      throw new Error('IToolService.register: definition must be a ToolDefinition');
    }
    if (typeof handler !== 'function') {
      throw new Error('IToolService.register: handler must be a function');
    }
    this.definition = definition;
    this._handler = handler;
    this.enabled = true;
    console.log(`[IToolService] Registered: ${definition.name}`);
  }

  /** 启用工具 */
  enable() { this.enabled = true; }

  /** 关闭工具（用户侧禁用） */
  disable() { this.enabled = false; }

  /** 工具是否已注册 */
  isRegistered() { return !!this.definition; }

  /**
   * 调用工具（核心方法）
   * 统一封装：异常捕获、计时、结果封装为 ToolResult
   *
   * @param {ToolCall} toolCall
   * @param {Object} context - { sessionId, messageId, tabId }
   * @returns {Promise<ToolResult>}
   */
  async invoke(toolCall, context = {}) {
    if (!this.isRegistered()) {
      return new window.ToolResult({
        toolCallId: toolCall.id,
        status: 'failed',
        error: 'Tool not registered'
      });
    }
    if (!this.enabled) {
      return new window.ToolResult({
        toolCallId: toolCall.id,
        status: 'cancelled',
        error: 'Tool is disabled'
      });
    }

    const start = Date.now();
    try {
      const output = await this._handler(toolCall.arguments || {}, context);
      return new window.ToolResult({
        toolCallId: toolCall.id,
        status: 'success',
        output,
        duration: Date.now() - start
      });
    } catch (error) {
      return new window.ToolResult({
        toolCallId: toolCall.id,
        status: 'failed',
        error: error.message || String(error),
        duration: Date.now() - start
      });
    }
  }

  /** 序列化（用于持久化用户的启用/关闭状态） */
  toJSON() {
    return {
      definition: this.definition ? this.definition.toJSON() : null,
      enabled: this.enabled
    };
  }

  /** 销毁：清理资源 */
  dispose() {
    this.definition = null;
    this._handler = null;
    this.enabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.IToolService = IToolService;
}