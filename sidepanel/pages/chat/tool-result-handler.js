// 工具结果处理器
// 负责在工具执行后触发AI继续响应

class ToolResultHandler {
  constructor(sessionManager, toolManager, chatContext, streamState) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
    this.chatContext = chatContext;
    this.streamState = streamState;
  }

  /**
   * 处理工具执行结果，触发AI继续响应
   */
  async handleToolResults(sessionId, renderCallback) {
    // 检查是否请求停止
    if (this.streamState.shouldStop()) {
      console.log('[ToolResultHandler] Interrupted by stop request');
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    console.log('[ToolResultHandler] Triggering AI response after tool execution');

    // 获取设置
    const settings = await this.getSettings();
    if (!settings || !settings.apiEndpoint) {
      throw new Error('请先在设置中配置 API 端点');
    }

    // 准备消息（包含工具执行结果）
    let chatMessages = this.prepareMessages(session, settings);

    console.log('[ToolResultHandler] Messages count:', chatMessages.length);

    // 添加助手消息占位
    this.sessionManager.addMessage(sessionId, { role: 'assistant', content: '' });

    // 发送流式请求
    await this.sendStreamRequest(sessionId, chatMessages, settings, renderCallback);
  }

  /**
   * 获取设置
   */
  async getSettings() {
    // 使用SettingsStorage加载设置
    if (window.SettingsStorage) {
      const storage = new window.SettingsStorage();
      return await storage.loadSettings();
    }
    
    // 回退到旧方式
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], resolve);
    });
  }

  /**
   * 准备消息列表
   */
  prepareMessages(session, settings) {
    let chatMessages = [...session.messages];

    // 清理消息
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
  async sendStreamRequest(sessionId, chatMessages, settings, renderCallback) {
    if (this.streamState.shouldStop()) {
      console.log('[ToolResultHandler] Request interrupted');
      return;
    }

    const port = chrome.runtime.connect({ name: 'chat-stream' });
    this.streamState.startStreaming(port, sessionId, this.sessionManager);

    // 监听响应
    const handler = new window.StreamMessageHandler(this.sessionManager, this.streamState);
    
    port.onMessage.addListener(async (responseMsg) => {
      await handler.handleMessage(responseMsg, sessionId, port, {
        onChunk: (currentMsg, session) => {
          if (renderCallback) renderCallback();
        },
        onComplete: async (finalMsg, session, isEmpty) => {
          if (isEmpty) {
            if (renderCallback) renderCallback();
            return;
          }

          await this.sessionManager.saveConversations();
          if (renderCallback) renderCallback();

          // 如果还有工具调用，继续执行
          if (finalMsg && finalMsg.role === 'assistant' && finalMsg.content && this.toolManager) {
            const toolExecutor = new window.ToolExecutor(this.sessionManager, this.toolManager);
            const hasTools = await toolExecutor.executeToolCalls(sessionId, finalMsg, renderCallback);

            if (hasTools && !this.streamState.shouldStop()) {
              // 递归处理，但这是必要的（工具链可能很长）
              setTimeout(async () => {
                await this.handleToolResults(sessionId, renderCallback);
              }, 100);
            }
          }
        },
        onError: async (errorMessage, session) => {
          if (renderCallback) renderCallback();
        }
      });
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

    console.log('[ToolResultHandler] Request sent');
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
window.ToolResultHandler = ToolResultHandler;
