// 聊天页面
window.Pages = window.Pages || {};

window.Pages.chat = function(container) {
  const { create, clear } = window.DOM;
  const sessionManager = window.SessionManager;
  const contextManager = window.ContextManager;
  const mediaUtils = window.MediaUtils;
  const modelManager = window.ModelManager;
  
  let currentConversationId = null;
  let conversations = [];
  let messageListElement = null;
  let lastMessageElement = null;
  let pendingImages = []; // 待发送的图片
  let currentSettings = null; // 当前设置
  
  // 从 storage 加载消息
  async function loadMessages() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['chatMessages', 'currentConversationId', 'conversations', 'settings'], resolve);
    });
    
    conversations = result.conversations || [];
    currentConversationId = result.currentConversationId;
    currentSettings = result.settings || {};
    
    // 检查当前对话是否过期（超过1小时）
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        if (conv.updatedAt < oneHourAgo) {
          currentConversationId = null;
          await chrome.storage.local.set({ currentConversationId: null });
        }
      } else {
        currentConversationId = null;
        await chrome.storage.local.set({ currentConversationId: null });
      }
    }
    
    // 加载当前会话到 SessionManager
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        sessionManager.createSession(currentConversationId, conv.messages);
      }
    }
    
    sessionManager.setCurrentSession(currentConversationId);
  }
  
  // 保存到 storage
  async function saveToStorage() {
    const session = sessionManager.getCurrentSession();
    if (!session) return;
    
    const messages = session.messages;
    
    // 保存当前会话消息
    await chrome.storage.local.set({ chatMessages: messages });
    
    if (messages.length === 0) return;
    
    // 如果没有 currentConversationId，创建新会话
    if (!currentConversationId) {
      currentConversationId = 'conv_' + Date.now();
      sessionManager.setCurrentSession(currentConversationId);
      sessionManager.createSession(currentConversationId, messages);
    }
    
    // 更新 conversations 中的会话
    const convIndex = conversations.findIndex(c => c.id === currentConversationId);
    
    if (convIndex >= 0) {
      conversations[convIndex].messages = [...messages];
      conversations[convIndex].updatedAt = Date.now();
    } else {
      conversations.push({
        id: currentConversationId,
        messages: [...messages],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    
    await chrome.storage.local.set({ 
      conversations,
      currentConversationId
    });
  }
  
  function render() {
    clear(container);
    
    const session = sessionManager.getCurrentSession();
    const messages = session ? session.messages : [];
    const isLoading = session ? session.isLoading : false;
    
    const page = create('div', { 
      className: 'page', 
      style: { position: 'relative' }
    });
    
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
          alert(`${file.name}: ${error.message}`);
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
          await saveToStorage();
          
          // 清除当前会话指针
          currentConversationId = null;
          sessionManager.setCurrentSession(null);
          
          await chrome.storage.local.set({ 
            chatMessages: [],
            currentConversationId: null 
          });
          
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
          onClick: () => {
            window.ConfirmDialog.show({
              title: '删除消息',
              message: '确定要删除这条消息吗？此操作不可恢复。',
              confirmText: '删除',
              cancelText: '取消',
              onConfirm: async () => {
                const session = sessionManager.getCurrentSession();
                if (session) {
                  session.messages.splice(index, 1);
                  await saveToStorage();
                  render();
                }
              }
            });
          }
        });
        
        // hover 显示删除按钮
        bubble.onmouseenter = () => deleteBtn.style.display = 'flex';
        bubble.onmouseleave = () => deleteBtn.style.display = 'none';
        
        bubble.appendChild(deleteBtn);
        
        // 处理多模态内容
        if (Array.isArray(msg.content)) {
          msg.content.forEach(item => {
            if (item.type === 'text') {
              const contentDiv = create('div', { 
                className: 'message-content',
                style: { lineHeight: '1.6', wordWrap: 'break-word' }
              });
              contentDiv.innerHTML = window.renderMarkdown(item.text);
              bubble.appendChild(contentDiv);
            } else if (item.type === 'image_url') {
              const imgContainer = create('div', {
                style: { margin: '8px 0' }
              });
              const img = create('img', {
                attrs: { src: item.image_url.url },
                style: { maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }
              });
              img.onclick = () => window.open(item.image_url.url, '_blank');
              imgContainer.appendChild(img);
              bubble.appendChild(imgContainer);
            }
          });
        } else {
          // 普通文本消息
          const contentDiv = create('div', { 
            className: 'message-content',
            style: { 
              lineHeight: '1.6', 
              wordWrap: 'break-word',
              // 错误消息特殊样式
              ...(msg.isError ? {
                color: 'var(--color-danger)',
                background: 'rgba(244, 67, 54, 0.1)',
                padding: '8px 12px',
                borderRadius: '6px'
              } : {})
            }
          });
          
          if (msg.role === 'assistant') {
            contentDiv.innerHTML = window.renderMarkdown(msg.content || '');
          } else {
            contentDiv.textContent = msg.content;
          }
          
          bubble.appendChild(contentDiv);
        }
        
        messageListElement.appendChild(bubble);
        
        if (index === messages.length - 1) {
          lastMessageElement = bubble.querySelector('.message-content') || bubble.lastElementChild;
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
    
    const inputRow = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } });
    
    // 图片上传按钮
    const supportsVision = currentSettings && modelManager.getCapability(currentSettings.model)?.vision;
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
            alert(error.message);
          }
        }
        
        // 清空 file input
        e.target.value = '';
      }
    });
    
    uploadBtn.onclick = () => {
      if (!supportsVision) {
        alert('当前模型不支持图片，请在设置中切换到支持视觉的模型（如 GPT-4o、Claude-3 等）');
        return;
      }
      fileInput.click();
    };
    
    const input = create('input', {
      className: 'input',
      attrs: { 
        type: 'text', 
        placeholder: currentSettings && modelManager.getCapability(currentSettings.model)?.vision 
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
            alert(error.message);
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
        if (!text && pendingImages.length === 0) return;
        
        // 如果没有当前会话，创建新会话
        if (!currentConversationId) {
          currentConversationId = 'conv_' + Date.now();
          sessionManager.createSession(currentConversationId, []);
          sessionManager.setCurrentSession(currentConversationId);
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
        
        // 添加用户消息
        sessionManager.addMessage(session.id, userMessage);
        await saveToStorage();
        
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
          if (settings.systemPrompt) {
            chatMessages = [
              { role: 'system', content: settings.systemPrompt },
              ...chatMessages
            ];
          }
          
          // 智能截断消息以适应上下文窗口（如果启用）
          if (settings.autoContextTruncation !== false) {
            const beforeTruncate = chatMessages.length;
            chatMessages = contextManager.truncateMessages(
              chatMessages,
              settings.model,
              settings.maxTokens || 2000
            );
            
            // 记录上下文使用情况
            const usage = contextManager.getContextUsage(chatMessages, settings.model);
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
          
          // 绑定到会话
          sessionManager.startStreamRequest(session.id, port);
          
          // 监听流式响应
          port.onMessage.addListener(async (msg) => {
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
              
              saveToStorage();
              
              // 只在当前会话时更新 UI
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id) {
                if (lastMessageElement) {
                  lastMessageElement.innerHTML = window.renderMarkdown(currentMsg.content);
                }
                
                if (messageListElement) {
                  messageListElement.scrollTop = messageListElement.scrollHeight;
                }
              }
            } else if (msg.type === 'complete') {
              port.disconnect();
              sessionManager.completeStreamRequest(session.id);
              saveToStorage();
              
              // 只在当前会话时重新渲染
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id) {
                render();
                
                if (messageListElement) {
                  setTimeout(() => {
                    messageListElement.scrollTop = messageListElement.scrollHeight;
                  }, 50);
                }
              }
            } else if (msg.type === 'error') {
              port.disconnect();
              sessionManager.completeStreamRequest(session.id);
              
              // 添加错误消息到会话
              const errorMessage = {
                role: 'assistant',
                content: '❌ 请求失败: ' + msg.error,
                isError: true
              };
              sessionManager.addMessage(session.id, errorMessage);
              
              // 保存到 storage
              await saveToStorage();
              
              // 只在当前会话时重新渲染
              const currentSession = sessionManager.getCurrentSession();
              if (currentSession && currentSession.id === session.id) {
                render();
                
                if (messageListElement) {
                  messageListElement.scrollTop = messageListElement.scrollHeight;
                }
              }
            }
          });
          
          port.postMessage({
            messages: chatMessages,
            apiKey: settings.apiKey,
            apiEndpoint,
            model: settings.model,
            temperature: settings.temperature || 0.7,
            maxTokens: settings.maxTokens || 2000
          });
        } catch (error) {
          console.error('[Chat] Connection error:', error);
          
          // 添加错误消息
          sessionManager.addMessage(session.id, {
            role: 'assistant',
            content: '❌ 连接失败: ' + error.message,
            isError: true
          });
          
          // 保存到 storage
          await saveToStorage();
          
          render();
          
          if (messageListElement) {
            messageListElement.scrollTop = messageListElement.scrollHeight;
          }
        }
      }
    });
    
    const sendBtn = create('button', {
      className: 'btn btn-primary',
      text: '发送'
    });
    
    sendBtn.addEventListener('click', () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    
    inputRow.appendChild(uploadBtn);
    inputRow.appendChild(fileInput);
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
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
  
  // 初始化
  loadMessages().then(() => {
    render();
  });
};
