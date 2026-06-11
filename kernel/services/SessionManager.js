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
   */
  constructor(eventBus) {
    super(eventBus);

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

  // ==================== 上下文管理（支持 Provider 缓存优化） ====================

  /**
   * 获取用于 API 请求的消息窗口
   * 
   * 设计目标：
   * 1. 结合 Provider 端前缀缓存，减少网络 payload
   * 2. 保持本地上下文窗口足够大，保证响应质量
   * 3. 配合 ChatController 中的 Provider 缓存 key 使用
   *
   * 策略：
   * - 当 autoContextTruncation 启用时，返回截断后的最后 N 条消息
   * - 关键约束：tool_call 消息必须与其对应的 tool_result 消息成对保留
   * - 如果窗口切割点落在 tool_call/tool_result 对中间，向前扩展以保持完整性
   * 
   * @param {Session} session - 会话对象
   * @param {Object} settings - 应用设置 { autoContextTruncation: boolean, contextWindowSize?: number }
   * @returns {Array<Message>} 截断后的消息列表（用于 API 请求）
   */
  getContextWindow(session, settings = {}) {
    if (!session || !Array.isArray(session.messages)) {
      console.log('[SessionManager] getContextWindow: no session or empty messages');
      return [];
    }
    
    const messages = session.messages;
    if (messages.length === 0) {
      console.log('[SessionManager] getContextWindow: session has 0 messages');
      return [];
    }

    // 如果禁用上下文截断，返回全部消息
    if (!settings.autoContextTruncation) {
      console.log(`[SessionManager] getContextWindow: truncation disabled, returning all ${messages.length} messages`);
      return messages;
    }

    // 默认窗口大小：最后 20 条消息（约 2-3 轮完整对话）
    const windowSize = settings.contextWindowSize || 20;
    
    if (messages.length <= windowSize) {
      console.log(`[SessionManager] getContextWindow: ${messages.length} msgs ≤ windowSize ${windowSize}, no truncation needed`);
      return messages;
    }

    // === 关键：安全截断，保证 tool-call/result 对完整性 ===
    // OpenAI 协议要求：assistant 消息的 tool_calls 必须有对应的 tool result 消息紧随其后。
    // 如果截断点恰好砍在 tool_call 和 tool_result 之间，Provider 会返回 400 错误。
    let safeIndex = messages.length - windowSize;

    // 从截断点向前扫描，找到最近一个"安全边界"（非 tool 消息的位置）
    while (safeIndex > 0) {
      const candidate = messages[safeIndex];
      const prevMsg = messages[safeIndex - 1];
      
      // 如果 candidate 是 tool result 消息，且前一条是 assistant（可能有 tool_calls），
      // 那么截断点在这里会导致 assistant 的 tool_calls 没有对应 result —— 向前移
      if (candidate.role === 'tool' && prevMsg && prevMsg.role === 'assistant' && prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
        safeIndex--;
        continue;
      }
      
      // 如果 candidate 是 assistant 消息且有 tool_calls，但前一条不是 tool result（即没有对应的 request），
      // 这意味着截断点砍掉了 tool_calls 的上游 —— 向前移
      if (candidate.role === 'assistant' && candidate.toolCalls && candidate.toolCalls.length > 0) {
        // assistant 有 tool_calls，需要确保它前面有对应的 tool result
        // 实际上 tool_calls 后面会跟 tool result，只要不砍断后面就行
        // 但如果 assistant 本身是截断后的第一条，且前面的 user message 有 tool_calls 的前因...
        // 安全起见：如果当前消息是 tool result，继续向前
        break;
      }
      
      // 如果 candidate 是 tool result 消息，说明前面有一轮完整的 tool 调用链
      // 截断点应该在 tool result 之前或之后（不会砍断对）
      if (candidate.role === 'tool') {
        safeIndex--;
        continue;
      }
      
      // 普通消息（user/assistant/system），安全边界
      break;
    }

    // 注意：连续窗口截断不做跳跃保留（会破坏消息顺序）
    // 如需保留第一条 user 消息作为对话锚点，需另行设计 system 提示插入逻辑
    const truncated = messages.slice(safeIndex);
    const dropped = messages.length - truncated.length;

    // === 详细截断日志 ===
    if (dropped > 0) {
      const roleCounts = { user: 0, assistant: 0, tool: 0, system: 0 };
      truncated.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
      
      console.log(
        `[SessionManager] Context truncated: ${messages.length} → ${truncated.length} messages ` +
        `(dropped ${dropped}, safeIndex=${safeIndex}, windowSize=${windowSize}, session=${session.id})`
      );
      console.log(
        `[SessionManager]   Kept roles: user=${roleCounts.user}, assistant=${roleCounts.assistant}, ` +
        `tool=${roleCounts.tool}, system=${roleCounts.system}`
      );
    }

    return truncated;
  }

  /**
   * 基于 token 预算的消息截断（用于无 Provider 缓存的场景）
   * 
   * 策略：
   * 1. 粗估每条消息的 token 数（chars / 4）
   * 2. 从尾部向前累加，直到接近 token 预算上限
   * 3. 始终保证 tool_call 和 tool_result 成对
   * 
   * @param {Session} session - 会话对象
   * @param {Object} options
   * @param {number} options.contextLength - 模型最大上下文长度（tokens）
   * @param {number} options.maxTokens - 模型最大输出 tokens
   * @param {number} [options.contextWindowRatio=0.8] - 输入侧比例
   * @param {number} [options.toolsTokenEstimate=500] - 工具定义占用的 token 估算
   * @returns {Array<Message>} 截断后的消息列表
   */
  getMessagesByTokenBudget(session, options = {}) {
    if (!session || !Array.isArray(session.messages)) {
      console.log('[SessionManager] getMessagesByTokenBudget: no session or empty messages');
      return [];
    }

    const messages = session.messages;
    if (messages.length === 0) {
      console.log('[SessionManager] getMessagesByTokenBudget: session has 0 messages');
      return [];
    }

    const contextLength = options.contextLength || 8192;
    const maxTokens = options.maxTokens || 2000;
    const ratio = options.contextWindowRatio || 0.8;
    const toolsTokenEstimate = options.toolsTokenEstimate || 500;

    // 可用于消息的 token 预算 = contextLength × ratio - maxTokens - 工具定义
    const inputBudget = Math.floor(contextLength * ratio) - maxTokens - toolsTokenEstimate;

    console.log(
      `[SessionManager] getMessagesByTokenBudget: ` +
      `contextLength=${contextLength}, maxTokens=${maxTokens}, ratio=${ratio}, ` +
      `toolsEstimate=${toolsTokenEstimate}, inputBudget=${inputBudget} tokens`
    );

    // 估算单条消息的 token 数
    const estimateTokens = (msg) => {
      let tokens = 0;
      // content
      if (typeof msg.content === 'string') {
        tokens += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach(block => {
          if (block.text) tokens += Math.ceil(block.text.length / 4);
          if (block.data) tokens += Math.ceil(block.data.length / 4); // base64 图片
        });
      }
      // reasoning_content
      if (msg.reasoning_content) {
        tokens += Math.ceil(msg.reasoning_content.length / 4);
      }
      // tool_calls (序列化后的 arguments)
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(tc => {
          tokens += Math.ceil(JSON.stringify(tc.arguments || {}).length / 4);
          tokens += 20; // name + id 开销
        });
      }
      // role + overhead
      tokens += 4;
      return tokens;
    };

    // 从尾部向前累加，直到超出预算
    let totalTokens = 0;
    let startIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(messages[i]);
      if (totalTokens + msgTokens > inputBudget) {
        startIndex = i + 1;
        break;
      }
      totalTokens += msgTokens;
      startIndex = i;
    }

    // === 安全边界：保证 tool-call/result 对完整性 ===
    while (startIndex > 0) {
      const candidate = messages[startIndex];
      const prevMsg = messages[startIndex - 1];

      if (!candidate) break;

      // candidate 是 tool result，前一条是 assistant 有 tool_calls → 向前扩展
      if (candidate.role === 'tool' && prevMsg && prevMsg.role === 'assistant' 
          && prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
        startIndex--;
        totalTokens += estimateTokens(messages[startIndex]);
        continue;
      }

      // candidate 是孤立的 tool result → 向前扩展
      if (candidate.role === 'tool') {
        startIndex--;
        totalTokens += estimateTokens(messages[startIndex]);
        continue;
      }

      break;
    }

    const truncated = messages.slice(startIndex);
    const dropped = startIndex;

    if (dropped > 0) {
      const roleCounts = { user: 0, assistant: 0, tool: 0, system: 0 };
      truncated.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });

      console.log(
        `[SessionManager] Token-budget truncation: ${messages.length} → ${truncated.length} messages ` +
        `(dropped ${dropped}, estimatedTokens=${totalTokens}/${inputBudget}, session=${session.id})`
      );
      console.log(
        `[SessionManager]   Kept roles: user=${roleCounts.user}, assistant=${roleCounts.assistant}, ` +
        `tool=${roleCounts.tool}, system=${roleCounts.system}`
      );
    } else {
      console.log(
        `[SessionManager] Token-budget: all ${messages.length} messages fit within ${inputBudget} token budget`
      );
    }

    return truncated;
  }

  /**
   * 准备用于 API 发送的消息列表（应用上下文截断）
   * 
   * @param {Session} session - 会话对象
   * @param {Object} settings - 应用设置
   * @returns {Array<Message>} 用于 API 请求的消息列表
   */
  getMessagesForAPI(session, settings = {}) {
    return this.getContextWindow(session, settings);
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
    if (!this.storage || typeof this.storage.get !== 'function') {
      console.warn('[SessionManager] No storage adapter provided, skipping load skipped');
      return;
    }
    
    try {
      const sessionsVal = await this.storage.get('sessions');
      const currentSessionIdVal = await this.storage.get('currentSessionId');
      
      if (sessionsVal) {
        const sessionsData = sessionsVal;
        this.sessions.clear();
        
        Object.values(sessionsData).forEach(sessionData => {
          const session = typeof window.Session.fromJSON === 'function'
            ? window.Session.fromJSON(sessionData)
            : new window.Session(sessionData);
          this.sessions.set(session.id, session);
        });
        
        console.log('[SessionManager] Loaded sessions:', this.sessions.size);
      }
      
      if (currentSessionIdVal) {
        this.currentSessionId = currentSessionIdVal;
        console.log('[SessionManager] Current session:', this.currentSessionId);
      }
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
    }
  }

  /**
   * 保存会话到存储
   * @private
   * @returns {Promise<void>}
   */
  async _saveSessions() {
    if (!this.storage || typeof this.storage.set !== 'function') {
      console.warn('[SessionManager] No storage adapter provided, save skipped');
      return;
    }
    
    const sessionsData = {};
    this.sessions.forEach((session, id) => {
      sessionsData[id] = session.toJSON();
    });
    
    try {
      await this.storage.set('sessions', sessionsData);
      await this.storage.set('currentSessionId', this.currentSessionId);
    } catch (error) {
      console.error('[SessionManager] Failed to save sessions:', error);
    }
  }
}

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
