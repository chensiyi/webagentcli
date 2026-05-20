/**
 * SessionController - 会话控制器（ISessionManager 的具体实现）
 * 
 * 职责：
 * 1. 实现 ISessionManager 接口定义的所有方法
 * 2. 处理会话管理业务逻辑（CRUD、持久化、Chat 缓存）
 * 3. 通过 EventBus 与 UI 层通信
 * 
 * 设计原则：
 * - 继承 ISessionManager 基类
 * - 包含完整的业务逻辑实现
 * - 管理运行时状态（sessions、currentSessionId、chatCache）
 */

class SessionController extends window.ISessionManager {
  /**
   * @param {EventBus} eventBus - 事件总线实例
   * @param {Object} storage - 存储接口（默认使用 chrome.storage.local）
   */
  constructor(eventBus, storage = null) {
    super(eventBus, storage);
    
    // 内存中的会话缓存
    this.sessions = new Map(); // sessionId -> Session
    this.currentSessionId = null;
    
    // Chat 实例缓存：sessionId -> Chat
    this.chatCache = new Map();
    
    console.log('[SessionController] yinggaishiialized');
  }

  // ==================== 会话管理 ====================

  /**
   * 创建新会话
   * @param {Object} options 
   * @param {string} [options.title] - 会话标题
   * @param {boolean} [options.persist=true] - 是否立即持久化
   * @param {boolean} [options.reasoningEnabled] - 是否开启思考模式
   * @returns {Session} 新创建的会话
   */
  createSession(options = {}) {
    // 自动检测当前模型是否支持 reasoning
    let reasoningEnabled = options.reasoningEnabled;
    if (reasoningEnabled === undefined) {
      // 默认开启 reasoning，由调用方根据需要覆盖
      reasoningEnabled = true;
    }

    const session = new window.Session({
      title: options.title || '新对话',
      messages: [],
      reasoningEnabled: reasoningEnabled,
      reasoningEffort: 'medium'
    });
      
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
      
    // 默认不立即持久化，除非显式要求
    if (options.persist) {
      this._saveSessions();
    }
      
    // 发布事件
    this.eventBus.emit(window.Events.CHAT.SESSION_CREATED, { session });
    this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, { sessionId: session.id });
      
