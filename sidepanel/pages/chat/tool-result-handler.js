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
  async handleToolResults(sessionId, renderCallback, fullRenderCallback) {
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

    // 准备消息（包含工具执行结果，不包含新的 assistant 占位）
    let chatMessages = this.prepareMessages(session, settings);

    console.log('[ToolResultHandler] Messages count:', chatMessages.length);

    // 发送流式请求（内部会添加 assistant 占位）
    // 流式请求是异步的，会在 onComplete/onError 回调中处理结果
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

    console.log('[ToolResultHandler] Connecting to chat-stream port...');
    
    // 添加助手消息占位符（用于接收流式响应）
    this.sessionManager.addMessage(sessionId, { role: 'assistant', content: '' });
    console.log('[ToolResultHandler] Added assistant placeholder message');
    
    const port = chrome.runtime.connect({ name: 'chat-stream' });
    this.streamState.startStreaming(port, sessionId, this.sessionManager);

    // 监听响应
    const handler = new window.StreamMessageHandler(this.sessionManager, this.streamState);
    
    port.onMessage.addListener(async (responseMsg) => {
      await handler.handleMessage(responseMsg, sessionId, port, {
        onChunk: (currentMsg, session) => {
          if (renderCallback) renderCallback();
        },
        onReasoning: (currentMsg, session) => {
          // 思考内容增量更新，只更新思考气泡，不重绘整个页面
          this.updateReasoningBubble(currentMsg);
        },
        onToolCall: (currentMsg, session) => {
          if (renderCallback) renderCallback();
        },
        onComplete: async (finalMsg, session, isEmpty) => {
          console.log('[ToolResultHandler] onComplete - finalMsg:', finalMsg?.role, 'tool_calls:', finalMsg?.tool_calls?.length, 'isEmpty:', isEmpty);
          
          if (isEmpty) {
            if (renderCallback) renderCallback();
            return;
          }

          // 先渲染 assistant 消息
          if (renderCallback) renderCallback();
          await this.sessionManager.saveConversations();

          // 如果还有工具调用，继续执行
          if (finalMsg && finalMsg.role === 'assistant' && this.toolManager) {
            const hasToolCalls = finalMsg.tool_calls && finalMsg.tool_calls.length > 0;
            const hasContent = finalMsg.content && finalMsg.content.trim();
            
            console.log('[ToolResultHandler] Checking tool execution - hasToolCalls:', hasToolCalls, 'hasContent:', hasContent);
            
            // 有工具调用或内容时才处理
            if (hasToolCalls || hasContent) {
              console.log('[ToolResultHandler] Starting tool execution...');
              const toolExecutor = new window.ToolExecutor(this.sessionManager, this.toolManager);
              await toolExecutor.executeToolCalls(sessionId, finalMsg,
                () => {
                  // 流式更新时的增量渲染
                  if (renderCallback) renderCallback();
                }
              );

              // 工具执行完成后，再次渲染（显示tool结果）
              if (renderCallback) renderCallback();
              await this.sessionManager.saveConversations();
            } else {
              // 没有工具调用也没有内容，也要渲染
              if (renderCallback) renderCallback();
            }
          } else {
            console.log('[ToolResultHandler] Skipping tool execution - finalMsg:', finalMsg?.role, 'hasToolManager:', !!this.toolManager);
            // 不是 assistant 消息，也要渲染
            if (renderCallback) renderCallback();
          }
        },
        onError: async (errorMessage, session) => {
          console.error('[ToolResultHandler] onError:', errorMessage);
          if (renderCallback) renderCallback();
        }
      });
    });

    // 发送请求
    let toolsDefinition = null;
    if (this.toolManager && this.toolManager.getOpenAIToolsDefinition) {
      toolsDefinition = this.toolManager.getOpenAIToolsDefinition();
    }

    console.log('[ToolResultHandler] Sending request with', chatMessages.length, 'messages');
    
    // 使用适配器构建端点
    let apiEndpoint = settings.apiEndpoint;
    
    if (settings.apiStandard && window.AdapterManager) {
      try {
        window.AdapterManager.select(settings.apiStandard);
        window.AdapterManager.configure({
          endpoint: settings.apiEndpoint,
          apiKey: settings.apiKey,
          defaultModel: settings.model
        });
        
        const adapter = window.AdapterManager.getCurrentAdapter();
        apiEndpoint = adapter.buildUrl('/chat/completions');
        
        console.log('[ToolResultHandler] Using adapter:', settings.apiStandard, 'Endpoint:', apiEndpoint);
      } catch (e) {
        console.warn('[ToolResultHandler] Adapter failed, using normalized endpoint:', e);
        apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
      }
    } else {
      apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
    }
    
    port.postMessage({
      messages: chatMessages,
      apiKey: settings.apiKey,
      apiEndpoint: apiEndpoint,
      model: settings.model,
      temperature: settings.temperature || 0.7,
      maxTokens: settings.maxTokens || 2000,
      toolsEnabled: true,
      tools: toolsDefinition
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

  /**
   * 增量更新思考气泡（不重绘整个页面）
   * @param {Object} message - 消息对象
   */
  updateReasoningBubble(message) {
    if (!message || !message.id) return;
    
    // 调用全局的 updateMessageById 函数进行精确更新
    if (window.updateMessageById) {
      window.updateMessageById(message.id);
    }
  }
}

// 导出
window.ToolResultHandler = ToolResultHandler;
