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
      return this.sessions[sessionId] ?? null;
    }
    
    // 设置当前会话
    setCurrentSession(sessionId) {
      this.switchSession(sessionId);
    }
    
    // 获取当前会话
    getCurrentSession() {
      return this.currentSessionId ? (this.sessions[this.currentSessionId] ?? null) : null;
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
    
    /**
     * 删除消息及其关联的工具消息
     * 如果删除的是 assistant 消息且有 tool_calls，则删除对应的所有 tool 消息
     */
    deleteMessageWithTools(sessionId, messageIndex) {
      const session = this.sessions[sessionId];
      if (!session || !session.messages[messageIndex]) return false;
      
      const msgToDelete = session.messages[messageIndex];
      const messagesToRemove = [messageIndex];
      
      // 如果删除的是 assistant 消息且有 tool_calls，找到对应的 tool 消息
      if (msgToDelete.role === 'assistant' && msgToDelete.tool_calls && msgToDelete.tool_calls.length > 0) {
        // 获取所有 tool_call_id
        const toolCallIds = new Set(msgToDelete.tool_calls.map(tc => tc.id));
        
        // 查找后续的 tool 消息
        for (let i = messageIndex + 1; i < session.messages.length; i++) {
          const msg = session.messages[i];
          if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.has(msg.tool_call_id)) {
            messagesToRemove.push(i);
          }
        }
      }
      
      // 从后往前删除（避免索引偏移）
      messagesToRemove.sort((a, b) => b - a);
      messagesToRemove.forEach(idx => {
        session.messages.splice(idx, 1);
      });
      
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
    
    /**
     * 加载所有会话历史（从 storage）
     */
    async loadConversations() {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['conversations', 'currentConversationId'], resolve);
      });
      
      console.log('[SessionManager] Storage data:', result);
      console.log('[SessionManager] Conversations count:', result.conversations?.length || 0);
      
      const conversations = result.conversations || [];
      let currentConversationId = result.currentConversationId;
      
      // 验证当前会话是否有效
      if (currentConversationId) {
        const conv = conversations.find(c => c.id === currentConversationId);
        if (!conv) {
          console.log('[SessionManager] Current conversation not found, resetting');
          currentConversationId = null;
        } else {
          console.log('[SessionManager] Found current conversation:', currentConversationId);
        }
      }
      
      // 将历史会话加载到内存中
      conversations.forEach(conv => {
        if (!this.sessions[conv.id]) {
          this.sessions[conv.id] = {
            id: conv.id,
            messages: [...conv.messages],
            isLoading: false,
            port: null,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt
          };
          console.log('[SessionManager] Loaded session:', conv.id, 'messages:', conv.messages.length);
        }
      });
      
      this.currentSessionId = currentConversationId;
      
      console.log('[SessionManager] Total sessions in memory:', Object.keys(this.sessions).length);
      console.log('[SessionManager] Current session ID:', this.currentSessionId);
      
      return {
        conversations,
        currentConversationId
      };
    }
    
    /**
     * 保存所有会话历史（到 storage）
     */
    async saveConversations() {
      const conversations = Object.values(this.sessions).map(session => ({
        id: session.id,
        messages: [...session.messages],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));
      
      await chrome.storage.local.set({
        conversations,
        currentConversationId: this.currentSessionId
      });
      
      return conversations;
    }
    
    /**
     * 删除会话（包括从 storage 中删除）
     */
    async deleteConversation(sessionId) {
      // 取消请求并从内存中删除
      this.deleteSession(sessionId);
      
      // 从 storage 中删除
      await this.saveConversations();
    }
    
    /**
     * 加载消息和会话（包含设置）
     */
    async loadMessages() {
      const result = await this.loadConversations();
      
      // 加载设置
      const settingsResult = await new Promise((resolve) => {
        chrome.storage.local.get(['settings'], resolve);
      });
      
      return {
        conversations: result.conversations,
        currentConversationId: result.currentConversationId,
        currentSettings: settingsResult.settings || {}
      };
    }
    
    /**
     * 清空当前会话并创建新会话
     */
    async clearCurrentSession() {
      this.currentSessionId = null;
      this.setCurrentSession(null);
      
      // 创建一个新的空会话
      const newSessionId = 'conv_' + Date.now();
      this.createSession(newSessionId, []);
      this.setCurrentSession(newSessionId);
      
      // 保存到 storage
      await this.saveConversations();
      
      return newSessionId;
    }
  }
  
  // 全局单例
  window.SessionManager = new SessionManager();
})();
