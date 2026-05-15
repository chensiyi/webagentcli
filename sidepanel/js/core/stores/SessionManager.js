/**
 * SessionManager - 会话管理器（纯数据管理，无 UI/协议依赖）
 * 
 * 职责：
 * - 会话 CRUD 操作
 * - 持久化存储（Chrome Storage）
 * - 通过 EventBus 通知状态变化
 */

class SessionManager {
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
    
    // 初始化
    this._loadSessions();
  }

  // ==================== 会话管理 ====================

  /**
   * 创建新会话
   * @param {Object} options 
   * @param {string} [options.title] - 会话标题
   * @returns {Session} 新创建的会话
   */
  createSession(options = {}) {
    const session = new Session({
      title: options.title || '新会话',
      messages: []
    });
    
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    
    // 持久化
    this._saveSessions();
    
    // 发布事件
    this.eventBus.emit('SESSION_CREATED', { session });
    this.eventBus.emit('CURRENT_SESSION_CHANGED', { sessionId: session.id });
    
    console.log('[SessionManager] Created session:', session.id);
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
    
    if (previousId !== sessionId) {
      this.eventBus.emit('CURRENT_SESSION_CHANGED', { 
        sessionId, 
        previousId 
      });
    }
    
    this.eventBus.emit('SESSION_LOADED', { session });
    return session;
  }

  /**
   * 获取当前会话
   * @returns {Session|null}
   */
  getCurrentSession() {
    if (!this.currentSessionId) {
      // 如果没有当前会话，尝试获取第一个会话
      const firstSessionId = Array.from(this.sessions.keys())[0];
      if (firstSessionId) {
        this.currentSessionId = firstSessionId;
        console.log('[SessionManager] Auto-switched to first session:', firstSessionId);
      } else {
        // 如果没有任何会话，创建一个默认的
        console.log('[SessionManager] No sessions found, creating default session');
        this.createSession();
        return this.getCurrentSession(); // 递归调用获取新创建的会话
      }
    }
    
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * 删除会话
   * @param {string} sessionId 
   */
  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (!deleted) {
      console.warn('[SessionManager] Session not found for deletion:', sessionId);
      return false;
    }
    
    // 如果删除的是当前会话，切换到第一个可用会话
    if (this.currentSessionId === sessionId) {
      const firstSessionId = Array.from(this.sessions.keys())[0] || null;
      this.currentSessionId = firstSessionId;
      
      if (firstSessionId) {
        this.eventBus.emit('CURRENT_SESSION_CHANGED', { 
          sessionId: firstSessionId,
          previousId: sessionId
        });
      } else {
        this.eventBus.emit('CURRENT_SESSION_CHANGED', { 
          sessionId: null,
          previousId: sessionId
        });
      }
    }
    
    // 持久化
    this._saveSessions();
    
    // 发布事件
    this.eventBus.emit('SESSION_DELETED', { sessionId });
    
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
    this.eventBus.emit('SESSION_UPDATED', { session });
    
    return true;
  }

  // ==================== 消息管理（委托给 Session）====================

  /**
   * 添加消息到当前会话
   * @param {Message} message 
   * @returns {boolean}
   */
  addMessage(message) {
    const session = this.getCurrentSession();
    if (!session) {
      console.error('[SessionManager] No current session');
      return false;
    }
    
    session.addMessage(message);
    
    // 持久化
    this._saveSessions();
    
    // 发布事件
    this.eventBus.emit('MESSAGE_ADDED', { 
      sessionId: session.id,
      message 
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
    if (!session) return false;
    
    const updated = session.updateMessage(messageId, updater);
    if (updated) {
      this._saveSessions();
      
      const updatedMessage = session.messages.find(m => m.id === messageId);
      this.eventBus.emit('MESSAGE_UPDATED', {
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
    if (!session) return false;
    
    const deleted = session.deleteMessage(messageId);
    if (deleted) {
      this._saveSessions();
      this.eventBus.emit('MESSAGE_DELETED', {
        sessionId: session.id,
        messageId
      });
    }
    
    return deleted;
  }

  // ==================== 持久化 ====================

  /**
   * 从存储加载会话
   * @private
   */
  async _loadSessions() {
    try {
      const data = await new Promise((resolve) => {
        this.storage.get(['sessions', 'currentSessionId'], resolve);
      });
      
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
      } else {
        // 首次使用，创建一个默认会话
        this.createSession();
      }
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
    }
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
    
    this.eventBus.emit('ALL_SESSIONS_CLEARED');
    
    console.log('[SessionManager] Cleared all sessions');
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
