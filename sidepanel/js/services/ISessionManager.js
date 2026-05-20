/**
 * ISessionManager - 会话管理器接口（纯数据管理，无 UI/协议依赖）
 * 
 * 职责：
 * - 会话 CRUD 操作
 * - 持久化存储（Chrome Storage）
 * - 通过 EventBus 通知状态变化
 * - Chat 实例缓存管理
 * 
 * 设计原则：
 * 1. I 前缀表示这是一个接口规范，可以有不同实现
 * 2. 当前提供默认实现 SessionManagerImpl
 * 3. 使用者可以实现自己的 ISessionManager 并替换
 */

class ISessionManager {
  /**
   * @param {EventBus} eventBus - 事件总线实例
   * @param {Object} storage - 存储接口（默认使用 chrome.storage.local）
   */
  constructor(eventBus, storage = null) {
    this.eventBus = eventBus;
    this.storage = storage || chrome.storage.local;
    
    // 内存中的会话缓存
    this.sessions = new Map(); // sessionId -> Session
    this.currentSessionId = null;
    
    // Chat 实例缓存：sessionId -> Chat
    this.chatCache = new Map();
    
    // 初始化
    this._loadSessions();
  }

  // ==================== 会话管理 ====================

  /**
   * 创建新会话
   * @param {Object} options 
   * @param {string} [options.title] - 会话标题
   * @param {boolean} [options.persist=true] - 是否立即持久化
   * @param {boolean} [options.reasoningEnabled] - 是否开启思考模式（默认根据模型能力决定）
   * @returns {Session} 新创建的会话
   */
  createSession(options = {}) {
    // 自动检测当前模型是否支持 reasoning
    let reasoningEnabled = options.reasoningEnabled;
    if (reasoningEnabled === undefined) {
      // 默认开启 reasoning，由调用方根据需要覆盖
      reasoningEnabled = true;
    }

    const session = new Session({
      title: options.title || '新对话',
      messages: [],
      reasoningEnabled: reasoningEnabled,
      reasoningEffort: 'medium'
    });
      
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
      
    // 默认不立即持久化，除非显式要求（例如用户手动点击“新建对话”）
    if (options.persist) {
      this._saveSessions();
    }
      
    // 发布事件
    this.eventBus.emit(window.Events.CHAT.SESSION_CREATED, { session });
    this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, { sessionId: session.id });
      
