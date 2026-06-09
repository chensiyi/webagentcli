/**
 * SessionManager - 会话管理器（ISessionManager 的具体实现）
 * 
 * 职责：
 * 1. 实现 ISessionManager 接口定义的所有方法
 * 2. 处理会话管理业务逻辑（CRUD、持久化、消息存储）
 * 3. 通过 EventBus 与 UI 层通信
 * 
 * 设计原则：
 * - 继承 ISessionManager 基类
 * - 包含完整的业务逻辑实现
 * - 仅管理会话与消息数据，不承担 chat 运行时职责
 */

class SessionManager extends window.ISessionManager {
  /**
   * @param {EventBus} eventBus - 事件总线实例
   * @param {Object} storage - 存储接口（默认使用 chrome.storage.local）
   */
  constructor(eventBus, storage = null) {
    super(eventBus, storage);

    // 内存中的会话缓存
    this.sessions = new Map(); // sessionId -> Session
    this.currentSessionId = null;

    // === 流式写入合并：防抖持久化 ===
    // 避免每个 chunk 都触发一次 chrome.storage.local.set
    this._pendingStreamWrites = new Map(); // sessionId → { content, reasoning_content, dirty, timer }
    this._streamFlushInterval = 250; // ms
    this._streamFlushTimer = null;

    console.log('[SessionManager] Initialized');
  }

  // ==================== 会话管理 ====================

