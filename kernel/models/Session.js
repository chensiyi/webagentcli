/**
 * Session - 会话模型
 *
 * 职责：
 * 1. 维护会话内的消息列表（每条消息可携带 ToolCall[]）
 * 2. 提供工具集合的查询视图（不独立存储 ToolCall）
 * 3. ToolResult 不属于 Session，Controller 单独管理（按"消息流"对齐）
 *
 * 设计原则：
 * - ToolCall 始终是 Message 的子对象（消息流）
 * - 视图方法仅做查询/过滤，不修改数据
 * - 状态机修改（pending/executing/completed）由 Controller 通过字段控制
 */
class Session extends window.BaseModel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || '新对话';
    this.messages = options.messages || [];
    this.metadata = options.metadata || {};

    // 思考模式配置（单一变量）
    this.reasoningEffort = options.reasoningEffort || 'medium'; // 'off' | 'low' | 'medium' | 'high'

    // 运行时状态（不持久化）
    this.port = null;
    this.isStreaming = false;
  }

  // ==================== 消息管理 ====================

  addMessage(message) {
    this.messages.push(message);
    this.touch();
  }

  removeMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.touch();
      return true;
    }
    return false;
  }

  updateMessage(messageId, updater) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return false;
    const result = updater(message);
    if (result && result !== message) {
      const index = this.messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        this.messages[index] = result;
      }
    }
    this.touch();
    return true;
  }

  getLastMessage() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  clearMessages() {
    this.messages = [];
    this.touch();
  }

  hasMessages() {
    return this.messages.length > 0;
  }

  // ==================== 工具调用视图（不存储，仅查询）====================

  /**
   * 获取会话中所有的 ToolCall
   * @returns {ToolCall[]}
   */
  getAllToolCalls() {
    const result = [];
    this.messages.forEach(msg => {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push(...msg.toolCalls);
      }
    });
    return result;
  }

  /**
   * 获取指定 message 上的 ToolCall
   */
  getToolCallsOfMessage(messageId) {
    const msg = this.messages.find(m => m.id === messageId);
    return msg && msg.toolCalls ? msg.toolCalls : [];
  }

  /**
   * 通过 id 在所有消息中查找 ToolCall
   */
  findToolCall(toolCallId) {
    for (const msg of this.messages) {
      if (msg.toolCalls) {
        const found = msg.toolCalls.find(tc => tc.id === toolCallId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 是否有任何工具调用
   */
  hasToolCalls() {
    return this.getAllToolCalls().length > 0;
  }

  /**
   * 获取所有 Role.TOOL 消息（用于判断哪些 ToolCall 已有结果回传）
   */
  getToolResultMessages() {
    return this.messages.filter(m => m.role === window.Role.TOOL);
  }

  /**
   * 找出尚未被 ToolResult 消息回应的 ToolCall
   * （pending 视图，由 Controller 用来判断是否需要继续轮询 AI）
   * @returns {ToolCall[]}
   */
  getPendingToolCalls() {
    const answeredIds = new Set(
      this.getToolResultMessages()
        .map(m => m.toolCallId)
        .filter(Boolean)
    );
    return this.getAllToolCalls().filter(tc => !answeredIds.has(tc.id));
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      ...this.title && { title: this.title },
      ...this.messages && { messages: this.messages.map(m => m.toJSON ? m.toJSON() : m) },
      ...(Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata },
      ...this.reasoningEffort && { reasoningEffort: this.reasoningEffort }
    };
  }

  /**
   * 从纯对象创建
   */
  static fromJSON(data) {
    const session = new Session(data);
    if (data.messages && Array.isArray(data.messages)) {
      session.messages = data.messages.map(m =>
        m instanceof window.Message ? m : window.Message.fromJSON(m)
      );
    }
    return session;
  }
}

if (typeof window !== 'undefined') {
  window.Session = Session;
}