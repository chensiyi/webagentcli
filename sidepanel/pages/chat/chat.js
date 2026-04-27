// 聊天页面
window.Pages = window.Pages || {};

window.Pages.chat = function(container) {
  const { create, clear } = window.DOM;
  const sessionManager = window.SessionManager;
  const chatContext = window.ChatContext;
  const mediaUtils = window.MediaUtils;
  const modelManager = window.ModelManager;
  const toolManager = window.ToolManager; // TODO: 预留 - 内置工具管理器
  const messageRegistry = window.MessageTypes?.MessageHandlerRegistry; // TODO: 预留 - 多模态消息处理器注册表
  
  let messageListElement = null;
  let lastMessageElement = null;
  let pendingImages = []; // 待发送的图片
  let currentSettings = null; // 当前设置
    
  // 流式交互状态管理（模块级别，供递归调用访问）
  let sendBtn = window._chatSendBtn || null;
  let isStreaming = false;
  let currentPort = null;
  let isStopRequested = false; // 全局停止标志
    
  // 切换发送/停止按钮状态
  const updateSendButton = (streaming) => {
    isStreaming = streaming;
    // 优先使用window._chatSendBtn，其次使用sendBtn变量
    const btn = window._chatSendBtn || sendBtn;
    if (!btn) {
      console.warn('[Chat] sendBtn not found, cannot update button state');
      return;
    }
      
    if (streaming) {
      btn.textContent = '停止';
      btn.className = 'btn btn-danger';
    } else {
      btn.textContent = '发送';
      btn.className = 'btn btn-primary';
    }
  };
    
  // 停止流式请求和代码执行
  const stopStreaming = () => {
    isStopRequested = true; // 设置停止标志
    
    if (currentPort) {
      currentPort.disconnect();
      currentPort = null;
    }
      
    // 通知 SessionManager 停止
    const currentSession = sessionManager.getCurrentSession();
    if (currentSession) {
      sessionManager.completeStreamRequest(currentSession.id);
      
      // 清理空消息：如果最后一条 assistant 消息为空，删除它
      const lastMsg = currentSession.messages[currentSession.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const hasContent = lastMsg.content && lastMsg.content.trim();
        const hasReasoning = lastMsg.additional_kwargs?.reasoning_content;
        const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
        
        if (!hasContent && !hasReasoning && !hasToolCalls) {
          // 空消息，删除
          currentSession.messages.pop();
          console.log('[Chat] Removed empty assistant message after stop');
          sessionManager.saveConversations();
        }
      }
    }
      
    updateSendButton(false);
    console.log('[Chat] Streaming stopped by user');
    
    // 重新渲染
    render();
  };
  
  function render() {
    clear(container);
    
    const session = sessionManager.getCurrentSession();
    const messages = session ? session.messages : [];
    const isLoading = session ? session.isLoading : false;
    
    console.log('[Chat] Render called, session:', session?.id, 'messages:', messages.length);
    
    // 检测 panel 切换后恢复：如果会话标记为 loading 但没有 port，说明是 panel 重新加载
    if (session && session.isLoading && !session.port) {
      console.log('[Chat] Detected interrupted stream, showing status...');
      // 添加一个系统消息提示用户
      const hasInterruptedNotice = messages.some(m => 
        m.role === 'system' && m.content?.includes('正在生成回复')
      );
      
      if (!hasInterruptedNotice) {
        const noticeMsg = {
          role: 'system',
          content: '⏳ 正在生成回复...（后台仍在运行）',
          isSystemNotice: true
        };
        session.messages.push(noticeMsg);
      }
    }
    
    const page = create('div', { 
      className: 'page', 
      style: { position: 'relative' }
    });
    
    // 添加工具执行加载动画样式
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
    
    // 拖拽上传支持
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
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      
      if (imageFiles.length === 0) return;
      
      for (const file of imageFiles) {
        try {
          mediaUtils.validateImage(file);
          const compressedBlob = await mediaUtils.compressImage(file);
          const dataUrl = await mediaUtils.fileToBase64(compressedBlob);
          const previewUrl = mediaUtils.createPreview(file);
          
          pendingImages.push({ dataUrl, previewUrl, filename: file.name });
        } catch (error) {
          window.Toast.error(`${file.name}: ${error.message}`);
        }
      }
      
      render();
    });
    
    // 浮动按钮（右上角）
    if (messages.length > 0) {
      page.appendChild(create('button', {
        className: 'btn btn-primary btn-float',
        text: '开始新聊天',
        onClick: async () => {
          // 保存当前对话
          await sessionManager.saveConversations();
          
          // 清除当前会话指针并创建新会话
          const newSessionId = await sessionManager.clearCurrentSession();
          
          render();
        }
      }));
    }
    
    // 消息列表
    messageListElement = create('div', { 
      className: 'page-content',
      style: { flex: 1, overflowY: 'auto', padding: '16px' }
    });
    
    if (messages.length === 0) {
      messageListElement.appendChild(create('div', { className: 'empty-state' }, [
        create('div', { className: 'empty-state-icon', text: '💬' }),
        create('div', { className: 'empty-state-title', text: '开始对话' }),
        create('div', { className: 'empty-state-desc', text: '输入消息开始聊天' })
      ]));
    } else {
      lastMessageElement = null;
      messages.forEach((msg, index) => {
        // 跳过系统通知消息（不渲染）
        if (msg.isSystemNotice) {
          return;
        }
        
        // 跳过tool消息（不渲染，只用于API）
        if (msg.role === 'tool') {
          return;
        }
        
        const bubble = create('div', {
          className: `message-bubble message-${msg.role}`,
          style: { 
            marginBottom: '12px',
            position: 'relative'
          }
        });
        
        // 所有消息添加删除按钮（hover 显示）
        const deleteBtn = create('button', {
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
              const session = sessionManager.getCurrentSession();
              if (session) {
                // 使用 SessionManager 的级联删除方法
                const deleted = sessionManager.deleteMessageWithTools(session.id, index);
                
                if (deleted) {
                  console.log(`[Chat] Deleted message at index ${index} with associated tool messages`);
                  await sessionManager.saveConversations();
                  render();
                  window.Toast.success('消息已删除');
                }
              }
            }
          }
        });
        
        // hover 显示删除按钮
        bubble.onmouseenter = () => deleteBtn.style.display = 'flex';
        bubble.onmouseleave = () => deleteBtn.style.display = 'none';
        
        bubble.appendChild(deleteBtn);
        
        // 渲染思考过程（如果存在）
        if (msg.role === 'assistant' && msg.additional_kwargs?.reasoning_content) {
          const renderer = new window.ThinkingMode.ThinkingRenderer();
          const thinkingBox = renderer.render(msg.additional_kwargs.reasoning_content);
          bubble.appendChild(thinkingBox);
        }
        
        // 显示工具调用卡片（如果有 tool_calls）
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          // 查找对应的 tool 消息
          const toolResults = [];
          for (let i = index + 1; i < messages.length; i++) {
            if (messages[i].role === 'tool') {
              const toolMsg = messages[i];
              const matchingCall = msg.tool_calls.find(tc => tc.id === toolMsg.tool_call_id);
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
              break; // 遇到非 tool 消息就停止
            }
          }
          
          // 渲染工具卡片
          msg.tool_calls.forEach((call, idx) => {
            const result = toolResults[idx];
            const card = window.ChatRender.renderToolCallCard(call, idx, result, session.isLoading);
            bubble.appendChild(card);
          });
        }
        
        // 渲染消息内容
        if (msg.content && msg.content.trim()) {
          window.ChatRender.renderMessageContent(msg.content, bubble);
        } else if (msg.role === 'assistant') {
          // 空 assistant 消息，创建空的 message-content 容器用于流式更新
          const emptyContent = create('div', { className: 'message-content' });
          bubble.appendChild(emptyContent);
        }
        
        messageListElement.appendChild(bubble);
        
        if (index === messages.length - 1) {
          lastMessageElement = bubble.querySelector('.message-content') || bubble;
          console.log('[Chat] Set lastMessageElement:', lastMessageElement?.className, lastMessageElement?.tagName);
        }
      });
      
      if (isLoading) {
        messageListElement.appendChild(create('div', { 
          className: 'message-bubble message-assistant loading-bubble',
          style: { marginBottom: '12px' }
        }, [
          create('div', { text: '思考中...' })
        ]));
      }
    }
    
    page.appendChild(messageListElement);
    
    // 如果检测到后台正在生成，显示状态提示条
    if (session && session.isLoading && !session.port) {
      const statusBanner = create('div', {
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
      
      const statusText = create('div', {
        text: '⏳ 后台正在生成回复...'
      });
      
      const cancelButton = create('button', {
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
          // 移除系统通知消息
          const noticeIndex = session.messages.findIndex(m => m.isSystemNotice);
          if (noticeIndex !== -1) {
            session.messages.splice(noticeIndex, 1);
          }
          
          // 标记会话为非加载状态
          session.isLoading = false;
          await sessionManager.saveConversations();
          render();
          window.Toast.info('已取消等待');
        }
      });
      
      statusBanner.appendChild(statusText);
      statusBanner.appendChild(cancelButton);
      page.insertBefore(statusBanner, messageListElement);
    }
    
    // 输入区
    const inputArea = create('div', { 
      className: 'page-footer',
      style: { padding: '12px' }
    });
    
    // 图片预览区
    if (pendingImages.length > 0) {
      const previewContainer = create('div', {
        className: 'image-preview-container',
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
      
      pendingImages.forEach((img, index) => {
        const previewBox = create('div', {
          style: { 
            position: 'relative', 
            display: 'inline-block',
            group: 'hover'
          }
        });
        
        const imgEl = create('img', {
          attrs: { src: img.previewUrl, title: img.filename },
          style: { 
            width: '80px', 
            height: '80px', 
            objectFit: 'cover',
            borderRadius: '6px',
            border: '2px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'border-color 0.2s'
          }
        });
        
        // 点击图片放大查看
        imgEl.onclick = () => window.open(img.dataUrl, '_blank');
        
        // hover 效果
        imgEl.onmouseenter = () => imgEl.style.borderColor = 'var(--color-primary)';
        imgEl.onmouseleave = () => imgEl.style.borderColor = 'var(--color-border)';
        
        const removeBtn = create('button', {
          text: '×',
          className: 'btn-remove-image',
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
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s'
          },
          onClick: () => {
            mediaUtils.revokePreview(img.previewUrl);
            pendingImages.splice(index, 1);
            render();
          }
        });
        
        removeBtn.onmouseenter = () => removeBtn.style.transform = 'scale(1.1)';
        removeBtn.onmouseleave = () => removeBtn.style.transform = 'scale(1)';
        
        previewBox.appendChild(imgEl);
        previewBox.appendChild(removeBtn);
        previewContainer.appendChild(previewBox);
      });
      
      inputArea.appendChild(previewContainer);
    }
    
    const inputRow = create('div', { 
      className: 'input-row',
      style: { display: 'flex', gap: '8px', alignItems: 'center' } 
    });
    
    // 工具开关按钮（收缩栏设计）
    const toolsWrapper = create('div', {
      className: 'tools-wrapper',
      style: {
        position: 'relative',
        display: 'inline-block'
      }
    });
    
    // 工具触发按钮
    const toolsTrigger = create('button', {
      className: 'tools-trigger-btn',
      text: '🛠️',
      style: {
        padding: '6px 8px',
        fontSize: '14px',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'all 0.2s'
      },
      title: '工具开关'
    });
    
    // 工具菜单
    const toolsMenu = create('div', {
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
    
    // 渲染工具开关
    if (toolManager) {
      toolManager.getAllTools().forEach(tool => {
        const toolItem = create('div', {
          className: 'tool-item',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }
        });
        
        const toolIcon = tool.id === 'web_search' ? '🔍' : '⚡';
        const iconSpan = create('span', {
          text: toolIcon,
          style: { fontSize: '16px' }
        });
        
        const labelSpan = create('span', {
          text: tool.name,
          style: { fontSize: '13px', flex: '1' }
        });
        
        const toggleBtn = create('div', {
          className: `toggle-switch ${tool.enabled ? 'active' : ''}`,
          style: {
            width: '32px',
            height: '18px',
            borderRadius: '9px',
            background: tool.enabled ? 'var(--color-primary)' : 'var(--color-border)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }
        });
        
        const toggleKnob = create('div', {
          style: {
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: '2px',
            left: tool.enabled ? '16px' : '2px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }
        });
        
        toggleBtn.appendChild(toggleKnob);
        toolItem.appendChild(iconSpan);
        toolItem.appendChild(labelSpan);
        toolItem.appendChild(toggleBtn);
        
        toolItem.onclick = async () => {
          const wasEnabled = tool.enabled;
          await toolManager.toggleTool(tool.id, !tool.enabled);
          // 更新开关样式
          toggleBtn.className = `toggle-switch ${tool.enabled ? 'active' : ''}`;
          toggleBtn.style.background = tool.enabled ? 'var(--color-primary)' : 'var(--color-border)';
          toggleKnob.style.left = tool.enabled ? '16px' : '2px';
          window.Toast.success(`${tool.name}已${wasEnabled ? '关闭' : '开启'}`);
        };
        
        toolItem.onmouseenter = () => {
          toolItem.style.background = 'var(--color-surface)';
        };
        toolItem.onmouseleave = () => {
          toolItem.style.background = 'transparent';
        };
        
        toolsMenu.appendChild(toolItem);
      });
    }
    
    // 鼠标悬停显示菜单
    toolsWrapper.onmouseenter = () => {
      toolsMenu.style.opacity = '1';
      toolsMenu.style.visibility = 'visible';
      toolsMenu.style.transform = 'translateY(0)';
      toolsTrigger.style.borderColor = 'var(--color-primary)';
    };
    
    toolsWrapper.onmouseleave = () => {
      toolsMenu.style.opacity = '0';
      toolsMenu.style.visibility = 'hidden';
      toolsMenu.style.transform = 'translateY(10px)';
      toolsTrigger.style.borderColor = 'var(--color-border)';
    };
    
    toolsWrapper.appendChild(toolsMenu);
    toolsWrapper.appendChild(toolsTrigger);
    inputRow.appendChild(toolsWrapper);
    
    // 图片上传按钮
    const supportsVision = currentSettings && modelManager.checkModelVisionSupport(currentSettings.model);
    const uploadBtn = create('button', {
      className: 'btn btn-secondary',
      text: '📷',
      style: { 
        padding: '8px 12px', 
        fontSize: '16px',
        opacity: supportsVision ? 1 : 0.5,
        cursor: supportsVision ? 'pointer' : 'not-allowed'
      },
      title: supportsVision ? '上传图片（支持拖拽和粘贴）' : '当前模型不支持图片',
      disabled: !supportsVision
    });
    
    const fileInput = create('input', {
      attrs: { type: 'file', accept: 'image/*', multiple: true },
      style: { display: 'none' },
      onChange: async (e) => {
        const files = Array.from(e.target.files);
        
        for (const file of files) {
          try {
            mediaUtils.validateImage(file);
            
            // 压缩图片
            const compressedBlob = await mediaUtils.compressImage(file);
            const dataUrl = await mediaUtils.fileToBase64(compressedBlob);
            const previewUrl = mediaUtils.createPreview(file);
            
            pendingImages.push({ dataUrl, previewUrl, filename: file.name });
            render();
          } catch (error) {
            window.Toast.error(error.message);
          }
        }
        
        // 清空 file input
        e.target.value = '';
      }
    });
    
    uploadBtn.onclick = () => {
      if (!supportsVision) {
        window.Toast.warning('当前模型不支持图片，请在设置中切换到支持视觉的模型');
        return;
      }
      fileInput.click();
    };
    
    const input = create('input', {
      className: 'input',
      attrs: { 
        type: 'text', 
        placeholder: currentSettings && modelManager.checkModelVisionSupport(currentSettings.model)
          ? '输入消息或拖拽/粘贴图片...' 
          : '输入消息...'
      },
      style: { flex: 1 }
    });
    
    // 粘贴图片支持
    input.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          
          try {
            mediaUtils.validateImage(file);
            const compressedBlob = await mediaUtils.compressImage(file);
            const dataUrl = await mediaUtils.fileToBase64(compressedBlob);
            const previewUrl = mediaUtils.createPreview(file);
            
            pendingImages.push({ dataUrl, previewUrl, filename: 'pasted-image.png' });
            render();
          } catch (error) {
            window.Toast.error(error.message);
          }
          break;
        }
      }
    });
    
    input.addEventListener('keydown', async (e) => {
      // Ctrl + ArrowUp/ArrowDown 导航用户消息
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        const session = sessionManager.getCurrentSession();
        if (!session || session.messages.length === 0) return;
        
        // 找到所有用户消息的索引
        const userMessageIndices = [];
        session.messages.forEach((msg, idx) => {
          if (msg.role === 'user') {
            userMessageIndices.push(idx);
          }
        });
        
        if (userMessageIndices.length === 0) return;
        
        // 找到当前可见的消息位置（最后一条消息）
        let currentIndex = -1;
        if (messageListElement) {
          const bubbles = messageListElement.querySelectorAll('.message-bubble');
          const scrollTop = messageListElement.scrollTop;
          const containerHeight = messageListElement.clientHeight;
          
          // 找到最接近视口顶部的消息
          for (let i = bubbles.length - 1; i >= 0; i--) {
            const bubble = bubbles[i];
            const rect = bubble.getBoundingClientRect();
            const containerRect = messageListElement.getBoundingClientRect();
            
            if (rect.top >= containerRect.top && rect.top < containerRect.top + containerHeight / 2) {
              currentIndex = i;
              break;
            }
          }
        }
        
        // 确定目标索引
        let targetIndex;
        if (e.key === 'ArrowUp') {
          // 向上导航：找到当前索引之前的上一个用户消息
          targetIndex = userMessageIndices.reverse().find(idx => idx < currentIndex) ?? userMessageIndices[userMessageIndices.length - 1];
        } else {
          // 向下导航：找到当前索引之后的下一个用户消息
          targetIndex = userMessageIndices.find(idx => idx > currentIndex) ?? userMessageIndices[0];
        }
        
        // 滚动到目标消息
        if (targetIndex !== undefined && messageListElement) {
          const bubbles = messageListElement.querySelectorAll('.message-bubble');
          if (bubbles[targetIndex]) {
            bubbles[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        
        return;
      }
      
      if (e.key === 'Enter' && !isLoading) {
        const text = input.value.trim();
        
        // 严格验证：文本和图片至少有一个
        if (!text && pendingImages.length === 0) {
          console.warn('[Chat] Empty message blocked');
          return;
        }
        
        // 如果只有文本，再次验证不为空
        if (text && text.length === 0) {
          console.warn('[Chat] Empty text blocked');
          return;
        }
        
        // 如果没有当前会话，创建新会话
        if (!sessionManager.currentSessionId) {
          sessionManager.currentSessionId = 'conv_' + Date.now();
          sessionManager.createSession(sessionManager.currentSessionId, []);
          sessionManager.setCurrentSession(sessionManager.currentSessionId);
        }
        
        const session = sessionManager.getCurrentSession();
        if (!session) return;
        
        // 构建多模态消息
        let userMessage;
        if (pendingImages.length > 0 && text) {
          // 文本 + 图片
          userMessage = {
            role: 'user',
            content: [
              { type: 'text', text },
              ...pendingImages.map(img => ({
                type: 'image_url',
                image_url: { url: img.dataUrl }
              }))
            ]
          };
        } else if (pendingImages.length > 0) {
          // 仅图片
          userMessage = {
            role: 'user',
            content: pendingImages.map(img => ({
              type: 'image_url',
              image_url: { url: img.dataUrl }
            }))
          };
        } else {
          // 仅文本
          userMessage = { role: 'user', content: text };
        }
        
        // 打印发送的完整消息内容
        console.log('[Chat] ===== 发送消息 =====');
        console.log('[Chat] 消息类型:', pendingImages.length > 0 ? (text ? '文本+图片' : '仅图片') : '纯文本');
        if (text) {
          console.log('[Chat] 文本内容:', text);
        }
        if (pendingImages.length > 0) {
          console.log('[Chat] 图片数量:', pendingImages.length);
          pendingImages.forEach((img, idx) => {
            console.log(`[Chat] 图片${idx + 1}:`, img.name || '未命名', img.dataUrl?.substring(0, 50) + '...');
          });
        }
        console.log('[Chat] ====================');
        
        // 刷新工具缓存时间戳
        if (toolManager) {
          await toolManager.refreshCacheTimestamp();
        }
        
        // 添加用户消息
        sessionManager.addMessage(session.id, userMessage);
        await sessionManager.saveConversations();
        
        // 清空输入和图片
        input.value = '';
        pendingImages.forEach(img => mediaUtils.revokePreview(img.previewUrl));
        pendingImages = [];
        
        render();
        
        // 调用 AI（流式）
        try {
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(['settings'], resolve);
          });
          
          const settings = result.settings;
          if (!settings || !settings.apiEndpoint) {
            throw new Error('请先在设置中配置 API 端点');
          }
          
          let apiEndpoint = settings.apiEndpoint;
          if (!apiEndpoint.includes('/chat/completions')) {
            apiEndpoint = apiEndpoint.replace(/\/$/, '') + '/chat/completions';
          }
          
          let chatMessages = [...session.messages];
          
          // 清理消息：移除内部使用的字段，只保留 API 需要的格式
          chatMessages = chatMessages.map(msg => {
            const cleanMsg = {
              role: msg.role,
              content: msg.content
            };
            
            // 只保留 API 标准字段，移除内部字段
            // 注意：不发送 tool_calls 和 tool_results，因为它们不是标准格式
            if (msg.additional_kwargs) {
              cleanMsg.additional_kwargs = msg.additional_kwargs;
            }
            
            return cleanMsg;
          });
          
          // 添加工具系统提示
          if (toolManager) {
            const toolPrompt = toolManager.generateSystemPrompt();
            if (toolPrompt) {
              // 在用户自定义 system prompt 之前添加工具提示
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
            // 没有自定义 system prompt，也添加时间信息
            const currentTime = window.TimeUtils.getCurrentTimeString();
            chatMessages = [
              { role: 'system', content: `当前时间: ${currentTime}` },
              ...chatMessages
            ];
          }
          
          // 验证消息列表不为空
          if (chatMessages.length === 0) {
            throw new Error('消息列表为空，无法发送请求');
          }
          
          console.log('[Chat] Sending messages:', chatMessages.length, 'messages');
          
          // 智能截断消息以适应上下文窗口（如果启用）
          if (settings.autoContextTruncation !== false) {
            const beforeTruncate = chatMessages.length;
            chatMessages = chatContext.truncateMessages(
              chatMessages,
              settings.model,
              settings.maxTokens || 2000
            );
            
            // 记录上下文使用情况
            const usage = chatContext.getContextUsage(chatMessages, settings.model);
            console.log(`[Chat] Context usage: ${usage.used}/${usage.total} (${usage.percentage}%)`);
            
            // 如果有消息被截断，给用户提示
            if (chatMessages.length < beforeTruncate) {
              console.log(`[Chat] Auto-truncated: ${beforeTruncate} -> ${chatMessages.length} messages`);
            }
          } else {
            console.log('[Chat] Auto context truncation is disabled');
          }
          
          // 添加助手消息占位
          sessionManager.addMessage(session.id, { role: 'assistant', content: '' });
          render();
          
          if (messageListElement) {
            setTimeout(() => {
              messageListElement.scrollTop = messageListElement.scrollHeight;
            }, 50);
          }
          
          // 发送消息到 background（真正的流式请求）
          const port = chrome.runtime.connect({ name: 'chat-stream' });
          currentPort = port;
          
          // 绑定到会话
          sessionManager.startStreamRequest(session.id, port);
          isStopRequested = false; // 重置停止标志
          updateSendButton(true);
          
          // 打印流式请求完整日志
          console.log('[Chat] ===== 流式请求开始 =====');
          console.log('[Chat] 会话ID:', session.id);
          console.log('[Chat] 模型:', settings.model);
          console.log('[Chat] 消息数量:', chatMessages.length);
          console.log('[Chat] 消息列表:');
          chatMessages.forEach((msg, idx) => {
            console.log(`  [${idx}] role=${msg.role}, content_length=${msg.content?.length || 0}`);
            if (msg.content && msg.content.length < 200) {
              console.log(`      content: ${msg.content}`);
            } else if (msg.content) {
              console.log(`      content: ${msg.content.substring(0, 200)}...`);
            }
          });
          console.log('[Chat] 温度:', settings.temperature || 0.7);
          console.log('[Chat] 最大Token:', settings.maxTokens || 2000);
          console.log('[Chat] ==========================');
          
          // 检查工具是否启用
          const enabledTools = toolManager && toolManager.getEnabledTools ? toolManager.getEnabledTools() : [];
          const toolsEnabled = enabledTools.length > 0;
          console.log('[Chat] 启用的工具:', enabledTools.map(t => t.id));
          console.log('[Chat] 工具启用状态:', toolsEnabled);
          
          // 监听流式响应
          port.onMessage.addListener(async (msg) => {
            // 检查是否请求停止
            if (isStopRequested) {
              port.disconnect();
              currentPort = null;
              sessionManager.completeStreamRequest(session.id);
              
              // 清理空消息
              const targetSession = sessionManager.getSession(session.id);
              if (targetSession) {
                const lastMsg = targetSession.messages[targetSession.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  const hasContent = lastMsg.content && lastMsg.content.trim();
                  const hasReasoning = lastMsg.additional_kwargs?.reasoning_content;
                  const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
                  
                  if (!hasContent && !hasReasoning && !hasToolCalls) {
                    targetSession.messages.pop();
                    console.log('[Chat] Removed empty assistant message in stream listener');
                    sessionManager.saveConversations();
                  }
                }
              }
              
              updateSendButton(false);
              render();
              console.log('[Chat] Stream interrupted by stop request');
              return;
            }
            
            // 检查会话是否还存在
            const targetSession = sessionManager.getSession(session.id);
            if (!targetSession) {
              port.disconnect();
              return;
            }
            
            if (msg.type === 'chunk') {
              const currentMsg = targetSession.messages[targetSession.messages.length - 1];
              if (currentMsg && currentMsg.role === 'assistant') {
                currentMsg.content += msg.content;
              }
              
              // 只在当前会话时更新 UI
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id) {
                // 查找或创建 message-content 容器
                let contentContainer = null;
                if (lastMessageElement) {
                  // 如果 lastMessageElement 已经有 .message-content，直接使用
                  contentContainer = lastMessageElement.classList.contains('message-content') 
                    ? lastMessageElement 
                    : lastMessageElement.querySelector('.message-content');
                }
                
                if (!contentContainer && lastMessageElement) {
                  // 如果 lastMessageElement 是 bubble 但没有 .message-content，创建一个
                  contentContainer = document.createElement('div');
                  contentContainer.className = 'message-content';
                  lastMessageElement.appendChild(contentContainer);
                }
                
                if (contentContainer && currentMsg) {
                  contentContainer.innerHTML = window.renderMarkdown(currentMsg.content);
                } else {
                  // 回退：重新渲染整个列表
                  console.warn('[Chat] contentContainer is null, re-rendering...');
                  render();
                }
                
                if (messageListElement) {
                  messageListElement.scrollTop = messageListElement.scrollHeight;
                }
              }
              
              // 异步保存（不阻塞 UI）
              sessionManager.saveConversations();
            } else if (msg.type === 'reasoning' || msg.type === 'thinking') {
              // 处理思考过程
              const currentMsg = targetSession.messages[targetSession.messages.length - 1];
              if (currentMsg && currentMsg.role === 'assistant') {
                // 将思考内容添加到 additional_kwargs
                if (!currentMsg.additional_kwargs) {
                  currentMsg.additional_kwargs = {};
                }
                currentMsg.additional_kwargs.reasoning_content = 
                  (currentMsg.additional_kwargs.reasoning_content || '') + (msg.reasoning_content || msg.content || '');
              }
              
              // 实时更新思考内容显示
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id && lastMessageElement) {
                let thinkingBox = lastMessageElement.parentNode.querySelector('.thinking-container');
                
                if (!thinkingBox) {
                  // 首次创建，使用 ThinkingRenderer
                  const renderer = new window.ThinkingMode.ThinkingRenderer();
                  thinkingBox = renderer.render(currentMsg.additional_kwargs.reasoning_content || '');
                  lastMessageElement.parentNode.insertBefore(thinkingBox, lastMessageElement);
                } else {
                  // 更新已有内容
                  const renderer = new window.ThinkingMode.ThinkingRenderer();
                  renderer.update(thinkingBox, msg.reasoning_content || msg.content || '');
                  
                  // 自动滚动到思考内容底部
                  const contentEl = thinkingBox.querySelector('.thinking-content');
                  if (contentEl) {
                    contentEl.scrollTop = contentEl.scrollHeight;
                  }
                }
              }
              
              sessionManager.saveConversations();
            } else if (msg.type === 'tool_call') {
              // TODO: 预留接口 - 流式工具调用处理
              // 处理工具调用
              const currentMsg = targetSession.messages[targetSession.messages.length - 1];
              if (currentMsg && currentMsg.role === 'assistant') {
                if (!currentMsg.tool_calls) {
                  currentMsg.tool_calls = [];
                }
                currentMsg.tool_calls.push(...(msg.tool_calls || []));
              }
              
              // 显示工具调用状态
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id && lastMessageElement) {
                // 检查是否已存在工具调用指示器
                const existingIndicator = lastMessageElement.parentNode.querySelector('.tool-call-indicator');
                if (!existingIndicator) {
                  const toolIndicator = create('div', {
                    className: 'tool-call-indicator',
                    style: { 
                      fontSize: '12px', 
                      color: 'var(--color-primary)',
                      marginBottom: '8px'
                    },
                    text: '🔧 调用工具...'
                  });
                  lastMessageElement.parentNode.insertBefore(toolIndicator, lastMessageElement);
                }
              }
              
              sessionManager.saveConversations();
            } else if (msg.type === 'complete') {
              port.disconnect();
              currentPort = null;
              sessionManager.completeStreamRequest(session.id);
              updateSendButton(false);
              
              // 清理空消息：如果最后一条 assistant 消息为空，删除它
              const finalMsg = targetSession.messages[targetSession.messages.length - 1];
              if (finalMsg && finalMsg.role === 'assistant') {
                const hasContent = finalMsg.content && finalMsg.content.trim();
                const hasReasoning = finalMsg.additional_kwargs?.reasoning_content;
                const hasToolCalls = finalMsg.tool_calls && finalMsg.tool_calls.length > 0;
                
                if (!hasContent && !hasReasoning && !hasToolCalls) {
                  // 空消息，删除
                  targetSession.messages.pop();
                  console.log('[Chat] Removed empty assistant message after completion');
                  sessionManager.saveConversations();
                  render();
                  return; // 空消息不需要后续处理
                }
              }
              
              // 打印完整消息内容
              console.log('[Chat] ===== 流式交互完成 =====');
              console.log('[Chat] 消息角色:', finalMsg?.role);
              console.log('[Chat] 消息内容:', finalMsg?.content);
              console.log('[Chat] 思考过程:', finalMsg?.additional_kwargs?.reasoning_content);
              console.log('[Chat] 工具调用:', finalMsg?.tool_calls);
              console.log('[Chat] 消息长度:', finalMsg?.content?.length);
              console.log('[Chat] ==========================');
              
              console.log(`[Chat] Stream request completed: session=${session.id}`);
              
              // 保存当前消息元素引用
              const completedMessageElement = lastMessageElement;
              
              // 使用 setTimeout 延迟执行工具，确保流式渲染完全结束
              setTimeout(async () => {
                // 处理工具调用
                const currentMsg = targetSession.messages[targetSession.messages.length - 1];
                if (currentMsg && currentMsg.role === 'assistant' && currentMsg.content) {
                  // 解析工具调用
                  const toolCalls = toolManager ? toolManager.parseToolCalls(currentMsg.content) : [];
                  
                  if (toolCalls.length > 0) {
                    console.log(`[Chat] Detected ${toolCalls.length} tool calls, executing...`);
                    
                    // 更新 assistant 消息，添加标准的 tool_calls 字段
                    currentMsg.tool_calls = toolCalls.map((call, idx) => ({
                      id: call.id || `call_${Date.now()}_${idx}`,
                      type: 'function',
                      function: {
                        name: call.function?.name || call.type,
                        arguments: call.function?.arguments || JSON.stringify(call.query || call.code || {})
                      }
                    }));
                    
                    await sessionManager.saveConversations();
                    render();
                    
                    // 依次执行工具
                    for (const call of currentMsg.tool_calls) {
                      // 检查是否请求停止
                      if (isStopRequested) {
                        console.log('[Chat] Tool execution interrupted by stop request');
                        break;
                      }
                      
                      const toolType = call.function.name;
                      
                      if (toolManager && toolManager.isToolEnabled(toolType)) {
                        try {
                          console.log(`[Chat] Executing tool: ${toolType}`);
                          
                          // 显示工具执行中状态
                          const currentSession = sessionManager.getCurrentSession();
                          if (currentSession && currentSession.id === session.id) {
                            render(); // 重新渲染以显示 loading 状态
                          }
                          
                          const result = await toolManager.executeTool({
                            ...call,
                            type: toolType // 兼容旧格式
                          });
                          
                          // 执行完成后检查是否请求停止
                          if (isStopRequested) {
                            console.log('[Chat] Tool execution stopped after completion');
                            break;
                          }
                          
                          // 创建标准的 tool 消息
                          const toolMessage = {
                            role: 'tool',
                            tool_call_id: call.id,
                            name: toolType,
                            content: result.output || JSON.stringify(result)
                          };
                          
                          // 添加到会话历史
                          sessionManager.addMessage(session.id, toolMessage);
                          await sessionManager.saveConversations();
                          
                          console.log(`[Chat] Tool ${toolType} executed successfully`);
                        } catch (error) {
                          console.error(`[Chat] Tool execution error:`, error);
                          
                          // 错误也作为 tool 消息保存
                          const errorMessage = {
                            role: 'tool',
                            tool_call_id: call.id,
                            name: toolType,
                            content: JSON.stringify({ 
                              success: false, 
                              error: error.message,
                              type: toolType
                            })
                          };
                          
                          sessionManager.addMessage(session.id, errorMessage);
                          await sessionManager.saveConversations();
                        }
                      }
                    }
                    
                    // 清理 assistant 消息 content 中的工具调用代码块
                    if (toolManager) {
                      currentMsg.content = toolManager.removeToolCallBlocks(currentMsg.content);
                    }
                    
                    await sessionManager.saveConversations();
                    
                    // 重新渲染
                    const afterToolSession = sessionManager.getCurrentSession();
                    if (afterToolSession && afterToolSession.id === session.id) {
                      render();
                      
                      if (messageListElement) {
                        messageListElement.scrollTop = messageListElement.scrollHeight;
                      }
                    }
                    
                    // 触发下一轮对话（递归）
                    await triggerNextTurn(session, targetSession, 0);
                    
                    return; // 提前返回，不执行后续的 render
                  }
                }
              }, 100);
              
              return; // 等待 setTimeout 中的逻辑执行
            } else if (msg.type === 'error') {
              port.disconnect();
              currentPort = null;
              sessionManager.completeStreamRequest(session.id);
              updateSendButton(false);
              
              // 添加错误消息到会话
              const errorMessage = {
                role: 'assistant',
                content: '❌ 请求失败: ' + msg.error,
                isError: true
              };
              sessionManager.addMessage(session.id, errorMessage);
              
              // 保存到 storage
              await sessionManager.saveConversations();
              
              // 只在当前会话时重新渲染
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id) {
                render();
                
                if (messageListElement) {
                  messageListElement.scrollTop = messageListElement.scrollHeight;
                }
              }
              
              return; // 错误处理后直接返回
            }
          });
          
          port.postMessage({
            messages: chatMessages,
            apiKey: settings.apiKey,
            apiEndpoint,
            model: settings.model,
            temperature: settings.temperature || 0.7,
            maxTokens: settings.maxTokens || 2000,
            toolsEnabled: toolsEnabled  // 传递工具启用状态
          });
          
          console.log(`[Chat] Chat request started: session=${session.id}, model=${settings.model}, messages=${chatMessages.length}, toolsEnabled=${toolsEnabled}`);
        } catch (error) {
          console.error('[Chat] Connection error:', error);
          
          // 添加错误消息
          sessionManager.addMessage(session.id, {
            role: 'assistant',
            content: '❌ 连接失败: ' + error.message,
            isError: true
          });
          
          // 保存到 storage
          await sessionManager.saveConversations();
          
          render();
          
          if (messageListElement) {
            messageListElement.scrollTop = messageListElement.scrollHeight;
          }
        }
      }
    });
    
    const newSendBtn = create('button', {
      className: 'btn btn-primary',
      text: '发送',
      id: 'send-button'
    });
    
    // 更新模块级别的sendBtn引用
    sendBtn = newSendBtn;
    window._chatSendBtn = newSendBtn;
    
    // 监听 ESC 键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isStreaming) {
        stopStreaming();
      }
    });
    
    newSendBtn.addEventListener('click', () => {
      if (isStreaming) {
        // 停止流式交互
        stopStreaming();
      } else {
        // 发送消息
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }
    });
    
    inputRow.appendChild(uploadBtn);
    inputRow.appendChild(fileInput);
    inputRow.appendChild(input);
    inputRow.appendChild(newSendBtn);
    inputArea.appendChild(inputRow);
    
    page.appendChild(inputArea);
    container.appendChild(page);
    
    // 渲染后滚动到底部（切换到会话时）
    if (messageListElement && messages.length > 0) {
      setTimeout(() => {
        messageListElement.scrollTop = messageListElement.scrollHeight;
      }, 50);
    }
  }
  
  /**
   * 触发下一轮对话（工具执行后）
   * @param {Object} session - 当前会话
   * @param {Object} targetSession - 目标会话
   * @param {number} depth - 递归深度
   */
  async function triggerNextTurn(session, targetSession, depth) {
    const MAX_DEPTH = 10;
    
    // 检查是否请求停止
    if (isStopRequested) {
      console.log('[Chat] Next turn interrupted by stop request');
      return;
    }
    
    if (depth >= MAX_DEPTH) {
      console.log('[Chat] Max recursion depth reached, stopping');
      return;
    }
    
    console.log(`[Chat] Triggering next turn, depth: ${depth}`);
    
    // 获取设置
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['settings'], resolve);
    });
    
    const settings = result.settings;
    if (!settings || !settings.apiEndpoint) {
      throw new Error('请先在设置中配置 API 端点');
    }
    
    let apiEndpoint = settings.apiEndpoint;
    if (!apiEndpoint.includes('/chat/completions')) {
      apiEndpoint = apiEndpoint.replace(/\/$/, '') + '/chat/completions';
    }
    
    // 准备消息（使用标准的 tool 角色）
    let chatMessages = [...targetSession.messages];
    
    // 清理消息，转换为 OpenAI API 标准格式
    chatMessages = chatMessages.map(msg => {
      const cleanMsg = { role: msg.role };
      
      if (msg.role === 'assistant') {
        cleanMsg.content = msg.content || '';
        // 保留 tool_calls
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
    if (toolManager) {
      const toolPrompt = toolManager.generateSystemPrompt();
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
      chatMessages = chatContext.truncateMessages(
        chatMessages,
        settings.model,
        settings.maxTokens || 2000
      );
    }
    
    console.log('[Chat] ===== Sending messages to model =====');
    console.log('[Chat] Depth:', depth);
    console.log('[Chat] Messages count:', chatMessages.length);
    console.log('[Chat] Last 3 messages:');
    chatMessages.slice(-3).forEach((msg, idx) => {
      const actualIdx = chatMessages.length - 3 + idx;
      console.log(`  [${actualIdx}] role=${msg.role}, length=${msg.content?.length || 0}`);
    });
    console.log('[Chat] ==========================================');
    
    // 添加助手消息占位
    sessionManager.addMessage(session.id, { role: 'assistant', content: '' });
    render();
    
    if (messageListElement) {
      setTimeout(() => {
        messageListElement.scrollTop = messageListElement.scrollHeight;
      }, 50);
    }
    
    // 发送流式请求
    if (isStopRequested) {
      console.log('[Chat] Request interrupted by stop request');
      return;
    }
    
    const port = chrome.runtime.connect({ name: 'chat-stream' });
    currentPort = port;
    sessionManager.startStreamRequest(session.id, port);
    updateSendButton(true);
    
    // 监听响应
    port.onMessage.addListener(async (responseMsg) => {
      // 检查是否请求停止
      if (isStopRequested) {
        port.disconnect();
        currentPort = null;
        sessionManager.completeStreamRequest(session.id);
        
        // 清理空消息
        const currentSession = sessionManager.getSession(session.id);
        if (currentSession) {
          const lastMsg = currentSession.messages[currentSession.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const hasContent = lastMsg.content && lastMsg.content.trim();
            const hasReasoning = lastMsg.additional_kwargs?.reasoning_content;
            const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
            
            if (!hasContent && !hasReasoning && !hasToolCalls) {
              currentSession.messages.pop();
              console.log('[Chat] Removed empty message after stop');
              sessionManager.saveConversations();
            }
          }
        }
        
        updateSendButton(false);
        render();
        console.log('[Chat] Stream interrupted by stop request');
        return;
      }
      
      const currentSession = sessionManager.getSession(session.id);
      if (!currentSession) {
        port.disconnect();
        return;
      }
      
      if (responseMsg.type === 'chunk') {
        const currentMsg = currentSession.messages[currentSession.messages.length - 1];
        if (currentMsg && currentMsg.role === 'assistant') {
          currentMsg.content += responseMsg.content;
        }
        
        const activeSession = sessionManager.getCurrentSession();
        if (activeSession && activeSession.id === session.id) {
          render();
          if (messageListElement) {
            messageListElement.scrollTop = messageListElement.scrollHeight;
          }
        }
        
        sessionManager.saveConversations();
      } else if (responseMsg.type === 'reasoning' || responseMsg.type === 'thinking') {
        const currentMsg = currentSession.messages[currentSession.messages.length - 1];
        if (currentMsg && currentMsg.role === 'assistant') {
          if (!currentMsg.additional_kwargs) {
            currentMsg.additional_kwargs = {};
          }
          currentMsg.additional_kwargs.reasoning_content = 
            (currentMsg.additional_kwargs.reasoning_content || '') + (responseMsg.reasoning_content || responseMsg.content || '');
        }
        sessionManager.saveConversations();
      } else if (responseMsg.type === 'complete') {
        port.disconnect();
        currentPort = null;
        sessionManager.completeStreamRequest(session.id);
        updateSendButton(false);
        
        // 清理空消息
        const finalMsg = currentSession.messages[currentSession.messages.length - 1];
        if (finalMsg && finalMsg.role === 'assistant') {
          const hasContent = finalMsg.content && finalMsg.content.trim();
          const hasReasoning = finalMsg.additional_kwargs?.reasoning_content;
          const hasToolCalls = finalMsg.tool_calls && finalMsg.tool_calls.length > 0;
          
          if (!hasContent && !hasReasoning && !hasToolCalls) {
            currentSession.messages.pop();
            console.log('[Chat] Removed empty message after completion');
            await sessionManager.saveConversations();
            render();
            return;
          }
        }
        
        await sessionManager.saveConversations();
        
        console.log('[Chat] ===== Turn completed =====');
        console.log('[Chat] Role:', finalMsg?.role);
        console.log('[Chat] Content:', finalMsg?.content);
        console.log('[Chat] Reasoning:', finalMsg?.additional_kwargs?.reasoning_content);
        console.log('[Chat] Tool calls:', finalMsg?.tool_calls);
        console.log('[Chat] ==========================');
        
        const activeSession = sessionManager.getCurrentSession();
        if (activeSession && activeSession.id === session.id) {
          render();
          if (messageListElement) {
            messageListElement.scrollTop = messageListElement.scrollHeight;
          }
          
          // 检查新消息是否包含工具调用，如果有则递归
          if (isStopRequested) {
            console.log('[Chat] Recursive check interrupted');
            return;
          }
          
          if (finalMsg && finalMsg.role === 'assistant' && finalMsg.content && toolManager) {
            const newToolCalls = toolManager.parseToolCalls(finalMsg.content);
            
            if (newToolCalls.length > 0) {
              console.log(`[Chat] Detected ${newToolCalls.length} new tool calls, continuing...`);
              
              // 更新 assistant 消息的 tool_calls
              finalMsg.tool_calls = newToolCalls.map((call, idx) => ({
                id: call.id || `call_${Date.now()}_${idx}`,
                type: 'function',
                function: {
                  name: call.function?.name || call.type,
                  arguments: call.function?.arguments || JSON.stringify(call.query || call.code || {})
                }
              }));
              
              await sessionManager.saveConversations();
              render();
              
              // 执行工具
              for (const call of finalMsg.tool_calls) {
                if (isStopRequested) break;
                
                const toolType = call.function.name;
                
                if (toolManager && toolManager.isToolEnabled(toolType)) {
                  try {
                    console.log(`[Chat] Executing tool: ${toolType}`);
                    render();
                    
                    const result = await toolManager.executeTool({
                      ...call,
                      type: toolType
                    });
                    
                    if (isStopRequested) break;
                    
                    // 创建 tool 消息
                    const toolMessage = {
                      role: 'tool',
                      tool_call_id: call.id,
                      name: toolType,
                      content: result.output || JSON.stringify(result)
                    };
                    
                    sessionManager.addMessage(session.id, toolMessage);
                    await sessionManager.saveConversations();
                    
                    console.log(`[Chat] Tool ${toolType} executed`);
                  } catch (error) {
                    console.error(`[Chat] Tool error:`, error);
                    
                    const errorMessage = {
                      role: 'tool',
                      tool_call_id: call.id,
                      name: toolType,
                      content: JSON.stringify({ success: false, error: error.message })
                    };
                    
                    sessionManager.addMessage(session.id, errorMessage);
                    await sessionManager.saveConversations();
                  }
                }
              }
              
              // 清理 content
              if (toolManager) {
                finalMsg.content = toolManager.removeToolCallBlocks(finalMsg.content);
              }
              
              await sessionManager.saveConversations();
              render();
              
              // 递归调用
              await triggerNextTurn(session, currentSession, depth + 1);
              return;
            }
          }
        }
      } else if (responseMsg.type === 'error') {
        port.disconnect();
        currentPort = null;
        sessionManager.completeStreamRequest(session.id);
        updateSendButton(false);
        
        const errorMsg = {
          role: 'assistant',
          content: '❌ 请求失败: ' + responseMsg.error,
          isError: true
        };
        sessionManager.addMessage(session.id, errorMsg);
        await sessionManager.saveConversations();
        
        const activeSession = sessionManager.getCurrentSession();
        if (activeSession && activeSession.id === session.id) {
          render();
          if (messageListElement) {
            messageListElement.scrollTop = messageListElement.scrollHeight;
          }
        }
        
        return; // 错误处理后直接返回，阻止继续执行
      }
    });
    
    port.postMessage({
      messages: chatMessages,
      apiKey: settings.apiKey,
      apiEndpoint,
      model: settings.model,
      temperature: settings.temperature || 0.7,
      maxTokens: settings.maxTokens || 2000,
      toolsEnabled: true  // 递归调用时始终启用工具支持
    });
    
    console.log('[Chat] Next turn request sent');
  }
  
  // 初始化
  sessionManager.loadMessages().then((data) => {
    console.log('[Chat] Messages loaded, currentConversationId:', data.currentConversationId);
    render();
  });
};
