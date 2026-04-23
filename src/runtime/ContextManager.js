// ==================== Context Manager ====================
// 上下文管理 - 维护对话历史和页面状态

class ContextManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { messages, pageState }
  }
  
  /**
   * 创建新会话
   */
  createSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        pageState: null,
        createdAt: Date.now()
      });
      console.log(`[ContextManager] Session created: ${sessionId}`);
    }
  }
  
  /**
   * 添加消息
   */
  addMessage(sessionId, role, content) {
    this.ensureSession(sessionId);
    
    const session = this.sessions.get(sessionId);
    session.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    
    // 持久化
    this.saveSession(sessionId);
  }
  
  /**
   * 获取上下文（发送给 AI）
   */
  getContext(sessionId, maxMessages = 20) {
    this.ensureSession(sessionId);
    
    const session = this.sessions.get(sessionId);
    const messages = session.messages.slice(-maxMessages);
    
    // 添加系统提示
    return [
      {
        role: 'system',
        content: this.getSystemPrompt(session.pageState)
      },
      ...messages
    ];
  }
  
  /**
   * 更新页面状态
   */
  updatePageState(sessionId, pageState) {
    this.ensureSession(sessionId);
    
    const session = this.sessions.get(sessionId);
    session.pageState = {
      ...pageState,
      updatedAt: Date.now()
    };
    
    this.saveSession(sessionId);
  }
  
  /**
   * 获取系统提示
   */
  getSystemPrompt(pageState) {
    let prompt = 'You are a helpful AI assistant with web browsing capabilities.\n\n';
    prompt += 'You can use the following tools to interact with web pages:\n';
    prompt += '- read_page(selector): Read content from the page\n';
    prompt += '- click_element(selector): Click an element\n';
    prompt += '- fill_form(selector, value): Fill a form field\n';
    prompt += '- get_page_info(): Get current page URL and title\n\n';
    
    if (pageState) {
      prompt += `Current page: ${pageState.title || 'Unknown'}\n`;
      prompt += `URL: ${pageState.url || 'Unknown'}\n\n`;
    }
    
    prompt += 'When you need to perform an action, use the appropriate tool. Always explain what you\'re doing before taking action.';
    
    return prompt;
  }
  
  /**
   * 清除会话
   */
  clearSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      chrome.storage.local.remove(`session_${sessionId}`);
      console.log(`[ContextManager] Session cleared: ${sessionId}`);
    }
  }
  
  /**
   * 确保会话存在
   */
  ensureSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.createSession(sessionId);
    }
  }
  
  /**
   * 保存会话到存储
   */
  async saveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    await chrome.storage.local.set({
      [`session_${sessionId}`]: session
    });
  }
  
  /**
   * 从存储加载会话
   */
  async loadSession(sessionId) {
    const result = await chrome.storage.local.get(`session_${sessionId}`);
    const session = result[`session_${sessionId}`];
    
    if (session) {
      this.sessions.set(sessionId, session);
      console.log(`[ContextManager] Session loaded: ${sessionId}`);
      return true;
    }
    
    return false;
  }
}

// 导出单例
export default new ContextManager();