    console.log('[SessionController] Created session:', session.id, 'Reasoning:', reasoningEnabled);
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
      console.warn('[SessionController] Session not found:', sessionId);
      return null;
    }
    
    const previousId = this.currentSessionId;
    this.currentSessionId = sessionId;
    
    // TODO: 切换会话时，重新评估并同步会话的环境配置
    // this._syncSessionEnvironment(session);
    
    if (previousId !== sessionId) {
      this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, { 
        sessionId, 
        previousId,
        session: session
      });
    }
    
    this.eventBus.emit(window.Events.CHAT.SESSION_LOADED, { session });
    return session;
  }

  /**
   * 删除会话
   * @param {string} sessionId 
   * @param {boolean} autoSwitch - 是否自动切换（已废弃）
   * @returns {boolean}
   */
  deleteSession(sessionId, autoSwitch = true) {
    const deleted = this.sessions.delete(sessionId);
    if (!deleted) {
      console.warn('[SessionController] Session not found for deletion:', sessionId);
      return false;
    }
    
    // 清理 ChatController 缓存
    this.chatCache.delete(sessionId);
    console.log('[SessionController] Cleaned up Chat cache for deleted session:', sessionId);
    
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
    
    console.log('[SessionController] Deleted session:', sessionId);
    return true;
  }

  /**
   * 获取当前会话
   * @returns {Session|null}
   */
  getCurrentSession() {
    if (!this.currentSessionId) {
      return null;
    }
    
    return this.sessions.get(this.currentSessionId) || null;
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
   * @returns {boolean}
   */
  updateSessionTitle(sessionId, title) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[SessionController] Session not found:', sessionId);
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
      console.warn('[SessionController] Session not found:', sessionId);
      return false;
    }
    
    updater(session);
    session.updatedAt = Date.now();
    session.updated_at = session.updatedAt;
    
    this._saveSessions();
    this.eventBus.emit(window.Events.CHAT.SESSION_UPDATED, { session });
    return true;
  }

  // ==================== Chat 实例管理 ====================

  /**
   * 获取或创建 Chat 实例
   * @param {string} sessionId - 会话 ID
   * @param {IProviderAPIService} chatService - Provider API 服务实例
   * @returns {IChat} Chat 实例
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
    
    console.log('[SessionController] Created Chat for session:', sessionId);
    return chat;
  }
  
  /**
   * ⚠️ TODO: 待清理 - 此方法已被 ServiceCenter.getCurrentChat() 取代
   * 
   * 获取当前会话的 Chat 实例
   * @param {IProviderAPIService} chatService - Provider API 服务实例
   * @returns {IChat|EphemeralChat} Chat 实例
   */
  getCurrentChat(chatService) {
    if (!chatService) {
      throw new Error('ChatService is required');
    }
    
    // 如果没有当前会话，返回临时 Chat 占位符
    if (!this.currentSessionId) {
      return new window.EphemeralChat(this, chatService, this.eventBus);
    }
    
    return this.getOrCreateChat(this.currentSessionId, chatService);
  }
  
  /**
   * 清除 Chat 实例缓存
   * @param {string} [sessionId] - 可选，指定清除某个会话的 Chat
   */
  clearChatCache(sessionId = null) {
    if (sessionId) {
      this.chatCache.delete(sessionId);
      console.log('[SessionController] Cleared Chat cache for session:', sessionId);
    } else {
      this.chatCache.clear();
      console.log('[SessionController] Cleared all Chat caches');
    }
  }

  // ==================== 消息管理 ====================

  /**
   * 添加消息到当前会话
   * @param {Message} message 
   * @returns {Promise<boolean>}
   */
  async addMessage(message) {
    let session = this.getCurrentSession();
    
    // 如果当前没有会话，则自动创建一个新会话
    if (!session) {
      session = this.createSession({ title: '新对话', persist: false });
    }
    
    session.addMessage(message);
    
    // 持久化
    await this._saveSessions();
    
    // 发布事件
    this.eventBus.emit(window.Events.CHAT.MESSAGE_ADDED, {
      sessionId: session.id,
      message
    });
    
    return true;
  }

  /**
   * 批量添加消息
   * @param {Array<Message>} messages 
   * @returns {Promise<boolean>}
   */
  async addMessages(messages) {
    let session = this.getCurrentSession();
    
    if (!session) {
      session = this.createSession({ title: '新对话', persist: false });
    }
    
    messages.forEach(msg => session.addMessage(msg));
    
    await this._saveSessions();
    
    this.eventBus.emit(window.Events.CHAT.MESSAGES_BATCH_ADDED, {
      sessionId: session.id,
      messages
    });
    
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
    if (!session) {
      console.warn('[SessionController] No current session');
      return false;
    }
    
    const result = session.updateMessage(messageId, updater);
    if (result) {
      this._saveSessions();
      // 获取更新后的 message 对象并传递
      const message = session.messages.find(m => m.id === messageId);
      if (message) {
        this.eventBus.emit(window.Events.CHAT.MESSAGE_UPDATED, { message });
      }
    }
    return result;
  }

  /**
   * 流式分片更新消息内容
   * @param {string} messageId 
   * @param {Object} chunk - { content?: string, reasoning_content?: string }
   * @returns {boolean}
   */
  streamChunkMessage(messageId, chunk) {
    const session = this.getCurrentSession();
    if (!session) {
      console.warn('[SessionController] No current session');
      return false;
    }
    
    // 使用 updateMessage 来更新消息
    const result = session.updateMessage(messageId, (message) => {
      // 追加内容
      if (chunk.content) {
        message.content = (message.content || '') + chunk.content;
      }
      // 追加推理内容
      if (chunk.reasoning_content) {
        message.reasoning_content = (message.reasoning_content || '') + chunk.reasoning_content;
      }
    });
    
    if (result) {
      this._saveSessions();
    }
    return result;
  }

  /**
   * 删除消息
   * @param {string} messageId 
   * @returns {boolean}
   */
  deleteMessage(messageId) {
    const session = this.getCurrentSession();
    if (!session) {
      console.warn('[SessionController] No current session');
      return false;
    }
    
    // Session 使用 removeMessage 方法
    const result = session.removeMessage(messageId);
    if (result) {
      this._saveSessions();
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, { messageId });
    }
    return result;
  }

  // ==================== 内部方法 ====================

  /**
   * 同步会话环境配置
   * @param {Session} session 
   * @param {Object} [settings] - 可选，设置对象
   */
  _syncSessionEnvironment(session, settings = null) {
    // 如果没有提供 settings，无法同步
    if (!settings || !settings.model || !settings.apiEndpoint) return;

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
      console.log(`[SessionController] Model ${settings.model} does not support reasoning. Disabling for session ${session.id}`);
      session.reasoningEnabled = false;
      this._saveSessions();
    }
  }

  /**
   * 初始化会话管理器（等待异步加载完成）
   * @returns {Promise<void>}
   */
  initialize() {
    console.log('[SessionController] Initialization started');
    return this._loadSessionsFromStorage();
  }

  /**
   * 从存储加载会话（私有方法，仅在初始化时调用）
   * @returns {Promise<void>}
   * @private
   */
  async _loadSessionsFromStorage() {
    return new Promise((resolve, reject) => {
      this.storage.get(['sessions', 'currentSessionId'], (result) => {
        try {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (result.sessions) {
            const sessionsData = result.sessions;
            this.sessions.clear();
            
            Object.values(sessionsData).forEach(sessionData => {
              const session = new window.Session(sessionData);
              this.sessions.set(session.id, session);
            });
            
            console.log('[SessionController] Loaded sessions:', this.sessions.size);
          }
          
          if (result.currentSessionId) {
            this.currentSessionId = result.currentSessionId;
            console.log('[SessionController] Current session:', this.currentSessionId);
          }
          
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * 保存会话到存储
   * @private
   */
  _saveSessions() {
    const sessionsData = {};
    this.sessions.forEach((session, id) => {
      sessionsData[id] = session.toJSON();
    });
    
    this.storage.set({
      sessions: sessionsData,
      currentSessionId: this.currentSessionId
    });
  }
}

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.SessionController = SessionController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionController;
}
