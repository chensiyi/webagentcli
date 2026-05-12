/**
 * ChatController - 聊天控制器（React 风格）
 * 
 * 职责：
 * 1. 管理聊天状态（消息列表、加载状态、当前会话）
 * 2. 处理用户操作（发送消息、停止生成、切换会话）
 * 3. 协调 Adapter 和 Service Worker 通信
 * 4. 触发 UI 更新（通过回调或事件）
 * 
 * 设计思路：
 * - 类似 React 的 useState/useReducer 模式
 * - 状态变更触发 UI 重新渲染
 * - 异步操作通过 Promise/async-await 管理
 */

class ChatController {
  /**
   * @param {Object} dependencies
   * @param {SessionManager} dependencies.sessionManager - 会话管理器
   * @param {ToolManager} dependencies.toolManager - 工具管理器
   * @param {Adapter} dependencies.adapter - 协议适配器
   * @param {Function} dependencies.onStateChange - 状态变更回调（类似 React setState）
   */
  constructor({ sessionManager, toolManager, adapter, onStateChange }) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
    this.adapter = adapter;
    this.onStateChange = onStateChange;
    
    // 当前状态（类似 React state）
    this.state = {
      currentSessionId: null,
      messages: [],
      isLoading: false,
      isThinking: false,
      error: null
    };
    
