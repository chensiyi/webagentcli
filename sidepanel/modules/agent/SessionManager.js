/**
 * 会话管理器 - SessionManager
 * 
 * 职责：管理多个对话的状态和流式请求
 * 
 * 核心功能：
 * - 多会话管理：支持同时存在多个对话，每个会话独立维护消息历史
 * - 流式请求绑定：将 AI 请求的 port 绑定到特定会话，切换会话不影响正在进行的请求
 * - 状态同步：isLoading、port、messages 等状态统一管理
 * - 会话生命周期：创建、切换、清除、删除
 * - 工具联动删除：删除 assistant 消息时自动删除对应的 tool 消息
 * 
 * 设计原则：
 * - 单一数据源：所有会话状态集中在 sessions 对象中
 * - 解耦 UI 和业务逻辑：SessionManager 不关心 UI 如何渲染
 * - 自动清理：监听 port.onDisconnect 自动更新状态
 * 
 * @example
 * // 创建会话
 * const session = SessionManager.createSession('session_123');
 * 
 * // 添加消息
 * SessionManager.addMessage('session_123', {
 *   role: 'user',
 *   content: '你好'
 * });
 * 
 * // 开始流式请求
 * const port = chrome.runtime.connect({ name: 'chat-stream' });
 * SessionManager.startStreamRequest('session_123', port);
 * 
 * // 保存会话
 * SessionManager.saveConversations();
 */
