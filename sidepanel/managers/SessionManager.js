// 会话管理器
// 管理多个对话的状态和流式请求
(function() {
  'use strict';
  
  class SessionManager {
    constructor() {
      this.sessions = {}; // 会话状态 { sessionId: { port, isLoading, messages } }
      this.currentSessionId = null;
    }
    
    // 创建新会话
    createSession(sessionId, initialMessages = []) {
      this.sessions[sessionId] = {
        id: sessionId,
        messages: [...initialMessages],
        isLoading: false,
        port: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return this.sessions[sessionId];
    }
    
    // 获取会话
    getSession(sessionId) {
      return this.sessions[sessionId] || null;
    }
    
    // 设置当前会话
    setCurrentSession(sessionId) {
      this.switchSession(sessionId);
    }
    
    // 获取当前会话
    getCurrentSession() {
      if (!this.currentSessionId) return null;
      return this.sessions[this.currentSessionId] || null;
    }
    
    // 开始流式请求
    startStreamRequest(sessionId, port) {
      const session = this.sessions[sessionId];
      if (!session) return false;
      
      // 如果有正在进行的请求，先断开
      if (session.port) {
        session.port.disconnect();
      }
      
      session.port = port;
      session.isLoading = true;
      session.updatedAt = Date.now();
      
      // 监听 port 断开（用户主动取消或网络错误）
      port.onDisconnect.addListener(() => {
        if (session.port === port) {
          session.port = null;
          session.isLoading = false;
        }
      });
      
      return true;
    }
    
    // 完成流式请求
    completeStreamRequest(sessionId) {
      const session = this.sessions[sessionId];
      if (!session) return;
      
      session.isLoading = false;
      session.port = null;
      session.updatedAt = Date.now();
    }
    
    // 取消请求
    cancelRequest(sessionId) {
      const session = this.sessions[sessionId];
      if (!session) return;
      
      if (session.port) {
        session.port.disconnect();
        session.port = null;
      }
      
      session.isLoading = false;
      session.updatedAt = Date.now();
    }
    
    // 切换会话（不断开请求）
    switchSession(sessionId) {
      this.currentSessionId = sessionId;
      // 不取消其他会话的请求，让它们自然完成
    }
    
    // 添加消息
    addMessage(sessionId, message) {
      const session = this.sessions[sessionId];
      if (!session) return false;
      
      session.messages.push(message);
      session.updatedAt = Date.now();
      return true;
    }
    
    // 更新最后一条消息
    updateLastMessage(sessionId, content) {
      const session = this.sessions[sessionId];
      if (!session || session.messages.length === 0) return false;
      
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content = content;
        session.updatedAt = Date.now();
        return true;
      }
      return false;
    }
    
    // 清除会话
    clearSession(sessionId) {
      const session = this.sessions[sessionId];
      if (!session) return;
      
      // 取消正在进行的请求
      this.cancelRequest(sessionId);
      
      // 清除消息
      session.messages = [];
      session.updatedAt = Date.now();
    }
    
    // 删除会话
    deleteSession(sessionId) {
      this.cancelRequest(sessionId);
      delete this.sessions[sessionId];
      
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
    }
    
    // 获取所有会话
    getAllSessions() {
      return Object.values(this.sessions);
    }
    
    // 检查是否有正在进行的请求
    hasActiveRequest() {
      return Object.values(this.sessions).some(s => s.isLoading);
    }
    
    // 取消所有请求
    cancelAllRequests() {
      Object.keys(this.sessions).forEach(sessionId => {
        this.cancelRequest(sessionId);
      });
    }
  }
  
  // 全局单例
  window.SessionManager = new SessionManager();
})();