    // 流式请求控制
    this._currentPort = null;
    this._abortController = null;
  }

  /**
   * 初始化控制器
   */
  async initialize() {
    // 加载当前会话
    const session = this.sessionManager.getCurrentSession();
    if (session) {
      await this.switchSession(session.id);
    }
  }

  /**
   * 切换会话
   */
  async switchSession(sessionId) {
    // 取消当前的流式请求
    if (this.state.isLoading) {
      this.stopGeneration();
    }
    
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // 更新状态
    this.setState({
      currentSessionId: sessionId,
      messages: [...session.messages],
      isLoading: session.isLoading,
      error: null
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(text, media = []) {
    const sessionId = this.state.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }
    
    if (!text && media.length === 0) {
      throw new Error('Message content cannot be empty');
    }
    
    try {
      // 1. 创建用户消息
      const userMessage = this._buildUserMessage(text, media);
      this.sessionManager.addMessage(sessionId, userMessage);
      
      // 2. 更新 UI（显示用户消息）
      this.setState({
        messages: [...this.sessionManager.getSession(sessionId).messages],
        isLoading: true,
        isThinking: true,
        error: null
      });
      
      // 3. 创建空的助手消息占位符
      const assistantMessage = new Message({
        role: 'assistant',
        content: ''
      });
      this.sessionManager.addMessage(sessionId, assistantMessage);
      
      // 4. 准备请求数据
      const requestParams = await this._prepareRequestParams(sessionId);
      
      // 5. 发起流式请求
      await this._startStreamRequest(sessionId, requestParams);
      
    } catch (error) {
      console.error('[ChatController] Send message failed:', error);
      this.setState({
        isLoading: false,
        isThinking: false,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 停止生成
   */
  stopGeneration() {
    if (this._currentPort) {
      this._currentPort.disconnect();
      this._currentPort = null;
    }
    
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    
    const sessionId = this.state.currentSessionId;
    if (sessionId) {
      this.sessionManager.completeStreamRequest(sessionId);
    }
    
    this.setState({
      isLoading: false,
      isThinking: false
    });
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageIndex) {
    const sessionId = this.state.currentSessionId;
    if (!sessionId) return;
    
    const deletedIndices = this.sessionManager.deleteMessageWithTools(sessionId, messageIndex);
    
    // 更新 UI
    this.setState({
      messages: [...this.sessionManager.getSession(sessionId).messages]
    });
    
    // 持久化
    await this.sessionManager.saveConversations();
  }

  /**
   * 编辑消息
   */
  async editMessage(messageIndex, newContent) {
    const sessionId = this.state.currentSessionId;
    if (!sessionId) return;
    
    const session = this.sessionManager.getSession(sessionId);
    const message = session.messages[messageIndex];
    
    if (!message) return;
    
    // 更新消息内容
    message.content = newContent;
    
    // 删除该消息之后的所有消息（因为编辑后需要重新生成）
    session.messages.splice(messageIndex + 1);
    
    // 更新 UI
    this.setState({
      messages: [...session.messages]
    });
    
    // 持久化
    await this.sessionManager.saveConversations();
  }

  /**
   * 获取当前状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 更新状态（类似 React setState）
   * @private
   */
  setState(partialState) {
    this.state = {
      ...this.state,
      ...partialState
    };
    
    // 触发 UI 更新
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * 构建用户消息
   * @private
   */
  _buildUserMessage(text, media) {
    if (media.length === 0) {
      return new Message({
        role: 'user',
        content: text
      });
    }
    
    // 多模态消息
    const contentParts = [
      MediaContent.createText(text),
      ...media.map(m => {
        if (m.type === 'image') {
          return MediaContent.createImage(m.dataUrl, { filename: m.filename });
        }
        // 其他类型...
      })
    ];
    
    return new Message({
      role: 'user',
      content: contentParts
    });
  }

  /**
   * 准备请求参数
   * @private
   */
  async _prepareRequestParams(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    const settings = await this._loadSettings();
    
    // 准备消息列表
    const messages = this._prepareMessages(session, settings);
    
    // 构建请求体
    const requestBody = this.adapter.buildRequestBody({
      messages: messages.map(m => m.toJSON()),
      model: settings.model,
      temperature: settings.temperature || 0.7,
      maxTokens: settings.maxTokens || 2000,
      stream: true,
      tools: this.toolManager.getOpenAIToolsDefinition()
    });
    
    return {
      endpoint: this.adapter.buildUrl(this.adapter.getChatEndpoint()),
      requestBody,
      settings
    };
  }

  /**
   * 准备消息列表（添加 system prompt、清理、截断）
   * @private
   */
  _prepareMessages(session, settings) {
    let messages = [...session.messages];
    
    // 添加工具系统提示
    const toolPrompt = this.toolManager.generateSystemPrompt();
    if (toolPrompt) {
      const currentTime = new Date().toLocaleString('zh-CN');
      const fullSystemPrompt = settings.systemPrompt
        ? `当前时间: ${currentTime}

${toolPrompt}

${settings.systemPrompt}`
        : `当前时间: ${currentTime}\n\n${toolPrompt}`;
      
      messages = [
        new Message({ role: 'system', content: fullSystemPrompt }),
        ...messages.filter(m => m.role !== 'system')
      ];
    }
    
    // TODO: 消息截断逻辑
    
    return messages;
  }

  /**
   * 启动流式请求
   * @private
   */
  async _startStreamRequest(sessionId, { endpoint, requestBody }) {
    // 创建 AbortController
    this._abortController = new AbortController();
    
    try {
      // 通过 Service Worker 发起请求
      const port = chrome.runtime.connect({ name: 'chat-stream' });
      this._currentPort = port;
      
      // 监听响应
      port.onMessage.addListener((msg) => {
        this._handleStreamMessage(msg, sessionId);
      });
      
      // 监听断开
      port.onDisconnect.addListener(() => {
        this._handleStreamDisconnect(sessionId);
      });
      
      // 发送请求
      port.postMessage({
        ...requestBody,
        apiKey: requestBody.apiKey,
        apiEndpoint: endpoint
      });
      
    } catch (error) {
      console.error('[ChatController] Stream request failed:', error);
      this.setState({
        isLoading: false,
        isThinking: false,
        error: error.message
      });
    }
  }

  /**
   * 处理流式消息
   * @private
   */
  _handleStreamMessage(msg, sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;
    
    const lastMessage = session.getLastAssistantMessage();
    if (!lastMessage) return;
    
    switch (msg.type) {
      case 'chunk':
        // 文本块
        lastMessage.content += msg.content;
        
        // 节流更新 UI
        if (lastMessage.shouldRender()) {
          this.setState({
            messages: [...session.messages],
            isThinking: false
          });
        }
        break;
      
      case 'reasoning':
        // 思考过程
        if (!lastMessage.metadata.thinkingProcess) {
          lastMessage.metadata.thinkingProcess = '';
        }
        lastMessage.metadata.thinkingProcess += msg.reasoning_content;
        
        // 思考中不频繁更新 UI
        break;
      
      case 'tool_call':
        // 工具调用
        lastMessage.toolIntentions = msg.tool_calls.map(tc => 
          new ToolIntention({
            id: tc.id,
            toolName: tc.function.name,
            parameters: JSON.parse(tc.function.arguments),
            status: 'pending'
          })
        );
        
        this.setState({
          messages: [...session.messages]
        });
        break;
      
      case 'complete':
        // 流结束
        this._handleStreamComplete(sessionId, lastMessage);
        break;
      
      case 'error':
        // 错误
        this.setState({
          isLoading: false,
          isThinking: false,
          error: msg.error
        });
        break;
    }
  }

  /**
   * 处理流结束
   * @private
   */
  async _handleStreamComplete(sessionId, lastMessage) {
    // 强制渲染最后一次
    lastMessage.forceRender();
    
    this.setState({
      messages: [...this.sessionManager.getSession(sessionId).messages],
      isLoading: false,
      isThinking: false
    });
    
    // 持久化
    await this.sessionManager.saveConversations();
    
    // 如果有工具调用，执行工具
    if (lastMessage.hasToolIntentions()) {
      await this._executeTools(sessionId, lastMessage);
    }
  }

  /**
   * 处理流断开
   * @private
   */
  _handleStreamDisconnect(sessionId) {
    this._currentPort = null;
    this._abortController = null;
    
    this.sessionManager.completeStreamRequest(sessionId);
    
    this.setState({
      isLoading: false,
      isThinking: false
    });
  }

  /**
   * 执行工具
   * @private
   */
  async _executeTools(sessionId, assistantMessage) {
    // TODO: 实现工具执行逻辑
    // 这部分应该由 ToolController 处理
    console.log('[ChatController] Tool execution needed:', assistantMessage.toolIntentions);
  }

  /**
   * 加载设置
   * @private
   */
  async _loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        resolve(result.settings || {});
      });
    });
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ChatController = ChatController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatController;
}
