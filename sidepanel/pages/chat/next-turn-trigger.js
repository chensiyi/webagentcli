// 递归对话触发器
// 负责在工具执行后触发下一轮AI对话

class NextTurnTrigger {
  constructor(sessionManager, toolManager, chatContext, streamState) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
    this.chatContext = chatContext;
    this.streamState = streamState;
    this.MAX_DEPTH = 10;
  }

  /**
   * 触发下一轮对话
   */
  async trigger(sessionId, depth = 0) {
    // 检查是否请求停止
    if (this.streamState.shouldStop()) {
      console.log('[NextTurnTrigger] Interrupted by stop request');
      return;
    }

    if (depth >= this.MAX_DEPTH) {
      console.log('[NextTurnTrigger] Max recursion depth reached');
      return;
    }

    console.log(`[NextTurnTrigger] Triggering next turn, depth: ${depth}`);

    const targetSession = this.sessionManager.getSession(sessionId);
    if (!targetSession) {
      return;
    }

    // 获取设置
    const settings = await this.getSettings();
    if (!settings || !settings.apiEndpoint) {
      throw new Error('请先在设置中配置 API 端点');
    }

    // 准备消息
    let chatMessages = this.prepareMessages(targetSession, settings);

    // 打印日志
    console.log('[NextTurnTrigger] ===== Sending messages to model =====');
    console.log('[NextTurnTrigger] Depth:', depth);
    console.log('[NextTurnTrigger] Messages count:', chatMessages.length);
    console.log('[NextTurnTrigger] ==========================================');

    // 添加助手消息占位
    this.sessionManager.addMessage(sessionId, { role: 'assistant', content: '' });

    // 发送流式请求
    await this.sendStreamRequest(sessionId, chatMessages, settings, depth);
  }

  /**
   * 获取设置
   */
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], resolve);
    });
  }

  /**
   * 准备消息列表
   */
  prepareMessages(session, settings) {
    let chatMessages = [...session.messages];

    // 清理消息，转换为 OpenAI API 标准格式
    chatMessages = chatMessages.map(msg => {
      const cleanMsg = { role: msg.role };

      if (msg.role === 'assistant') {
        cleanMsg.content = msg.content || '';
        if (msg.tool_calls) {
          cleanMsg.tool_calls = msg.tool_calls;
        }
      } else {
        cleanMsg.content = msg.content;
      }

      // tool 消息的标准字段
      if (msg.role === 'tool') {
        if (msg.tool_call_id) cleanMsg.tool_call_id = msg.tool_call_id;
        if (msg.name) cleanMsg.name = msg.name;
      }

      // 保留 additional_kwargs
      if (msg.additional_kwargs) {
        cleanMsg.additional_kwargs = msg.additional_kwargs;
      }

      return cleanMsg;
    });

    // 添加 system prompt
    if (this.toolManager) {
      const toolPrompt = this.toolManager.generateSystemPrompt();
      if (toolPrompt) {
        const currentTime = window.TimeUtils.getCurrentTimeString();
        const timeInfo = `当前时间: ${currentTime}\n\n`;
        const fullSystemPrompt = settings.systemPrompt
          ? `${timeInfo}${toolPrompt}\n\n${settings.systemPrompt}`
          : `${timeInfo}${toolPrompt}`;

        chatMessages = chatMessages.filter(m => m.role !== 'system');
        chatMessages = [{ role: 'system', content: fullSystemPrompt }, ...chatMessages];
      }
    }

    // 截断消息
    if (settings.autoContextTruncation !== false) {
      chatMessages = this.chatContext.truncateMessages(
        chatMessages,
        settings.model,
        settings.maxTokens || 2000
      );
    }

    return chatMessages;
  }

  /**
   * 发送流式请求
   */
  async sendStreamRequest(sessionId, chatMessages, settings, depth) {
    if (this.streamState.shouldStop()) {
      console.log('[NextTurnTrigger] Request interrupted');
      return;
    }

    const port = chrome.runtime.connect({ name: 'chat-stream' });
    this.streamState.startStreaming(port, sessionId, this.sessionManager);

    // 监听响应
    port.onMessage.addListener(async (responseMsg) => {
      await this.handleResponse(responseMsg, sessionId, port, settings, depth);
    });

    // 发送请求
    port.postMessage({
      messages: chatMessages,
      apiKey: settings.apiKey,
      apiEndpoint: this.normalizeEndpoint(settings.apiEndpoint),
      model: settings.model,
      temperature: settings.temperature || 0.7,
      maxTokens: settings.maxTokens || 2000,
      toolsEnabled: true
    });

    console.log('[NextTurnTrigger] Next turn request sent');
  }

  /**
   * 处理响应
   */
  async handleResponse(responseMsg, sessionId, port, settings, depth) {
    const handler = new window.StreamMessageHandler(this.sessionManager, this.streamState);

    await handler.handleMessage(responseMsg, sessionId, port, {
      onChunk: (currentMsg, session) => {
        this.renderIfNeeded(sessionId);
      },
      onComplete: async (finalMsg, session, isEmpty) => {
        if (isEmpty) {
          this.renderIfNeeded(sessionId);
          return;
        }

        await this.sessionManager.saveConversations();
        this.renderIfNeeded(sessionId);

        // 检查是否需要继续递归
        if (finalMsg && finalMsg.role === 'assistant' && finalMsg.content && this.toolManager) {
          const toolExecutor = new window.ToolExecutor(this.sessionManager, this.toolManager);
          const hasTools = await toolExecutor.executeToolCalls(sessionId, finalMsg, () => {
            this.renderIfNeeded(sessionId);
          });

          if (hasTools && !this.streamState.shouldStop()) {
            // 递归调用
            await this.trigger(sessionId, depth + 1);
          }
        }
      },
      onError: async (errorMessage, session) => {
        this.renderIfNeeded(sessionId);
      }
    });
  }

  /**
   * 根据需要渲染
   */
  renderIfNeeded(sessionId) {
    const activeSession = this.sessionManager.getCurrentSession();
    if (activeSession && activeSession.id === sessionId) {
      // 这里需要外部传入render回调
      if (window._chatRenderCallback) {
        window._chatRenderCallback();
      }
    }
  }

  /**
   * 标准化API端点
   */
  normalizeEndpoint(endpoint) {
    if (!endpoint.includes('/chat/completions')) {
      return endpoint.replace(/\/$/, '') + '/chat/completions';
    }
    return endpoint;
  }
}

// 导出
window.NextTurnTrigger = NextTurnTrigger;
