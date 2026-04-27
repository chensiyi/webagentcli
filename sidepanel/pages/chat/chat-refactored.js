// 聊天页面 - 重构版本
// 采用模块化架构，将功能拆分到独立模块

window.Pages = window.Pages || {};

window.Pages.chat = function(container) {
  const { create, clear } = window.DOM;
  const sessionManager = window.SessionManager;
  const chatContext = window.ChatContext;
  const mediaUtils = window.MediaUtils;
  const modelManager = window.ModelManager;
  const toolManager = window.ToolManager;
  
  // 创建输入控制器
  const inputController = new window.InputController(modelManager);
  
  // 创建多媒体管理器
  const mediaManager = new window.MediaManager();
  
  // 导入新模块
  const streamState = window.ChatStreamState;
  const MessageSenderClass = window.MessageSender;
  
  let messageListElement = null;
  let lastMessageElement = null;
  // pendingImages 已废弃，改用 mediaManager.getPendingMedia()
  let currentSettings = null;
  
  // 创建消息发送器实例
  const messageSender = new MessageSenderClass(
    sessionManager,
    toolManager,
    chatContext,
    streamState
  );
  
  /**
   * 渲染聊天页面
   */
  async function render() {
    // 初始化输入控制器
    await inputController.initialize();
    
    clear(container);
    
    const session = sessionManager.getCurrentSession();
    const messages = session ? session.messages : [];
    const isLoading = session ? session.isLoading : false;
    
    console.log('[Chat] Render called, session:', session?.id, 'messages:', messages.length);
    
    // 检测 panel 切换后恢复
    if (session && session.isLoading && !session.port) {
      console.log('[Chat] Detected interrupted stream');
      const hasInterruptedNotice = messages.some(m => 
        m.role === 'system' && m.content?.includes('正在生成回复')
      );
      
      if (!hasInterruptedNotice) {
        session.messages.push({
          role: 'system',
          content: '⏳ 正在生成回复...（后台仍在运行）',
          isSystemNotice: true
        });
      }
    }
    
    const page = create('div', { 
      className: 'page', 
      style: { position: 'relative' }
    });
    
    // 添加动画样式
    ensureAnimationStyles();
    
    // 拖拽上传支持
    setupDragAndDrop(page);
    
    // 浮动按钮
    if (messages.length > 0) {
      page.appendChild(createNewChatButton(session));
    }
    
    // 消息列表
    messageListElement = createMessageList(messages, session, isLoading);
    page.appendChild(messageListElement);
    
    // 后台生成状态提示条
    if (session && session.isLoading && !session.port) {
      page.insertBefore(
        createStatusBanner(session),
        messageListElement
      );
    }
    
    // 输入区
    const inputArea = createInputArea(session, messages);
    page.appendChild(inputArea);
    
    container.appendChild(page);
    
    // 滚动到底部
    scrollToBottom();
  }
  
  /**
   * 确保动画样式存在
   */
  function ensureAnimationStyles() {
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
   * 设置拖拽上传
   */
  async function setupDragAndDrop(page) {
    page.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      page.style.background = 'var(--color-primary-light)';
    });
    
    page.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      page.style.background = '';
    });
    
    page.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      page.style.background = '';
      
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;
      
      try {
        const { results, errors } = await mediaManager.processFiles(files);
        
        // 显示错误
        errors.forEach(err => {
          window.Toast.error(`${err.filename}: ${err.error}`);
        });
        
        // 重新渲染
        if (results.length > 0) {
          render();
        }
      } catch (error) {
        window.Toast.error('处理文件失败: ' + error.message);
      }
    });
  }
  
  /**
   * 创建新聊天按钮
   */
  function createNewChatButton(session) {
    return create('button', {
      className: 'btn btn-primary btn-float',
      text: '开始新聊天',
      onClick: async () => {
        await sessionManager.saveConversations();
        await sessionManager.clearCurrentSession();
        render();
      }
    });
  }
  
  /**
   * 创建消息列表
   */
  function createMessageList(messages, session, isLoading) {
    const listElement = create('div', { 
      className: 'page-content',
      style: { flex: 1, overflowY: 'auto', padding: '16px' }
    });
    
    if (messages.length === 0) {
      listElement.appendChild(create('div', { className: 'empty-state' }, [
        create('div', { className: 'empty-state-icon', text: '💬' }),
        create('div', { className: 'empty-state-title', text: '开始对话' }),
        create('div', { className: 'empty-state-desc', text: '输入消息开始聊天' })
      ]));
    } else {
      lastMessageElement = null;
      messages.forEach((msg, index) => {
        // 跳过系统通知、tool消息和内部消息
        if (msg.isSystemNotice || msg.role === 'tool' || msg.isInternal) {
          return;
        }
        
        const bubble = createMessageBubble(msg, index, messages, session);
        listElement.appendChild(bubble);
        
        if (index === messages.length - 1) {
          lastMessageElement = bubble.querySelector('.message-content') || bubble;
        }
      });
      
      if (isLoading) {
        listElement.appendChild(create('div', { 
          className: 'message-bubble message-assistant loading-bubble',
          style: { marginBottom: '12px' }
        }, [
          create('div', { text: '思考中...' })
        ]));
      }
    }
    
    return listElement;
  }
  
  /**
   * 创建消息气泡
   */
  function createMessageBubble(msg, index, messages, session) {
    const bubble = create('div', {
      className: `message-bubble message-${msg.role}`,
      style: { 
        marginBottom: '12px',
        position: 'relative'
      }
    });
    
    // 删除按钮
    const deleteBtn = createDeleteButton(index, session);
    bubble.onmouseenter = () => deleteBtn.style.display = 'flex';
    bubble.onmouseleave = () => deleteBtn.style.display = 'none';
    bubble.appendChild(deleteBtn);
    
    // 渲染思考过程
    if (msg.role === 'assistant' && msg.additional_kwargs?.reasoning_content) {
      const renderer = new window.ThinkingMode.ThinkingRenderer();
      bubble.appendChild(renderer.render(msg.additional_kwargs.reasoning_content));
    }
    
    // 显示工具调用卡片
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolResults = findToolResults(messages, index);
      msg.tool_calls.forEach((call, idx) => {
        const result = toolResults[idx];
        const card = window.ChatRender.renderToolCallCard(call, idx, result, session.isLoading);
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
      window.ChatRender.renderMessageContent(msg.content, bubble);
    } else if (msg.role === 'assistant') {
      bubble.appendChild(create('div', { className: 'message-content' }));
    }
    
    return bubble;
  }
  
  /**
   * 创建删除按钮
   */
  function createDeleteButton(index, session) {
    return create('button', {
      className: 'btn-delete-message',
      text: '×',
      style: {
        position: 'absolute',
        bottom: '4px',
        right: '4px',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'var(--color-danger)',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        fontSize: '16px',
        lineHeight: '1',
        padding: '0',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        zIndex: 10
      },
      onClick: async () => {
        const confirmed = await window.Toast.confirm({
          title: '删除消息',
          message: '确定要删除这条消息吗？此操作不可恢复。'
        });
        
        if (confirmed) {
          const deleted = sessionManager.deleteMessageWithTools(session.id, index);
          if (deleted) {
            await sessionManager.saveConversations();
            render();
            window.Toast.success('消息已删除');
          }
        }
      }
    });
  }
  
  /**
   * 查找工具结果
   */
  function findToolResults(messages, assistantIndex) {
    const toolResults = [];
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'tool') {
        const toolMsg = messages[i];
        const matchingCall = messages[assistantIndex].tool_calls.find(
          tc => tc.id === toolMsg.tool_call_id
        );
        if (matchingCall) {
          toolResults.push({
            tool_call: matchingCall,
            tool_result: {
              success: true,
              output: toolMsg.content
            }
          });
        }
      } else {
        break;
      }
    }
    return toolResults;
  }
  
  /**
   * 创建状态提示条
   */
  function createStatusBanner(session) {
    const banner = create('div', {
      className: 'stream-status-banner',
      style: {
        padding: '10px 16px',
        background: 'var(--color-primary-light)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: 'var(--color-text-secondary)'
      }
    });
    
    banner.appendChild(create('div', { text: '⏳ 后台正在生成回复...' }));
    banner.appendChild(create('button', {
      text: '取消',
      style: {
        padding: '4px 12px',
        background: 'transparent',
        border: '1px solid var(--color-danger)',
        borderRadius: '4px',
        color: 'var(--color-danger)',
        cursor: 'pointer',
        fontSize: '12px'
      },
      onClick: async () => {
        const noticeIndex = session.messages.findIndex(m => m.isSystemNotice);
        if (noticeIndex !== -1) {
          session.messages.splice(noticeIndex, 1);
        }
        session.isLoading = false;
        await sessionManager.saveConversations();
        render();
        window.Toast.info('已取消等待');
      }
    }));
    
    return banner;
  }
  
  /**
   * 创建输入区
   */
  function createInputArea(session, messages) {
    const inputArea = create('div', { 
      className: 'page-footer',
      style: { padding: '12px' }
    });
    
    // 多媒体预览
    const mediaPreview = createMediaPreview();
    if (mediaPreview) {
      inputArea.appendChild(mediaPreview);
    }
    
    // 获取模型能力
    const capabilities = inputController.getCapabilitySummary();
    
    // 输入行
    const inputRow = create('div', { 
      className: 'input-row',
      style: { display: 'flex', gap: '8px', alignItems: 'center' } 
    });
    
    // 工具开关（如果支持）
    if (capabilities.tools) {
      inputRow.appendChild(createToolsWrapper());
    }
    
    // 图片上传（如果支持）
    if (capabilities.image) {
      const { uploadBtn, fileInput } = createMediaUploadButton('image');
      inputRow.appendChild(uploadBtn);
      inputRow.appendChild(fileInput);
    }
    
    // 音频上传（如果支持）
    if (capabilities.audio) {
      const { uploadBtn, fileInput } = createMediaUploadButton('audio');
      inputRow.appendChild(uploadBtn);
      inputRow.appendChild(fileInput);
    }
    
    // 视频上传（如果支持）
    if (capabilities.video) {
      const { uploadBtn, fileInput } = createMediaUploadButton('video');
      inputRow.appendChild(uploadBtn);
      inputRow.appendChild(fileInput);
    }
    
    // 文本输入
    const input = createTextInput(capabilities, session);
    
    // 发送按钮
    const sendBtn = createSendButton(input, session);
    
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    inputArea.appendChild(inputRow);
    
    return inputArea;
  }
  
  /**
   * 创建多媒体预览
   */
  function createMediaPreview() {
    const pendingMedia = mediaManager.getPendingMedia();
    if (pendingMedia.length === 0) return null;
    
    const previewContainer = create('div', {
      className: 'media-preview-container',
      style: { 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '8px',
        flexWrap: 'wrap',
        padding: '8px',
        background: 'var(--color-surface)',
        borderRadius: '8px'
      }
    });
    
    pendingMedia.forEach((media, index) => {
      const previewBox = create('div', { 
        style: { 
          position: 'relative', 
          display: 'inline-block' 
        } 
      });
      
      // 根据类型显示不同的预览
      if (media.type === 'image') {
        const imgEl = create('img', {
          attrs: { src: media.previewUrl, title: media.filename },
          style: { 
            width: '80px', 
            height: '80px', 
            objectFit: 'cover',
            borderRadius: '6px',
            border: '2px solid var(--color-border)',
            cursor: 'pointer'
          }
        });
        imgEl.onclick = () => window.open(media.dataUrl, '_blank');
        previewBox.appendChild(imgEl);
      } else if (media.type === 'audio') {
        const audioEl = create('audio', {
          attrs: { 
            src: media.previewUrl,
            controls: true
          },
          style: { 
            width: '200px',
            borderRadius: '6px'
          }
        });
        previewBox.appendChild(audioEl);
      } else if (media.type === 'video') {
        const videoEl = create('video', {
          attrs: { 
            src: media.previewUrl,
            controls: true
          },
          style: { 
            width: '200px',
            maxHeight: '150px',
            borderRadius: '6px'
          }
        });
        previewBox.appendChild(videoEl);
      }
      
      // 删除按钮
      const removeBtn = create('button', {
        text: '×',
        className: 'btn-remove-media',
        style: {
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'var(--color-danger)',
          color: 'white',
          border: '2px solid white',
          cursor: 'pointer',
          fontSize: '14px',
          lineHeight: '1',
          padding: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        },
        onClick: () => {
          mediaManager.removeMedia(index);
          render();
        }
      });
      
      previewBox.appendChild(removeBtn);
      previewContainer.appendChild(previewBox);
    });
    
    return previewContainer;
  }
  
  /**
   * 创建工具包装器
   */
  function createToolsWrapper() {
    const wrapper = create('div', {
      className: 'tools-wrapper',
      style: { position: 'relative', display: 'inline-block' }
    });
    
    const trigger = create('button', {
      className: 'tools-trigger-btn',
      text: '🛠️',
      style: {
        padding: '6px 8px',
        fontSize: '14px',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        background: 'transparent',
        cursor: 'pointer'
      },
      title: '工具开关'
    });
    
    const menu = create('div', {
      className: 'tools-menu',
      style: {
        position: 'absolute',
        bottom: '100%',
        left: '0',
        marginBottom: '8px',
        padding: '8px',
        background: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        opacity: '0',
        visibility: 'hidden',
        transform: 'translateY(10px)',
        transition: 'all 0.2s',
        zIndex: '1000'
      }
    });
    
    if (toolManager) {
      toolManager.getAllTools().forEach(tool => {
        const toolItem = createToolItem(tool);
        menu.appendChild(toolItem);
      });
    }
    
    wrapper.onmouseenter = () => {
      menu.style.opacity = '1';
      menu.style.visibility = 'visible';
      menu.style.transform = 'translateY(0)';
      trigger.style.borderColor = 'var(--color-primary)';
    };
    
    wrapper.onmouseleave = () => {
      menu.style.opacity = '0';
      menu.style.visibility = 'hidden';
      menu.style.transform = 'translateY(10px)';
      trigger.style.borderColor = 'var(--color-border)';
    };
    
    wrapper.appendChild(menu);
    wrapper.appendChild(trigger);
    
    return wrapper;
  }
  
  /**
   * 创建工具项
   */
  function createToolItem(tool) {
    const item = create('div', {
      className: 'tool-item',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    });
    
    const icon = tool.id === 'web_search' ? '🔍' : '⚡';
    item.appendChild(create('span', { text: icon, style: { fontSize: '16px' } }));
    item.appendChild(create('span', { text: tool.name, style: { fontSize: '13px', flex: '1' } }));
    
    const toggle = create('div', {
      className: `toggle-switch ${tool.enabled ? 'active' : ''}`,
      style: {
        width: '32px',
        height: '18px',
        borderRadius: '9px',
        background: tool.enabled ? 'var(--color-primary)' : 'var(--color-border)',
        position: 'relative',
        cursor: 'pointer'
      }
    });
    
    const knob = create('div', {
      style: {
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: '2px',
        left: tool.enabled ? '16px' : '2px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }
    });
    
    toggle.appendChild(knob);
    item.appendChild(toggle);
    
    item.onclick = async () => {
      const wasEnabled = tool.enabled;
      await toolManager.toggleTool(tool.id, !tool.enabled);
      toggle.className = `toggle-switch ${tool.enabled ? 'active' : ''}`;
      toggle.style.background = tool.enabled ? 'var(--color-primary)' : 'var(--color-border)';
      knob.style.left = tool.enabled ? '16px' : '2px';
      window.Toast.success(`${tool.name}已${wasEnabled ? '关闭' : '开启'}`);
    };
    
    return item;
  }
  
  /**
   * 创建多媒体上传按钮
   */
  function createMediaUploadButton(mediaType) {
    const icons = {
      image: '📷',
      audio: '🎤',
      video: '🎥'
    };
    
    const titles = {
      image: '上传图片（支持拖拽和粘贴）',
      audio: '上传音频文件',
      video: '上传视频文件'
    };
    
    const accepts = {
      image: 'image/*',
      audio: 'audio/*',
      video: 'video/*'
    };
    
    const uploadBtn = create('button', {
      className: 'btn btn-secondary',
      text: icons[mediaType],
      style: { 
        padding: '8px 12px', 
        fontSize: '16px'
      },
      title: titles[mediaType]
    });
    
    const fileInput = create('input', {
      attrs: { 
        type: 'file', 
        accept: accepts[mediaType],
        multiple: mediaType === 'image' // 只允许多选图片
      },
      style: { display: 'none' },
      onChange: async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        try {
          const { results, errors } = await mediaManager.processFiles(files);
          
          errors.forEach(err => {
            window.Toast.error(`${err.filename}: ${err.error}`);
          });
          
          if (results.length > 0) {
            render();
          }
        } catch (error) {
          window.Toast.error('处理文件失败: ' + error.message);
        }
        
        e.target.value = '';
      }
    });
    
    uploadBtn.onclick = () => {
      fileInput.click();
    };
    
    return { uploadBtn, fileInput };
  }
  
  /**
   * 创建文本输入框
   */
  function createTextInput(capabilities, session) {
    // 根据能力生成placeholder
    const supportedInputs = [];
    if (capabilities.image) supportedInputs.push('图片');
    if (capabilities.audio) supportedInputs.push('音频');
    if (capabilities.video) supportedInputs.push('视频');
    
    let placeholder = '输入消息';
    if (supportedInputs.length > 0) {
      placeholder += `（支持拖拽/粘贴${supportedInputs.join('、')}）`;
    } else {
      placeholder += '...';
    }
    
    const input = create('input', {
      className: 'input',
      attrs: { 
        type: 'text', 
        placeholder: placeholder
      },
      style: { flex: 1 }
    });
    
    // 粘贴多媒体支持
    input.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
      
      if (files.length === 0) return;
      
      e.preventDefault();
      
      try {
        const { results, errors } = await mediaManager.processFiles(files);
        
        errors.forEach(err => {
          window.Toast.error(`${err.filename}: ${err.error}`);
        });
        
        if (results.length > 0) {
          render();
        }
      } catch (error) {
        window.Toast.error('处理粘贴文件失败: ' + error.message);
      }
    });
    
    // Enter发送
    input.addEventListener('keydown', async (e) => {
      // Ctrl + ArrowUp/ArrowDown 导航
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        navigateMessages(e.key === 'ArrowUp');
        return;
      }
      
      if (e.key === 'Enter' && !session?.isLoading) {
        const text = input.value.trim();
        const pendingMedia = mediaManager.getPendingMedia();
        
        if (!text && pendingMedia.length === 0) {
          return;
        }
        
        // 如果没有当前会话，创建新会话
        if (!sessionManager.currentSessionId) {
          sessionManager.currentSessionId = 'conv_' + Date.now();
          sessionManager.createSession(sessionManager.currentSessionId, []);
          sessionManager.setCurrentSession(sessionManager.currentSessionId);
        }
        
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession) return;
        
        // 发送消息
        const success = await messageSender.sendMessage(
          currentSession.id,
          text,
          pendingMedia,
          render
        );
        
        if (success) {
          // 清空输入和多媒体
          input.value = '';
          mediaManager.clearAll();
          
          render();
        }
      }
    });
    
    return input;
  }
  
  /**
   * 导航消息
   */
  function navigateMessages(up) {
    const session = sessionManager.getCurrentSession();
    if (!session || session.messages.length === 0 || !messageListElement) return;
    
    const userMessageIndices = [];
    session.messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        userMessageIndices.push(idx);
      }
    });
    
    if (userMessageIndices.length === 0) return;
    
    const bubbles = messageListElement.querySelectorAll('.message-bubble');
    let currentIndex = -1;
    
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const bubble = bubbles[i];
      const rect = bubble.getBoundingClientRect();
      const containerRect = messageListElement.getBoundingClientRect();
      
      if (rect.top >= containerRect.top && rect.top < containerRect.top + containerRect.clientHeight / 2) {
        currentIndex = i;
        break;
      }
    }
    
    let targetIndex;
    if (up) {
      targetIndex = userMessageIndices.reverse().find(idx => idx < currentIndex) ?? 
                    userMessageIndices[userMessageIndices.length - 1];
    } else {
      targetIndex = userMessageIndices.find(idx => idx > currentIndex) ?? userMessageIndices[0];
    }
    
    if (targetIndex !== undefined && bubbles[targetIndex]) {
      bubbles[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  /**
   * 创建发送按钮
   */
  function createSendButton(input, session) {
    const capabilities = inputController.getCapabilitySummary();
    
    // 如果支持流式，显示切换按钮
    if (capabilities.streaming) {
      return createStreamingSendButton(input, session);
    } else {
      return createBlockingSendButton(input, session);
    }
  }
  
  /**
   * 创建流式发送按钮（支持中断）
   */
  function createStreamingSendButton(input, session) {
    const sendBtn = create('button', {
      className: 'btn btn-primary',
      text: '发送',
      id: 'send-button'
    });
    
    // 绑定到流式状态管理器
    streamState.bindSendButton(sendBtn);
    
    // ESC停止
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && streamState.isStreaming) {
        streamState.stopStreaming(session?.id, sessionManager, render);
      }
    });
    
    sendBtn.addEventListener('click', () => {
      if (streamState.isStreaming) {
        streamState.stopStreaming(session?.id, sessionManager, render);
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }
    });
    
    return sendBtn;
  }
  
  /**
   * 创建阻断式发送按钮（不支持流式）
   */
  function createBlockingSendButton(input, session) {
    const sendBtn = create('button', {
      className: 'btn btn-primary',
      text: '发送',
      id: 'send-button',
      style: {
        opacity: streamState.isStreaming ? 0.5 : 1,
        cursor: streamState.isStreaming ? 'not-allowed' : 'pointer'
      },
      disabled: streamState.isStreaming
    });
    
    sendBtn.addEventListener('click', () => {
      if (streamState.isStreaming) {
        window.Toast.warning('正在处理请求，请稍候...');
        return;
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    
    return sendBtn;
  }
  
  /**
   * 滚动到底部
   */
  function scrollToBottom() {
    if (messageListElement) {
      setTimeout(() => {
        messageListElement.scrollTop = messageListElement.scrollHeight;
      }, 50);
    }
  }
  
  // 初始化
  sessionManager.loadMessages().then(() => {
    console.log('[Chat] Messages loaded');
    render();
  });
};