  /**
   * 创建新会话
   * @param {Object} options 
   * @param {string} [options.title] - 会话标题
   * @param {boolean} [options.persist=true] - 是否立即持久化
   * @param {string} [options.reasoningEffort] - 思考强度（'off' | 'low' | 'medium' | 'high'）
   * @returns {Session} 新创建的会话
   */
  createSession(options = {}) {
    const session = new window.Session({
      title: options.title || '新对话',
      messages: [],
      reasoningEffort: options.reasoningEffort || 'medium'
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
      
    console.log('[SessionManager] Created session:', session.id, 'Reasoning effort:', session.reasoningEffort);
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
   * 获取指定会话
   * @param {string} sessionId
   * @returns {Session|null}
   */
  getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    return this.sessions.get(sessionId) || null;
  }

  /**
   * 设置当前会话
   * @param {string|null} sessionId
   * @returns {Session|null}
   */
  setCurrentSession(sessionId) {
    if (sessionId !== null && !this.sessions.has(sessionId)) {
      console.warn('[SessionManager] Session not found:', sessionId);
      return null;
    }

    const previousId = this.currentSessionId;
    this.currentSessionId = sessionId;

    if (previousId !== sessionId) {
      this._saveSessions();
      this.eventBus.emit(window.Events.CHAT.CURRENT_SESSION_CHANGED, {
        sessionId,
        previousId,
        session: sessionId ? this.sessions.get(sessionId) : null
      });
    }

    return this.getCurrentSession();
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
      console.warn('[SessionManager] Session not found:', sessionId);
      return false;
    }
    
    session.title = title;
    session.touch();
    
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
    session.touch();
    
    this._saveSessions();
    this.eventBus.emit(window.Events.CHAT.SESSION_UPDATED, { session });
    return true;
  }

  // ==================== 消息管理 ====================

  /**
   * 添加消息到目标会话
   * @param {Message} message 
   * @param {string|null} [sessionId]
   * @returns {Promise<boolean>}
   */
  async addMessage(message, sessionId = null) {
    let session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    
    // 如果当前没有会话，则自动创建一个新会话
    if (!session) {
      if (sessionId) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return false;
      }
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
   * 批量添加消息到目标会话
   * @param {Array<Message>} messages 
   * @param {string|null} [sessionId]
   * @returns {Promise<boolean>}
   */
  async addMessages(messages, sessionId = null) {
    let session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    
    if (!session) {
      if (sessionId) {
        console.warn('[SessionManager] Session not found:', sessionId);
        return false;
      }
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
   * 更新目标会话中的消息
   * @param {string} messageId 
   * @param {Function} updater 
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  updateMessage(messageId, updater, sessionId = null) {
    const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    if (!session) {
      console.warn('[SessionManager] No target session');
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
   * 流式分片更新目标会话中的消息内容（**带防抖批量持久化**）
   *
   * 优化点：
   * 1. 内存中立即追加 chunk（保证 UI 实时）
   * 2. 持久化推迟到 _streamFlushInterval (默认 250ms) 后的下一个静默期
   * 3. 避免每个 chunk 触发一次 chrome.storage.local.set
   * 4. 多个会话并发流式时按 sessionId 隔离，不会互相覆盖
   *
   * @param {string} messageId
   * @param {Object} chunk - { content?: string, reasoning_content?: string }
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  streamChunkMessage(messageId, chunk, sessionId = null) {
    const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    if (!session) {
      console.warn('[SessionManager] No target session');
      return false;
    }

    // 1. 内存中立即追加（保证 UI 实时反应）
    const result = session.updateMessage(messageId, (message) => {
      if (chunk.content) {
        message.content = (message.content || '') + chunk.content;
      }
      if (chunk.reasoning_content) {
        message.reasoning_content = (message.reasoning_content || '') + chunk.reasoning_content;
      }
    });

    if (!result) return false;

    // 2. 注册一个待刷新项（按 sessionId 隔离）
    let pending = this._pendingStreamWrites.get(session.id);
    if (!pending) {
      pending = { messageIds: new Set(), timer: null };
      this._pendingStreamWrites.set(session.id, pending);
    }
    pending.messageIds.add(messageId);

    // 3. 重置定时器（防抖）
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => this._flushStreamWrites(session.id), this._streamFlushInterval);

    return true;
  }

  /**
   * 立即刷新指定 session 的待写入流式分片
   * @param {string} sessionId
   * @private
   */
  async _flushStreamWrites(sessionId) {
    const pending = this._pendingStreamWrites.get(sessionId);
    if (!pending) return;

    // 清除注册状态（本次 refresh 结束）
    this._pendingStreamWrites.delete(sessionId);
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }

    // 检查会话是否还存在
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await this._saveSessions();
    } catch (e) {
      console.error('[SessionManager] Flush stream writes failed:', e);
    }
  }

  /**
   * 外部调用：强制刷新所有待写入的流式分片
   * （会话结束/取消生成/页面卸载时调用，防止数据丢失）
   */
  async flushAllStreamWrites() {
    const ids = Array.from(this._pendingStreamWrites.keys());
    await Promise.all(ids.map(id => this._flushStreamWrites(id)));
  }

  /**
   * 清空目标会话中的所有消息
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  clearMessages(sessionId = null) {
    const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    if (!session) {
      console.warn('[SessionManager] No target session');
      return false;
    }

    session.clearMessages();
    this._saveSessions();
    this.eventBus.emit(window.Events.CHAT.SESSION_CLEARED, {
      sessionId: session.id,
      session
    });
    return true;
  }

  /**
   * 删除目标会话中的消息
   * @param {string} messageId 
   * @param {string|null} [sessionId]
   * @returns {boolean}
   */
  deleteMessage(messageId, sessionId = null) {
    const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
    if (!session) {
      console.warn('[SessionManager] No target session');
      return false;
    }
    
    // Session 使用 removeMessage 方法
    const result = session.removeMessage(messageId);
    if (result) {
      this._saveSessions();
      this.eventBus.emit(window.Events.CHAT.MESSAGE_DELETED, {
        messageId,
        sessionId: session.id
      });
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

    const cachedModels = Array.isArray(settings.models) ? settings.models : null;
    
    if (!cachedModels || !Array.isArray(cachedModels)) {
      return;
    }

    const currentModel = cachedModels.find(m => m.id === settings.model);
    if (!currentModel) return;

    // 1. 同步 Reasoning 状态
    const supportsReasoning = typeof currentModel.supportsReasoning === 'function' 
      ? currentModel.supportsReasoning() 
      : (currentModel.capabilities?.reasoning || currentModel.supports_reasoning);

    // 如果模型不支持，强制关闭会话中的思考模式
    if (!supportsReasoning && session.reasoningEffort !== 'off') {
      console.log(`[SessionManager] Model ${settings.model} does not support reasoning. Disabling for session ${session.id}`);
      session.reasoningEffort = 'off';
      this._saveSessions();
    }
  }

  /**
   * 初始化会话管理器（等待异步加载完成）
   * @returns {Promise<void>}
   */
  initialize() {
    console.log('[SessionManager] Initialization started');
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
              const session = typeof window.Session.fromJSON === 'function'
                ? window.Session.fromJSON(sessionData)
                : new window.Session(sessionData);
              this.sessions.set(session.id, session);
            });
            
            console.log('[SessionManager] Loaded sessions:', this.sessions.size);
          }
          
          if (result.currentSessionId) {
            this.currentSessionId = result.currentSessionId;
            console.log('[SessionManager] Current session:', this.currentSessionId);
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
   * @returns {Promise<void>}
   */
  _saveSessions() {
    const sessionsData = {};
    this.sessions.forEach((session, id) => {
      sessionsData[id] = session.toJSON();
    });
    
    return new Promise((resolve, reject) => {
      this.storage.set({
        sessions: sessionsData,
        currentSessionId: this.currentSessionId
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[SessionManager] Failed to save sessions:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
