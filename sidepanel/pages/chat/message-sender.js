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
  async sendMessage(sessionId, text, media, renderCallback) {
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

    // 刷新工具缓存时间戳
    if (this.toolManager) {
      await this.toolManager.refreshCacheTimestamp();
    }

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

    let apiEndpoint = this.normalizeEndpoint(settings.apiEndpoint);
    let chatMessages = this.prepareMessages(session, settings);

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

    // 监听响应
    const handler = new window.StreamMessageHandler(this.sessionManager, this.streamState);
    
    port.onMessage.addListener(async (msg) => {
      await handler.handleMessage(msg, sessionId, port, {
        onChunk: (currentMsg, session) => {
          this.renderIfNeeded(sessionId, renderCallback);
        },
        onReasoning: (currentMsg, session) => {
          this.renderIfNeeded(sessionId, renderCallback);
        },
        onComplete: async (finalMsg, session, isEmpty) => {
          if (isEmpty) {
            this.renderIfNeeded(sessionId, renderCallback);
            return;
          }

          // 执行工具调用
          const toolExecutor = new window.ToolExecutor(this.sessionManager, this.toolManager);
          const hasTools = await toolExecutor.executeToolCalls(sessionId, finalMsg, () => {
            this.renderIfNeeded(sessionId, renderCallback);
          });

          if (hasTools) {
            // 触发下一轮对话
            const nextTurnTrigger = new window.NextTurnTrigger(
              this.sessionManager,
              this.toolManager,
              this.chatContext,
              this.streamState
            );
            
            // 延迟执行，确保渲染完成
            setTimeout(async () => {
              await nextTurnTrigger.trigger(sessionId, 0);
            }, 100);
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
      toolsEnabled: toolsEnabled
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

    // 清理消息
    chatMessages = chatMessages.map(msg => {
      const cleanMsg = {
        role: msg.role,
        content: msg.content
      };

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
}

// 导出
window.MessageSender = MessageSender;
