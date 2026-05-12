// 消息发送器
// 负责构建和发送用户消息到AI

class MessageSender {
  constructor(sessionManager, toolManager, chatContext, streamState) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
    this.chatContext = chatContext;
    this.streamState = streamState;
  }

  /**
   * 发送消息
   */
  async sendMessage(sessionId, text, media, renderCallback, fullRenderCallback) {
    // 验证输入
    if (!text && media.length === 0) {
      console.warn('[MessageSender] Empty message blocked');
      return false;
    }

    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return false;
    }

    // 构建多模态消息
    const userMessage = this.buildUserMessage(text, media);

    // 打印日志
    console.log('[MessageSender] ===== Sending message =====');
    
    // 分类统计媒体
    const mediaStats = {};
    media.forEach(m => {
      mediaStats[m.type] = (mediaStats[m.type] || 0) + 1;
    });
    
    if (Object.keys(mediaStats).length > 0) {
      const statStr = Object.entries(mediaStats).map(([type, count]) => `${count}个${type}`).join('，');
      console.log('[MessageSender] Media:', statStr);
    }
    
    if (text) {
      console.log('[MessageSender] Text:', text);
    }
    console.log('[MessageSender] ====================');

    // 添加用户消息
    this.sessionManager.addMessage(sessionId, userMessage);
    await this.sessionManager.saveConversations();

    // 调用AI
    await this.callAI(sessionId, renderCallback);

    return true;
  }

  /**
   * 构建用户消息
   */
  buildUserMessage(text, media) {
    const contentParts = [];
    
    // 添加文本
    if (text) {
      contentParts.push({ type: 'text', text });
    }
    
    // 添加媒体
    media.forEach(item => {
      if (item.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: { url: item.dataUrl }
        });
      } else if (item.type === 'audio') {
        contentParts.push({
          type: 'input_audio',
          input_audio: {
            data: item.dataUrl,
            format: 'webm'
          }
        });
      } else if (item.type === 'video') {
        // 视频暂时作为文件附件处理（部分API支持）
        contentParts.push({
          type: 'file',
          file: {
            filename: item.filename,
            data: item.dataUrl,
            mimeType: 'video/mp4'
          }
        });
      }
    });
    
    // 如果只有文本，返回简单格式
    if (contentParts.length === 1 && contentParts[0].type === 'text') {
      return { role: 'user', content: text };
    }
    
    // 多模态内容
    return {
      role: 'user',
      content: contentParts
    };
  }

  /**
   * 调用AI
   */
  async callAI(sessionId, renderCallback) {
    const settings = await this.getSettings();
    if (!settings || !settings.apiEndpoint) {
      throw new Error('请先在设置中配置 API 端点');
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    // 使用适配器构建请求（如果可用）
    let apiEndpoint = settings.apiEndpoint;
    let chatMessages = this.prepareMessages(session, settings);
    
    // 优先使用 AdapterManager（支持独立适配器）
    if (settings.apiStandard && window.AdapterManager) {
      try {
        window.AdapterManager.select(settings.apiStandard);
        window.AdapterManager.configure({
          endpoint: settings.apiEndpoint,
          apiKey: settings.apiKey,
          defaultModel: settings.model
        });
        
        const adapter = window.AdapterManager.getCurrentAdapter();
        
        // 对于 LM Studio，直接使用适配器构建 URL
        if (settings.apiStandard === 'lm-studio') {
          apiEndpoint = adapter.buildUrl('/chat/completions');
        } else {
          // 其他适配器使用 ProviderAdapter 兼容方式
          apiEndpoint = adapter.buildUrl(
            settings.apiEndpoint,
            adapter.currentAdapter?.defaults?.chatPath || '/chat/completions'
          );
        }
        
        console.log('[MessageSender] Using adapter:', settings.apiStandard, 'Endpoint:', apiEndpoint);
      } catch (e) {
        console.warn('[MessageSender] Adapter failed, using raw endpoint:', e);
        apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
      }
    } else if (settings.apiStandard && window.ProviderAdapter) {
      // 回退到 ProviderAdapter
      try {
        const adapter = new window.ProviderAdapter();
        adapter.selectTemplate(settings.apiStandard);
        adapter.configure({
          endpoint: settings.apiEndpoint,
          apiKey: settings.apiKey,
          defaultModel: settings.model
        });
        
        apiEndpoint = adapter.buildUrl(
          settings.apiEndpoint,
          adapter.currentAdapter.defaults.chatPath
        );
        
        console.log('[MessageSender] Using ProviderAdapter:', settings.apiStandard, 'Endpoint:', apiEndpoint);
      } catch (e) {
        console.warn('[MessageSender] ProviderAdapter failed, using raw endpoint:', e);
        apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
      }
    } else {
      // 原有逻辑
      apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
    }

    // 验证消息列表不为空
    if (chatMessages.length === 0) {
      throw new Error('消息列表为空，无法发送请求');
    }

    console.log('[MessageSender] Sending messages:', chatMessages.length, 'messages');

    // 智能截断消息
    if (settings.autoContextTruncation !== false) {
      const beforeTruncate = chatMessages.length;
      chatMessages = this.chatContext.truncateMessages(
        chatMessages,
        settings.model,
        settings.maxTokens || 2000
      );

      const usage = this.chatContext.getContextUsage(chatMessages, settings.model);
      console.log(`[MessageSender] Context usage: ${usage.used}/${usage.total} (${usage.percentage}%)`);

      if (chatMessages.length < beforeTruncate) {
        console.log(`[MessageSender] Auto-truncated: ${beforeTruncate} -> ${chatMessages.length} messages`);
      }
    }

    // 添加助手消息占位
    this.sessionManager.addMessage(sessionId, { role: 'assistant', content: '' });

    // 发送流式请求
    const port = chrome.runtime.connect({ name: 'chat-stream' });
    this.streamState.startStreaming(port, sessionId, this.sessionManager);

    // 打印请求日志
    console.log('[MessageSender] ===== Stream request started =====');
    console.log('[MessageSender] Session ID:', sessionId);
    console.log('[MessageSender] Model:', settings.model);
    console.log('[MessageSender] Messages:', chatMessages.length);
    console.log('[MessageSender] ==================================');

    // 检查工具是否启用
    const enabledTools = this.toolManager && this.toolManager.getEnabledTools ? 
      this.toolManager.getEnabledTools() : [];
    const toolsEnabled = enabledTools.length > 0;
    console.log('[MessageSender] Enabled tools:', enabledTools.map(t => t.id));
    console.log('[MessageSender] Tools enabled:', toolsEnabled);

    // 生成 OpenAI 标准格式的工具定义
    let toolsDefinition = null;
    if (toolsEnabled && this.toolManager && this.toolManager.getOpenAIToolsDefinition) {
      toolsDefinition = this.toolManager.getOpenAIToolsDefinition();
      console.log('[MessageSender] Tools definition:', JSON.stringify(toolsDefinition, null, 2));
    }

    // 监听响应
    const handler = new window.StreamMessageHandler(this.sessionManager, this.streamState);
    
    port.onMessage.addListener(async (msg) => {
      await handler.handleMessage(msg, sessionId, port, {
        onChunk: (currentMsg, session) => {
          this.renderIfNeeded(sessionId, renderCallback);
        },
        onReasoning: (currentMsg, session) => {
          // 思考内容增量更新，只更新思考气泡，不重绘整个页面
          this.updateReasoningBubble(currentMsg);
        },
        onToolCall: (currentMsg, session) => {
          // 收到 tool_calls 时立即渲染
          this.renderIfNeeded(sessionId, renderCallback);
        },
        onComplete: async (finalMsg, session, isEmpty) => {
          if (isEmpty) {
            this.renderIfNeeded(sessionId, renderCallback);
            return;
          }

          // 先渲染 assistant 消息（包含 tool_calls 卡片）
          this.renderIfNeeded(sessionId, renderCallback);
          await this.sessionManager.saveConversations();

          // 如果有工具调用，执行工具
          if (finalMsg?.role === 'assistant' && finalMsg?.tool_calls?.length > 0) {
            console.log('[MessageSender] Executing', finalMsg.tool_calls.length, 'tool(s)');
            const toolExecutor = new window.ToolExecutor(this.sessionManager, this.toolManager);
            await toolExecutor.executeToolCalls(sessionId, finalMsg, 
              () => {
                // 流式更新时的增量渲染
                this.renderIfNeeded(sessionId, renderCallback);
              }
            );

            // 工具执行完成后，再次渲染（显示tool结果）
            this.renderIfNeeded(sessionId, renderCallback);
            await this.sessionManager.saveConversations();
            
            // 检查是否请求停止
            if (this.streamState.shouldStop()) {
              console.log('[MessageSender] Stopped after tool execution');
              return;
            }
            
            // 工具执行完成后，自动触发下一轮对话
            console.log('[MessageSender] Tool execution completed, triggering next round');
            const toolResultHandler = new window.ToolResultHandler(
              this.sessionManager, 
              this.toolManager,
              this.chatContext,
              this.streamState
            );
            
            // 使用 renderCallback 作为 fullRenderCallback
            await toolResultHandler.handleToolResults(sessionId, renderCallback, renderCallback);
          }
        },
        onError: async (errorMessage, session) => {
          this.renderIfNeeded(sessionId, renderCallback);
        }
      });
    });

    // 发送请求
    port.postMessage({
      messages: chatMessages,
      apiKey: settings.apiKey,
      apiEndpoint,
      model: settings.model,
      temperature: settings.temperature || 0.7,
      maxTokens: settings.maxTokens || 2000,
      toolsEnabled: toolsEnabled,
      tools: toolsDefinition
    });

    console.log(`[MessageSender] Chat request started: session=${sessionId}, model=${settings.model}, messages=${chatMessages.length}, toolsEnabled=${toolsEnabled}`);
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

    // 过滤掉临时系统通知（isSystemNotice）和 tool 消息
    // tool 消息会由工具执行器在正确的时机插入
    chatMessages = chatMessages.filter(msg => !msg.isSystemNotice && msg.role !== 'tool');

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

      // tool 消息的标准字段（OpenAI 要求必须包含）
      if (msg.role === 'tool') {
        if (msg.tool_call_id) cleanMsg.tool_call_id = msg.tool_call_id;
        if (msg.name) cleanMsg.name = msg.name;
      }

      if (msg.additional_kwargs) {
        cleanMsg.additional_kwargs = msg.additional_kwargs;
      }

      return cleanMsg;
    });

    // 添加工具系统提示
    if (this.toolManager) {
      const toolPrompt = this.toolManager.generateSystemPrompt();
      if (toolPrompt) {
        const currentTime = window.TimeUtils.getCurrentTimeString();
        const timeInfo = `当前时间: ${currentTime}\n\n`;

        const fullSystemPrompt = settings.systemPrompt
          ? `${timeInfo}${toolPrompt}\n\n${settings.systemPrompt}`
          : `${timeInfo}${toolPrompt}`;

        chatMessages = [
          { role: 'system', content: fullSystemPrompt },
          ...chatMessages
        ];
      } else if (settings.systemPrompt) {
        const currentTime = window.TimeUtils.getCurrentTimeString();
        const timeInfo = `当前时间: ${currentTime}\n\n`;

        chatMessages = [
          { role: 'system', content: `${timeInfo}${settings.systemPrompt}` },
          ...chatMessages
        ];
      }
    } else if (settings.systemPrompt) {
      const currentTime = window.TimeUtils.getCurrentTimeString();
      const timeInfo = `当前时间: ${currentTime}\n\n`;

      chatMessages = [
        { role: 'system', content: `${timeInfo}${settings.systemPrompt}` },
        ...chatMessages
      ];
    } else {
      const currentTime = window.TimeUtils.getCurrentTimeString();
      chatMessages = [
        { role: 'system', content: `当前时间: ${currentTime}` },
        ...chatMessages
      ];
    }

    return chatMessages;
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
   * 根据需要渲染
   */
  renderIfNeeded(sessionId, renderCallback) {
    const currentSession = this.sessionManager.getCurrentSession();
    if (currentSession && currentSession.id === sessionId && renderCallback) {
      renderCallback();
    }
  }

  /**
   * 增量更新思考气泡（不重绘整个页面）
   * @param {Object} message - 消息对象
   */
  updateReasoningBubble(message) {
    if (!message || !message.id) return;
    
    console.log('[MessageSender] updateReasoningBubble called for message:', message.id);
    
    // 调用全局的 updateMessageById 函数进行精确更新
    if (window.updateMessageById) {
      window.updateMessageById(message.id);
    } else {
      console.warn('[MessageSender] updateMessageById not available');
    }
  }
}

// 导出
window.MessageSender = MessageSender;
