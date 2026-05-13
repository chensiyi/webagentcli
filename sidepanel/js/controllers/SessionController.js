/**
 * 会话控制器
 * 负责会话的创建、切换、保存等核心业务逻辑
 */

class SessionController {
  constructor() {
    this.sessions = [];
    this.currentSessionId = null;
    this.storageKey = 'chat_sessions';
    
    // 加载已保存的会话
    this.loadSessions();
  }
  
  /**
   * 获取当前会话
   */
  getCurrentSession() {
    if (!this.currentSessionId) return null;
    return this.sessions.find(s => s.id === this.currentSessionId) || null;
  }
  
  /**
   * 创建新会话
   */
  createSession(title = '新对话') {
    const session = new window.Session({ title });
    this.sessions.push(session);
    this.currentSessionId = session.id;
    this.saveSessions();
    console.log('[SessionController] Created new session:', session.id);
    return session;
  }
  
  /**
   * 切换到指定会话
   */
  switchSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.warn('[SessionController] Session not found:', sessionId);
      return null;
    }
    
    this.currentSessionId = sessionId;
    console.log('[SessionController] Switched to session:', sessionId);
    return session;
  }
  
  /**
   * 删除会话
   */
  deleteSession(sessionId) {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return false;
    
    this.sessions.splice(index, 1);
    
    // 如果删除的是当前会话，切换到第一个或创建新的
    if (this.currentSessionId === sessionId) {
      if (this.sessions.length > 0) {
        this.currentSessionId = this.sessions[0].id;
      } else {
        this.createSession();
      }
    }
    
    this.saveSessions();
    console.log('[SessionController] Deleted session:', sessionId);
    return true;
  }
  
  /**
   * 添加消息到当前会话
   */
  addMessage(message) {
    const session = this.getCurrentSession();
    if (!session) {
      console.warn('[SessionController] No current session');
      return null;
    }
    
    session.addMessage(message);
    this.saveSessions();
    return message;
  }
  
  /**
   * 获取所有会话列表
   */
  getSessions() {
    return this.sessions.map(s => ({
      id: s.id,
      title: s.title,
      messageCount: s.messages.length,
      updatedAt: s.updatedAt
    }));
  }
  
  /**
   * 清空当前会话
   */
  clearCurrentSession() {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    session.clearMessages();
    this.saveSessions();
    console.log('[SessionController] Cleared current session');
    return true;
  }
  
  /**
   * 保存到存储
   */
  saveSessions() {
    const data = this.sessions.map(s => s.toJSON());
    chrome.storage.local.set({ [this.storageKey]: data }, () => {
      console.log('[SessionController] Saved', data.length, 'sessions');
    });
  }
  
  /**
   * 从存储加载
   */
  loadSessions() {
    chrome.storage.local.get([this.storageKey], (result) => {
      const data = result[this.storageKey];
      if (!data || !Array.isArray(data)) {
        // 如果没有会话，创建一个默认的
        this.createSession();
        return;
      }
      
      this.sessions = data.map(s => window.Session.fromJSON(s));
      
      // 设置当前会话为最后一个
      if (this.sessions.length > 0) {
        this.currentSessionId = this.sessions[this.sessions.length - 1].id;
      }
      
      console.log('[SessionController] Loaded', this.sessions.length, 'sessions');
    });
  }
}

// 导出单例
window.SessionController = new SessionController();
