/**
 * 会话控制器
 * 负责会话的业务逻辑协调，委托给 SessionManager 进行数据操作
 */

class SessionController {
  constructor() {
    // 等待 SessionManager 初始化完成
    this.manager = null;
  }
  
  /**
   * 初始化 SessionManager 引用（由 app.js 调用）
   */
  init() {
    if (window.sessionManagerInstance) {
      this.manager = window.sessionManagerInstance;
      console.log('[SessionController] Delegating to SessionManager');
      return true;
    }
    console.warn('[SessionController] SessionManager not ready yet');
    return false;
  }
  
  /**
   * 获取当前会话
   */
  getCurrentSession() {
    if (!this.manager) {
      console.warn('[SessionController] SessionManager not ready');
      return null;
    }
    return this.manager.getCurrentSession();
  }
  
  /**
   * 创建新会话
   */
  createSession(title = '新对话') {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return null;
    }
    // 用户手动点击“新建对话”时，立即持久化
    return this.manager.createSession({ title, persist: true });
  }
  
  /**
   * 切换到指定会话
   */
  switchSession(sessionId) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return null;
    }
    return this.manager.loadSession(sessionId);
  }
  
  /**
   * 删除会话
   */
  deleteSession(sessionId) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return false;
    }
    return this.manager.deleteSession(sessionId);
  }
  
  /**
   * 添加消息到当前会话
   */
  addMessage(message) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return false;
    }
    return this.manager.addMessage(message);
  }

  /**
   * 批量添加消息到当前会话
   * @param {Array<Message>} messages 
   * @returns {boolean}
   */
  addMessages(messages) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return false;
    }
    return this.manager.addMessages(messages);
  }
  
  /**
   * 更新消息（用于流式更新等场景）
   * @param {string} messageId 
   * @param {Function} updater 
   * @returns {boolean}
   */
  updateMessage(messageId, updater) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return false;
    }
    return this.manager.updateMessage(messageId, updater);
  }
  
  /**
   * 删除消息
   * @param {string} messageId 
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    if (!this.manager) {
      console.error('[SessionController] SessionManager not ready');
      return false;
    }
    return this.manager.deleteMessage(messageId);
  }
  
  /**
   * 获取所有会话列表
   */
  getSessions() {
    if (!this.manager) {
      console.warn('[SessionController] SessionManager not ready');
      return [];
    }
    return this.manager.getAllSessions();
  }
  
  /**
   * 清空当前会话
   */
  clearCurrentSession() {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    session.clearMessages();
    // SessionManager 会在 addMessage 时自动保存，这里需要手动触发保存
    if (this.manager) {
      this.manager._saveSessions();
    }
    console.log('[SessionController] Cleared current session');
    return true;
  }
}

// 导出单例
window.SessionController = new SessionController();