    console.log('[SessionManager] Created session:', session.id, 'Reasoning:', reasoningEnabled);
    return session;
  }

  /**
   * 加载指定会话
   * @param {string} sessionId 
   * @returns {Session|null}
   */
  loadSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[SessionManager] Session not found:', sessionId);
      return null;
    }
    
    const previousId = this.currentSessionId;
    this.currentSessionId = sessionId;
    
    // 切换会话时，重新评估并同步会话的环境配置（如 Reasoning, Tools 等）
    this._syncSessionEnvironment(session);
    
    if (previousId !== sessionId) {
      this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, { 
        sessionId, 
        previousId,
        session: session // 携带会话信息，方便 UI 层直接更新状态
      });
    }
    
    this.eventBus.emit(window.Events.CHAT.SESSION_LOADED, { session });
    return session;
  }
  
  /**
   * 获取或创建 Chat 实例
   * @param {string} sessionId - 会话 ID
   * @param {IChatService} chatService - 聊天服务实例
   * @returns {Chat} Chat 实例
   */
  getOrCreateChat(sessionId, chatService) {
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    
    // 检查缓存
    if (this.chatCache.has(sessionId)) {
      const cachedChat = this.chatCache.get(sessionId);
      // 如果服务已变更，更新服务
      if (cachedChat.getService() !== chatService) {
        cachedChat.setService(chatService);
      }
      return cachedChat;
    }
    
    // 获取 Session
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // 创建新的 ChatController 实例（IChat 的实现）
    const chat = new window.ChatController(session, chatService, this, this.eventBus);
    this.chatCache.set(sessionId, chat);
    
    console.log('[SessionManager] Created Chat for session:', sessionId);
    return chat;
  }
  
  /**
   * 获取当前会话的 Chat 实例
   * @param {IChatService} chatService - 聊天服务实例
   * @returns {Chat|EphemeralChat} Chat 实例（如果没有会话则返回临时 Chat）
   */
  getCurrentChat(chatService) {
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    
    // 如果没有当前会话，返回临时 Chat 占位符
    // 注意：sendMessage() 会直接调用 getOrCreateChat()，不会走这里
    if (!this.currentSessionId) {
      return new window.EphemeralChat(this, chatService, this.eventBus);
    }
    
    return this.getOrCreateChat(this.currentSessionId, chatService);
  }
  
  /**
   * 清除 Chat 实例缓存
   * @param {string} [sessionId] - 可选，指定清除某个会话的 Chat，否则清除所有
   */
  clearChatCache(sessionId = null) {
    if (sessionId) {
      this.chatCache.delete(sessionId);
      console.log('[SessionManager] Cleared Chat cache for session:', sessionId);
    } else {
      this.chatCache.clear();
      console.log('[SessionManager] Cleared all Chat caches');
    }
  }

  /**
   * 同步会话环境配置
   * 确保会话中的功能开关（如 Reasoning）与当前选定的模型能力相匹配
   * @param {Session} session 
   */
  _syncSessionEnvironment(session) {
    const settings = window.SettingsController ? window.SettingsController.getSettings() : null;
    if (!settings || !settings.model) return;

    const cacheKey = `models:${settings.apiEndpoint}`;
    const cachedModels = window.StorageModel && window.StorageModel.getCacheSync ? 
      window.StorageModel.getCacheSync(cacheKey) : null;
    
    if (!cachedModels || !Array.isArray(cachedModels)) return;

    const currentModel = cachedModels.find(m => m.id === settings.model);
    if (!currentModel) return;

    // 1. 同步 Reasoning 状态
    const supportsReasoning = typeof currentModel.supportsReasoning === 'function' 
      ? currentModel.supportsReasoning() 
      : (currentModel.capabilities?.reasoning || currentModel.supports_reasoning);

    // 如果模型不支持，强制关闭会话中的 Reasoning 开关
    if (!supportsReasoning && session.reasoningEnabled) {
      console.log(`[SessionManager] Model ${settings.model} does not support reasoning. Disabling for session ${session.id}`);
      session.reasoningEnabled = false;
      this._saveSessions(); // 持久化变更
    }
    
    // 2. 此处可以扩展其他能力的同步逻辑（如工具调用、多媒体等）
    // if (!currentModel.capabilities.toolUse && session.toolsEnabled) { ... }
  }

  /**
   * 获取当前会话
   * @returns {Session|null}
   */
  getCurrentSession() {
    if (!this.currentSessionId) {
      // 如果没有当前会话，返回 null，等待第一条消息触发创建
      return null;
    }
    
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * 删除会话
   * @param {string} sessionId 
   * @param {boolean} autoSwitch - 是否自动切换到第一个可用会话（已废弃，默认 false）
   */
  deleteSession(sessionId, autoSwitch = true) {
    const deleted = this.sessions.delete(sessionId);
    if (!deleted) {
      console.warn('[SessionManager] Session not found for deletion:', sessionId);
      return false;
    }
    
    // 如果删除的是当前会话，清空指向
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
      
      this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, { 
        sessionId: null,
        previousId: sessionId
      });
    }
    
    // 持久化
    this._saveSessions();
    
    // 发布事件
    this.eventBus.emit(window.Events.CHAT.SESSION_DELETED, { sessionId });
    
    console.log('[SessionManager] Deleted session:', sessionId);
    return true;
  }

  /**
   * 获取所有会话列表
   * @returns {Array<Session>}
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * 更新会话标题
   * @param {string} sessionId 
   * @param {string} title 
   */
  updateSessionTitle(sessionId, title) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[SessionManager] Session not found:', sessionId);
      return false;
    }
    
    session.title = title;
    session.updated_at = Date.now();
    
    this._saveSessions();
    this.eventBus.emit(window.Events.CHAT.SESSION_UPDATED, { session });
    
    return true;
  }

  /**
   * 更新会话（通用）
   * @param {string} sessionId 
   * @param {Function} updater - 接收会话对象并执行修改
   * @returns {boolean}
   */
  updateSession(sessionId, updater) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[SessionManager] Session not found:', sessionId);
      return false;
    }
    
    updater(session);
    session.updatedAt = Date.now();
    session.updated_at = session.updatedAt;
    
    this._saveSessions();
    this.eventBus.emit(window.Events.CHAT.SESSION_UPDATED, { session });
    return true;
  }

  // ==================== 消息管理（委托给 Session）====================

  /**
   * 添加消息到当前会话
   * @param {Message} message 
   * @returns {boolean}
   */
  async addMessage(message) {
    let session = this.getCurrentSession();
    
    // 如果当前没有会话，则自动创建一个新会话（此时才真正创建）
    if (!session) {
      session = this.createSession({ title: '新对话', persist: false });
    }
    
    session.addMessage(message);
    
    // 持久化：当产生第一条消息时，确保会话被保存
    await this._saveSessions();
    
    // 发布事件
    this.eventBus.emit(window.Events.CHAT.MESSAGE_ADDED, {
      sessionId: session.id,
      message
    });
    
    return true;
  }

  /**
   * 批量添加消息（用于流式交互初始化，避免多次触发 UI 渲染）
   * @param {Array<Message>} messages 
   * @returns {boolean}
   */
  async addMessages(messages) {
    let session = this.getCurrentSession();
    
    // 如果当前没有会话，则自动创建一个新会话
    if (!session) {
      session = this.createSession({ title: '新对话', persist: false });
    }
    
    messages.forEach(msg => session.addMessage(msg));
    
    // 持久化
    await this._saveSessions();
    
    // 仅在所有消息添加完成后发布一次事件
    this.eventBus.emit(window.Events.CHAT.MESSAGES_ADDED, { 
      sessionId: session.id,
      messages 
    });
    
    return true;
  }

  /**
   * 流式分片更新消息内容（专为流式交互设计，不触发事件通知）
   * @param {string} messageId 
   * @param {Object} chunk - { content?: string, reasoning_content?: string } - 流式分片数据
   * @returns {boolean}
   */
  streamChunkMessage(messageId, chunk) {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    const message = session.messages.find(m => m.id === messageId);
    if (!message) return false;
    
    // 追加流式分片内容到消息末尾
    if (chunk.content !== undefined) {
      message.content += chunk.content;
    }
    if (chunk.reasoning_content !== undefined) {
      message.reasoning_content += chunk.reasoning_content;
    }
    
    session.updatedAt = Date.now();
    session.updated_at = session.updatedAt;
    
    // 持久化（但不发出事件通知，避免触发 UI 重绘）
    this._saveSessions();    
    return true;
  }

  /**
   * 更新消息
   * @param {string} messageId 
   * @param {Function} updater 
   * @returns {boolean}
   */
  updateMessage(messageId, updater) {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    const updated = session.updateMessage(messageId, updater);
    if (updated) {
      this._saveSessions();
      
      // 发出事件通知
      const updatedMessage = session.messages.find(m => m.id === messageId);
      this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, {
        sessionId: session.id,
        message: updatedMessage
      });
    }
    
    return updated;
  }

  /**
   * 删除消息
   * @param {string} messageId 
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    const session = this.getCurrentSession();
    if (!session) {
      console.warn('[SessionManager] No current session to delete message from');
      return false;
    }
    
    // 使用 Session 模型中的 removeMessage 方法
    const deleted = session.removeMessage(messageId);
    if (deleted) {
      console.log('[SessionManager] Message deleted successfully:', messageId);
      this._saveSessions();
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, {
        sessionId: session.id,
        messageId
      });
    } else {
      console.warn('[SessionManager] Failed to delete message:', messageId, 'not found in session');
    }
    
    return deleted;
  }

  // ==================== 持久化 ====================

  /**
   * 从存储加载会话（返回 Promise 以便外部等待）
   */
  loadSessionsFromStorage() {
    return new Promise((resolve) => {
      this.storage.get(['sessions', 'currentSessionId'], (data) => {
        if (data.sessions && Array.isArray(data.sessions)) {
          // 恢复会话
          data.sessions.forEach(sessionData => {
            const session = Session.fromJSON(sessionData);
            this.sessions.set(session.id, session);
          });
          
          // 恢复当前会话
          if (data.currentSessionId && this.sessions.has(data.currentSessionId)) {
            this.currentSessionId = data.currentSessionId;
          } else if (this.sessions.size > 0) {
            this.currentSessionId = Array.from(this.sessions.keys())[0];
          }
          
          console.log(`[SessionManager] Loaded ${this.sessions.size} sessions`);
        }
        resolve();
      });
    });
  }

  /**
   * 从存储加载会话
   * @private
   */
  _loadSessions() {
    // 保持原有的异步逻辑，用于后台静默刷新或兼容旧调用
    this.loadSessionsFromStorage();
  }

  /**
   * 保存会话到存储
   * @private
   */
  async _saveSessions() {
    try {
      const sessionsData = Array.from(this.sessions.values()).map(s => s.toJSON());
      
      await new Promise((resolve, reject) => {
        this.storage.set({
          sessions: sessionsData,
          currentSessionId: this.currentSessionId
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log('[SessionManager] Sessions saved to storage');
    } catch (error) {
      console.error('[SessionManager] Failed to save sessions:', error);
    }
  }

  /**
   * 清空所有会话
   */
  clearAll() {
    this.sessions.clear();
    this.currentSessionId = null;
    
    this.storage.remove(['sessions', 'currentSessionId']);
    
    this.eventBus.emit(window.Events.CHAT.ALL_SESSIONS_CLEARED);
    
    console.log('[SessionManager] Cleared all sessions');
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ISessionManager = ISessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ISessionManager;
}
