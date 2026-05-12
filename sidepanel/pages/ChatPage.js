/**
 * ChatPage - 聊天页面（原生 JS）
 * 
 * 直接使用新的核心模型层，无需编译
 */

class ChatPage {
  constructor() {
    this.messages = [];
    this.isLoading = false;
    this.isThinking = false;
    this.error = null;
    
    this.init();
  }
  
  init() {
    console.log('[ChatPage] Initializing with new core models...');
    
    // 绑定事件
    this.bindEvents();
    
    // 加载初始消息
    this.loadInitialMessages();
  }
  
  bindEvents() {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const input = document.getElementById('message-input');
    
    sendBtn.addEventListener('click', () => this.sendMessage());
    stopBtn.addEventListener('click', () => this.stopGeneration());
    
    // Enter 发送（Shift+Enter 换行）
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }
  
  loadInitialMessages() {
    // 模拟初始消息
    this.addMessage({
      role: 'assistant',
      content: '你好！我是基于新架构的 AI 助手。\n\n**关键特性：**\n- ✅ 使用新的 Message 模型\n- ✅ 支持节流渲染（50ms）\n- ✅ 完全协议无关\n- ✅ 无需编译，原生 JS',
      timestamp: Date.now()
    });
  }
  
  async sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    try {
      // 1. 创建用户消息（使用新的 Message 模型）
      const userMessage = new Message({
        role: 'user',
        content: text
      });
      
      // 2. 添加到列表并渲染
      this.addMessage(userMessage);
      input.value = '';
      
      // 3. 设置加载状态
      this.setLoading(true);
      
      // 4. 创建空的助手消息
      const assistantMessage = new Message({
        role: 'assistant',
        content: ''
      });
      this.addMessage(assistantMessage);
      
      // 5. 模拟流式响应
      await this.simulateStreamResponse(assistantMessage);
      
    } catch (err) {
      console.error('[ChatPage] Send message failed:', err);
      this.setError(err.message);
      this.setLoading(false);
    }
  }
  
  stopGeneration() {
    console.log('[ChatPage] Stop generation');
    this.setLoading(false);
  }
  
  addMessage(message) {
    this.messages.push(message);
    this.renderMessages();
    this.scrollToBottom();
  }
  
  deleteMessage(index) {
    this.messages.splice(index, 1);
    this.renderMessages();
  }
  
  renderMessages() {
    const container = document.getElementById('message-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.messages.forEach((message, index) => {
      const messageEl = this.createMessageElement(message, index);
      container.appendChild(messageEl);
    });
  }
  
  createMessageElement(message, index) {
    const div = document.createElement('div');
    div.className = `message-item message-${message.role}`;
    
    const isUser = message.role === 'user';
    
    div.innerHTML = `
      <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
      <div class="message-body">
        <div class="message-role">${isUser ? '用户' : 'AI 助手'}</div>
        <div class="message-content">${this.renderContent(message)}</div>
      </div>
      <div class="message-actions">
        <button class="action-btn delete-btn" data-index="${index}" title="删除">🗑️</button>
      </div>
    `;
    
    // 绑定删除事件
    const deleteBtn = div.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => this.deleteMessage(index));
    
    return div;
  }
  
  renderContent(message) {
    if (typeof message.content === 'string') {
      return this.simpleMarkdown(message.content);
    }
    
    if (Array.isArray(message.content)) {
      return message.content.map(part => {
        if (part.type === 'text') return `<p>${part.text}</p>`;
        if (part.type === 'image') return `<img src="${part.dataUrl || part.url}" alt="图片" class="message-image">`;
        return '';
      }).join('');
    }
    
    return '';
  }
  
  simpleMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
  
  async simulateStreamResponse(assistantMessage) {
    const responseText = '这是一个基于新核心模型的演示回复。\n\n我使用了：\n- **Message 模型**：协议无关的消息结构\n- **节流渲染**：控制 UI 更新频率（默认 50ms）\n- **ToolIntention**：替代 OpenAI 的 tool_calls\n- **原生 JS**：无需编译，直接运行';
    const chunks = responseText.split('');
    
    for (let i = 0; i < chunks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 30));
      
      assistantMessage.content += chunks[i];
      
      // 节流渲染：只在需要时更新 UI
      if (assistantMessage.shouldRender()) {
        this.renderMessages();
        this.scrollToBottom();
      }
    }
    
    // 强制最后渲染
    assistantMessage.forceRender();
    this.renderMessages();
    this.setLoading(false);
  }
  
  setLoading(loading) {
    this.isLoading = loading;
    this.isThinking = loading;
    
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusBar = document.getElementById('status-bar');
    
    if (loading) {
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      statusBar.innerHTML = '<div class="thinking-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span> AI 正在思考...</div>';
    } else {
      sendBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
      statusBar.innerHTML = '';
    }
  }
  
  setError(error) {
    this.error = error;
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
      statusBar.innerHTML = `<div class="error-message">❌ ${error}</div>`;
    }
  }
  
  scrollToBottom() {
    const container = document.getElementById('message-list');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ChatPage = ChatPage;
}
