/**
 * Message - 核心业务模型（协议无关）
 * 
 * 表示聊天中的一条消息，不包含任何 API 标准相关的字段。
 * 支持流式更新和节流渲染机制。
 */

class Message {
  /**
   * @param {Object} params
   * @param {string} [params.id] - 唯一标识（可选，自动生成）
   * @param {'user'|'assistant'|'system'|'tool'} params.role - 消息角色
   * @param {string|Array<MediaContent>} params.content - 消息内容（文本或多媒体数组）
   * @param {Array<ToolIntention>} [params.toolIntentions] - 工具调用意图列表
   * @param {string} [params.toolResultRef] - 关联的工具调用 ID（仅 tool 角色）
   * @param {Object} [params.metadata] - 元数据（思考过程、时间戳等）
   */
  constructor({
    id = crypto.randomUUID(),
    role,
    content,
    toolIntentions = [],
    toolResultRef = null,
    metadata = {}
  }) {
    // 验证必填字段
    if (!role || !['user', 'assistant', 'system', 'tool'].includes(role)) {
      throw new Error(`Invalid message role: ${role}`);
    }
    
    if (content === undefined || content === null) {
      throw new Error('Message content is required');
    }

    this.id = id;
    this.role = role;
    this.content = content;
    this.toolIntentions = toolIntentions;
    this.toolResultRef = toolResultRef;
    this.metadata = {
      timestamp: Date.now(),
      ...metadata
    };

    // 节流渲染相关
    this._lastRenderTime = 0;
    this._pendingUpdate = false;
    this._renderThrottleMs = 50; // 默认最大渲染频率：50ms（20fps）

    // 冻结对象，防止意外修改
    Object.freeze(this);
  }

  /**
   * 判断是否为文本消息
   */
  isText() {
    return typeof this.content === 'string';
  }

  /**
   * 判断是否为多模态消息
   */
  isMultimodal() {
    return Array.isArray(this.content) && this.content.length > 0;
  }

  /**
   * 获取多媒体内容列表
   * @returns {Array<MediaContent>}
   */
  getMediaContents() {
    if (this.isMultimodal()) {
      return this.content;
    }
    // 如果是纯文本，转换为单个 MediaContent
    if (typeof window !== 'undefined' && window.MediaContent) {
      return [window.MediaContent.createText(this.content)];
    }
    return [];
  }

  /**
   * 判断是否包含工具调用意图
   */
  hasToolIntentions() {
    return this.toolIntentions && this.toolIntentions.length > 0;
  }

  /**
   * 判断是否为工具结果消息
   */
  isToolResult() {
    return this.role === 'tool' && !!this.toolResultRef;
  }

  /**
   * 获取纯文本内容（多模态消息提取文本部分）
   */
  getTextContent() {
    if (typeof this.content === 'string') {
      return this.content;
    }
    
    if (Array.isArray(this.content)) {
      return this.content
        .map(item => {
          // 如果是 MediaContent 对象
          if (item.getDisplayText && typeof item.getDisplayText === 'function') {
            return item.getDisplayText();
          }
          // 如果是普通对象
          if (item.type === 'text') {
            return item.text;
          }
          return '';
        })
        .filter(text => text.length > 0)
        .join('\n');
    }
    
    return '';
  }

  /**
   * 设置节流渲染间隔（毫秒）
   * @param {number} ms - 最小渲染间隔
   */
  setRenderThrottle(ms) {
    this._renderThrottleMs = ms;
  }

  /**
   * 检查是否可以渲染（基于节流机制）
   * @returns {boolean} 是否应该立即渲染
   */
  shouldRender() {
    const now = Date.now();
    const timeSinceLastRender = now - this._lastRenderTime;
    
    if (timeSinceLastRender >= this._renderThrottleMs) {
      this._lastRenderTime = now;
      this._pendingUpdate = false;
      return true;
    }
    
    // 标记有待处理更新
    this._pendingUpdate = true;
    return false;
  }

  /**
   * 强制渲染（忽略节流）
   */
  forceRender() {
    this._lastRenderTime = Date.now();
    this._pendingUpdate = false;
  }

  /**
   * 检查是否有待处理的更新
   */
  hasPendingUpdate() {
    return this._pendingUpdate;
  }

  /**
   * 重置渲染状态
   */
  resetRenderState() {
    this._lastRenderTime = 0;
    this._pendingUpdate = false;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      toolIntentions: this.toolIntentions.map(ti => ti.toJSON ? ti.toJSON() : ti),
      toolResultRef: this.toolResultRef,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建 Message 实例
   */
  static fromJSON(obj) {
    // 还原 toolIntentions
    const toolIntentions = (obj.toolIntentions || []).map(ti => 
      window.ToolIntention ? window.ToolIntention.fromJSON(ti) : ti
    );
    
    return new Message({
      ...obj,
      toolIntentions
    });
  }
}

// 导出（同时支持 ES Module 和全局变量）
if (typeof window !== 'undefined') {
  window.Message = Message;
}
export { Message };