(function() {
  'use strict';
  
  class SessionManager {
  constructor() {
    /**
     * 会话存储对象
     * @type {Object.<string, Session>}
     * @property {string} id - 会话唯一标识
     * @property {Array<Message>} messages - 消息列表
     * @property {boolean} isLoading - 是否正在加载
     * @property {chrome.runtime.Port|null} port - 当前活动的 port 连接
     * @property {Object.<string, boolean>} enabledTools - 启用的工具状态
     * @property {number} createdAt - 创建时间戳
     * @property {number} updatedAt - 更新时间戳
     */
    this.sessions = {};
    
    /**
     * 当前会话 ID
     * @type {string|null}
     */
    this.currentSessionId = null;
  }
    
  /**
   * 创建新会话
   * 
   * @param {string} sessionId - 会话唯一标识（建议使用时间戳或 UUID）
   * @param {Array<Message>} [initialMessages=[]] - 初始消息数组（可选）
   * @returns {Session} 创建的会话对象
   * 
   * @example
   * const session = createSession('session_' + Date.now());
   * console.log(session.id); // 'session_1234567890'
   */
  createSession(sessionId, initialMessages = []) {
      this.sessions[sessionId] = {
        id: sessionId,
        messages: [...initialMessages],
        isLoading: false,
        port: null,
        enabledTools: {}, // 工具启用状态（跟随会话）
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return this.sessions[sessionId];
    }
    
  /**
   * 获取指定会话
   * 
   * @param {string} sessionId - 会话 ID
   * @returns {Session|null} 会话对象，不存在则返回 null
   * 
   * @example
   * const session = getSession('session_123');
   * if (session) {
   *   console.log(session.messages.length);
   * }
   */
  getSession(sessionId) {
    return this.sessions[sessionId] ?? null;
  }
    
  /**
   * 设置当前会话（切换到指定会话）
   * 
   * @param {string} sessionId - 要设为当前的会话 ID
   * 
   * @example
   * setCurrentSession('session_456');
   * const current = getCurrentSession();
   * console.log(current.id); // 'session_456'
   */
  setCurrentSession(sessionId) {
    this.switchSession(sessionId);
  }
    
  /**
   * 获取当前会话
   * 
   * @returns {Session|null} 当前会话对象，不存在则返回 null
   * 
   * @example
   * const session = getCurrentSession();
   * if (session) {
   *   renderMessages(session.messages);
   * }
   */
  getCurrentSession() {
    return this.currentSessionId ? (this.sessions[this.currentSessionId] ?? null) : null;
  }
    
  /**
   * 开始流式请求（将 port 绑定到会话）
   * 
   * 此方法会：
   * 1. 断开会话之前的 port 连接（如果有）
   * 2. 绑定新的 port 到会话
   * 3. 设置 isLoading 为 true
   * 4. 监听 port.onDisconnect 事件，自动清理状态
   * 
   * @param {string} sessionId - 会话 ID
   * @param {chrome.runtime.Port} port - Chrome runtime port 对象
   * @returns {boolean} 是否成功绑定
   * 
   * @example
   * const port = chrome.runtime.connect({ name: 'chat-stream' });
   * startStreamRequest('session_123', port);
   * 
   * // port 断开时会自动执行：
   * // session.port = null
   * // session.isLoading = false
   */
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
    
  /**
   * 完成流式请求（重置会话状态）
   * 
   * @param {string} sessionId - 会话 ID
   * 
   * @example
   * // 收到 complete 消息后调用
   * completeStreamRequest('session_123');
   */
  completeStreamRequest(sessionId) {
      const session = this.sessions[sessionId];
      if (!session) return;
      
      session.isLoading = false;
      session.port = null;
      session.updatedAt = Date.now();
    }
    
  /**
   * 取消请求（主动断开 port 连接）
   * 
   * @param {string} sessionId - 会话 ID
   * 
   * @example
   * // 用户点击停止按钮时调用
   * cancelRequest('session_123');
   */
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
    
  /**
   * 切换会话（不断开其他会话的请求）
   * 
   * 注意：此方法只更新 currentSessionId，不会断开其他会话的 port 连接。
   * 这允许用户在多个会话之间快速切换，而不影响正在进行的请求。
   * 
   * @param {string} sessionId - 要切换到的会话 ID
   * 
   * @example
   * // 用户点击左侧会话列表中的某个会话
   * switchSession('session_456');
   * // session_123 的请求会继续完成，但 UI 显示 session_456
   */
  switchSession(sessionId) {
    this.currentSessionId = sessionId;
    // 不取消其他会话的请求，让它们自然完成
  }
    
  /**
   * 添加消息到会话
   * 
   * 如果消息没有 id，会自动生成唯一 ID（格式：msg_{timestamp}_{random}）
   * 
   * @param {string} sessionId - 会话 ID
   * @param {Message} message - 消息对象
   * @param {string} message.role - 消息角色（'user'|'assistant'|'system'|'tool'）
   * @param {string|Array} message.content - 消息内容（支持多模态数组）
   * @param {Array<ToolCall>} [message.tool_calls] - 工具调用列表（仅 assistant）
   * @param {string} [message.tool_call_id] - 工具调用 ID（仅 tool）
   * @param {string} [message.name] - 工具名称（仅 tool）
   * @param {Object} [message.additional_kwargs] - 额外数据（如 reasoning_content）
   * @returns {boolean} 是否成功添加
   * 
   * @example
   * addMessage('session_123', {
   *   role: 'user',
   *   content: '你好'
   * });
   * 
   * // 多模态消息
   * addMessage('session_123', {
   *   role: 'user',
   *   content: [
   *     { type: 'text', text: '这张图片是什么？' },
   *     { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
   *   ]
   * });
   */
  addMessage(sessionId, message) {
      const session = this.sessions[sessionId];
      if (!session) return false;
      
      // 为消息生成唯一 ID（如果没有）
      if (!message.id) {
        message.id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      session.messages.push(message);
      session.updatedAt = Date.now();
      return true;
    }
    
    /**
     * 删除消息及其关联的工具消息
     * 1. 如果删除的是 assistant 消息且有 tool_calls，则删除对应的所有 tool 消息
     * 2. 如果删除的是 tool 消息，建议用户删除对应的 assistant 消息（可选）
     */
    deleteMessageWithTools(sessionId, messageIndex) {
      const session = this.sessions[sessionId];
      if (!session || !session.messages[messageIndex]) return false;
      
      const msgToDelete = session.messages[messageIndex];
      const messagesToRemove = [messageIndex];
      
      // 情况1：删除的是 assistant 消息且有 tool_calls
      if (msgToDelete.role === 'assistant' && msgToDelete.tool_calls && msgToDelete.tool_calls.length > 0) {
        // 获取所有 tool_call_id
        const toolCallIds = new Set(msgToDelete.tool_calls.map(tc => tc.id));
        
        // 查找后续的 tool 消息
        for (let i = messageIndex + 1; i < session.messages.length; i++) {
          const msg = session.messages[i];
          if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.has(msg.tool_call_id)) {
            messagesToRemove.push(i);
          } else if (msg.role !== 'tool') {
            // 遇到非 tool 消息，停止查找
            break;
          }
        }
      }
      // 情况2：删除的是 tool 消息
      else if (msgToDelete.role === 'tool') {
        // 向上查找对应的 assistant 消息
        let assistantIndex = -1;
        for (let i = messageIndex - 1; i >= 0; i--) {
          const msg = session.messages[i];
          if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            // 检查这个 assistant 是否有对应的 tool_call_id
            const toolCallIds = msg.tool_calls.map(tc => tc.id);
            if (toolCallIds.includes(msgToDelete.tool_call_id)) {
              assistantIndex = i;
              break;
            }
          }
        }
        
        if (assistantIndex !== -1) {
          // 找到对应的 assistant，删除整个工具调用组
          const assistantMsg = session.messages[assistantIndex];
          const toolCallIds = new Set(assistantMsg.tool_calls.map(tc => tc.id));
          
          // 添加 assistant 消息
          messagesToRemove.push(assistantIndex);
          
          // 添加所有相关的 tool 消息
          for (let i = assistantIndex + 1; i < session.messages.length; i++) {
            const msg = session.messages[i];
            if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.has(msg.tool_call_id)) {
              messagesToRemove.push(i);
            } else if (msg.role !== 'tool') {
              break;
            }
          }
        } else {
          // 没有找到对应的 assistant，只删除这个 tool 消息
          console.warn('[SessionManager] Orphan tool message deleted without parent assistant');
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
    
    /**
     * 根据 ID 查找消息
     * @param {string} sessionId - 会话 ID
     * @param {string} messageId - 消息 ID
     * @returns {Object|null} 消息对象或 null
     */
    getMessageById(sessionId, messageId) {
      const session = this.sessions[sessionId];
      if (!session || !messageId) return null;
      return session.messages.find(msg => msg.id === messageId) || null;
    }
    
    /**
     * 根据 ID 更新消息内容
     * @param {string} sessionId - 会话 ID
     * @param {string} messageId - 消息 ID
     * @param {Object} updates - 要更新的字段
     * @returns {boolean} 是否成功更新
     */
    updateMessageById(sessionId, messageId, updates) {
      const msg = this.getMessageById(sessionId, messageId);
      if (!msg) return false;
      
      Object.assign(msg, updates);
      const session = this.sessions[sessionId];
      if (session) session.updatedAt = Date.now();
      return true;
    }
    
    // 更新最后一条消息（保留兼容）
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
            enabledTools: conv.enabledTools || {}, // 加载工具启用状态
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
        enabledTools: session.enabledTools || {}, // 保存工具启用状态
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
    
    /**
     * 切换当前会话的工具启用状态
     */
    toggleSessionTool(toolId, enabled) {
      const session = this.getCurrentSession();
      if (!session) return false;
      
      if (enabled) {
        session.enabledTools[toolId] = true;
      } else {
        delete session.enabledTools[toolId];
      }
      
      return true;
    }
    
    /**
     * 获取当前会话的启用工具列表
     */
    getSessionEnabledTools() {
      const session = this.getCurrentSession();
      if (!session) {
        console.log('[SessionManager] No current session, returning empty tools');
        return {};
      }
      
      const tools = session.enabledTools || {};
      console.log('[SessionManager] Current session enabled tools:', session.id, tools);
      return tools;
    }
    
    /**
     * 检查会话是否正在活跃（有活跃的 port 连接或正在执行工具）
     * 
     * 这是一个派生状态，通过检查实际的活跃连接来动态计算，
     * 而不是依赖手动维护的 isLoading 变量。
     * 
     * @param {string} sessionId - 会话 ID
     * @returns {boolean} 是否正在活跃
     */
    isSessionActive(sessionId) {
      const session = this.sessions[sessionId];
      if (!session) return false;
      
      // 如果有活跃的 port 连接，说明正在流式请求中
      if (session.port) {
        return true;
      }
      
      // 检查最后一条消息是否是空的 assistant 占位符
      // （这表示工具执行后正在等待下一轮响应）
      if (session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.tool_calls) {
          return true;
        }
      }
      
      return false;
    }
  }
  
  // 全局单例
  window.SessionManager = new SessionManager();
})();
