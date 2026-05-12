/**
 * Session - 会话业务模型（协议无关）
 * 
 * 表示一次完整的对话会话，不包含任何 API 标准相关的字段。
 */

class Session {
  /**
   * @param {Object} params
   * @param {string} [params.id] - 唯一标识（可选，自动生成）
   * @param {string} [params.title] - 会话标题
   * @param {Array<Message>} [params.messages] - 消息列表
   * @param {boolean} [params.isLoading] - 是否正在接收响应
   * @param {Object} [params.enabledTools] - 启用的工具集合 { [toolName]: boolean }
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor({
    id = crypto.randomUUID(),
    title = '',
    messages = [],
    isLoading = false,
    enabledTools = {},
    metadata = {}
  }) {
    this.id = id;
    this.title = title;
    this.messages = messages;
    this.isLoading = isLoading;
    this.enabledTools = enabledTools;
    this.metadata = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...metadata
    };
    
    // 当前活跃的请求引用（用于取消）
    this._activeRequest = null;
  }

  /**
   * 添加消息
   * @param {Message} message 
   */
  addMessage(message) {
    this.messages.push(message);
    this.metadata.updatedAt = Date.now();
  }

  /**
   * 删除消息（联动删除关联的工具结果）
   * @param {number} index - 消息索引
   * @returns {Array<number>} 被删除的消息索引列表
   */
  deleteMessage(index) {
    const deletedIndices = [index];
    const message = this.messages[index];
    
    if (!message) return [];

    // 如果是 assistant 消息且有工具调用意图，删除关联的 tool 消息
    if (message.role === 'assistant' && message.hasToolIntentions()) {
      const toolIds = new Set(message.toolIntentions.map(ti => ti.id));
      
      // 从后往前查找并删除 tool 消息
      for (let i = this.messages.length - 1; i > index; i--) {
        const msg = this.messages[i];
        if (msg.role === 'tool' && toolIds.has(msg.toolResultRef)) {
          this.messages.splice(i, 1);
          deletedIndices.push(i);
        } else if (msg.role !== 'tool') {
          // 遇到非 tool 消息，停止查找
          break;
        }
      }
    }

    // 删除目标消息
    this.messages.splice(index, 1);
    this.metadata.updatedAt = Date.now();

    return deletedIndices.sort((a, b) => a - b);
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  /**
   * 获取最后一条助手消息
   */
  getLastAssistantMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'assistant') {
        return this.messages[i];
      }
    }
    return null;
  }

  /**
   * 设置活跃请求
   * @param {*} request - 请求引用
   */
  setActiveRequest(request) {
    this._activeRequest = request;
    this.isLoading = true;
  }

  /**
   * 清除活跃请求
   */
  clearActiveRequest() {
    this._activeRequest = null;
    this.isLoading = false;
  }

  /**
   * 获取活跃请求
   */
  getActiveRequest() {
    return this._activeRequest;
  }

  /**
   * 取消活跃请求
   */
  cancelActiveRequest() {
    if (this._activeRequest) {
      if (this._activeRequest.abort) {
        this._activeRequest.abort();
      } else if (this._activeRequest.disconnect) {
        this._activeRequest.disconnect();
      }
      this.clearActiveRequest();
    }
  }

  /**
   * 启用/禁用工具
   * @param {string} toolName - 工具名称
   * @param {boolean} enabled - 是否启用
   */
  toggleTool(toolName, enabled) {
    this.enabledTools[toolName] = enabled;
  }

  /**
   * 检查工具是否启用
   * @param {string} toolName 
   */
  isToolEnabled(toolName) {
    return this.enabledTools[toolName] !== false;
  }

  /**
   * 获取所有启用的工具名称
   */
  getEnabledToolNames() {
    return Object.keys(this.enabledTools).filter(name => this.enabledTools[name]);
  }

  /**
   * 更新标题
   * @param {string} title 
   */
  updateTitle(title) {
    this.title = title;
    this.metadata.updatedAt = Date.now();
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      messages: this.messages.map(msg => msg.toJSON ? msg.toJSON() : msg),
      isLoading: this.isLoading,
      enabledTools: this.enabledTools,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建 Session 实例
   */
  static fromJSON(obj) {
    // 还原 messages
    const messages = (obj.messages || []).map(msg => 
      window.Message ? window.Message.fromJSON(msg) : msg
    );
    
    return new Session({
      ...obj,
      messages
    });
  }
}

// 导出（同时支持 ES Module 和全局变量）
if (typeof window !== 'undefined') {
  window.Session = Session;
}
export { Session };
