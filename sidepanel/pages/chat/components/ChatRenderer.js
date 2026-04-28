// 聊天渲染器
// 负责消息列表、消息气泡的渲染

class ChatRenderer {
  constructor(create, messageRenderer) {
    this.create = create;
    this.messageRenderer = messageRenderer;
    this.messageListElement = null;
    this.lastMessageElement = null;
  }
  
  /**
   * 确保动画样式存在
   */
  ensureAnimationStyles() {
    if (!document.getElementById('chat-spin-animation')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'chat-spin-animation';
      styleEl.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleEl);
    }
  }
  
  /**
   * 创建新聊天按钮
   */
  createNewChatButton(sessionManager) {
    return this.create('button', {
      className: 'btn btn-primary btn-float',
      text: '开始新聊天',
      onClick: async () => {
        await sessionManager.saveConversations();
        await sessionManager.clearCurrentSession();
        // 需要外部调用 render
        window.dispatchEvent(new CustomEvent('chat:refresh'));
      }
    });
  }
  
  /**
   * 创建消息列表
   */
  createMessageList(messages, session, isLoading, findToolResults) {
    const listElement = this.create('div', { 
      className: 'page-content',
      style: { flex: 1, overflowY: 'auto', padding: '16px' }
    });
    
    if (messages.length === 0) {
      listElement.appendChild(this.create('div', { className: 'empty-state' }, [
        this.create('div', { className: 'empty-state-icon', text: '💬' }),
        this.create('div', { className: 'empty-state-title', text: '开始对话' }),
        this.create('div', { className: 'empty-state-desc', text: '输入消息开始聊天' })
      ]));
    } else {
      this.lastMessageElement = null;
      messages.forEach((msg, index) => {
        // 跳过系统通知、tool消息和内部消息
        if (msg.isSystemNotice || msg.role === 'tool' || msg.isInternal) {
          return;
        }
        
        const bubble = this.createMessageBubble(msg, index, messages, session, findToolResults);
        listElement.appendChild(bubble);
        this.lastMessageElement = bubble;
      });
    }
    
    this.messageListElement = listElement;
    return listElement;
  }
  
  /**
   * 创建消息气泡
   */
  createMessageBubble(msg, index, messages, session, findToolResults) {
    const { create } = this;
    
    const isUser = msg.role === 'user';
    const bubble = create('div', {
      className: `message-bubble ${isUser ? 'message-user' : 'message-assistant'}`,
      style: { position: 'relative' }
    });
    
    // 思考过程（如果有）
    if (msg.additional_kwargs?.reasoning_content) {
      const renderer = new window.ThinkingMode.ThinkingRenderer();
      bubble.appendChild(renderer.render(msg.additional_kwargs.reasoning_content));
    }
    
    // 显示工具调用卡片
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolResults = findToolResults(messages, index);
      msg.tool_calls.forEach((call, idx) => {
        const result = toolResults[idx];
        const card = this.messageRenderer.renderToolCallCard(call, idx, result, session.isLoading);
        bubble.appendChild(card);
      });
    }
    
    // 渲染消息内容
    const hasContent = msg.content && (
      typeof msg.content === 'string' ? msg.content.trim() : 
      Array.isArray(msg.content) ? msg.content.length > 0 : 
      false
    );
    
    if (hasContent) {
      this.messageRenderer.renderMessageContent(msg.content, bubble);
    } else if (msg.role === 'assistant') {
      // 显示加载动画
      const loadingDiv = create('div', { 
        className: 'message-content loading-content',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 0'
        }
      }, [
        create('div', {
          className: 'loading-dots',
          style: {
            display: 'flex',
            gap: '4px'
          }
        }, [
          create('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'loadingPulse 1.4s ease-in-out infinite' } }),
          create('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'loadingPulse 1.4s ease-in-out 0.2s infinite' } }),
          create('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'loadingPulse 1.4s ease-in-out 0.4s infinite' } })
        ]),
        create('span', { text: '思考中...', style: { color: 'var(--color-text-secondary)', fontSize: '13px' } })
      ]);
      bubble.appendChild(loadingDiv);
    }
    
    return bubble;
  }
  
  /**
   * 获取消息列表元素
   */
  getMessageListElement() {
    return this.messageListElement;
  }
}

window.ChatRenderer = ChatRenderer;
