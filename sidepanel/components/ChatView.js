// ==================== ChatView - 聊天页面 ====================

(function() {
  'use strict';
  
  const { createElement, clearElement, createButton, createInput } = window.DOMUtils;
  
  let messages = [];
  let inputText = '';
  let isLoading = false;
  let sessionId = '';
  let sendMessage = null;
  let container = null;
  
  function init(rootElement, session, sendMsg) {
    container = rootElement;
    sessionId = session;
    sendMessage = sendMsg;
    render();
    loadHistory();
  }
  
  async function loadHistory() {
    try {
      const response = await sendMessage('GET_CONTEXT', { sessionId });
      if (response.success && response.data) {
        messages = response.data.filter(m => m.role !== 'system');
        renderMessages();
      }
    } catch (error) {
      console.error('[ChatView] Failed to load history:', error);
    }
  }
  
  async function handleSend() {
    if (!inputText.trim() || isLoading) return;
    
    const userMessage = { role: 'user', content: inputText };
    messages.push(userMessage);
    inputText = '';
    isLoading = true;
    renderMessages();
    updateInputState();
    
    try {
      await sendMessage('ADD_MESSAGE', { sessionId, role: 'user', content: userMessage.content });
      
      const aiResponse = {
        role: 'assistant',
        content: `收到你的消息\n\n当前会话: ${sessionId}\n这是一个测试响应，AI 集成功能即将上线。`
      };
      
      messages.push(aiResponse);
      renderMessages();
      await sendMessage('ADD_MESSAGE', { sessionId, role: 'assistant', content: aiResponse.content });
    } catch (error) {
      console.error('[ChatView] Send failed:', error);
      messages.push({
        role: 'assistant',
        content: '❌ 发送失败: ' + error.message
      });
      renderMessages();
    } finally {
      isLoading = false;
      updateInputState();
    }
  }
  
  async function handleClear() {
    if (!confirm('确定要清除当前会话吗？')) return;
    await sendMessage('CLEAR_SESSION', { sessionId });
    messages = [];
    renderMessages();
  }
  
  function render() {
    clearElement(container);
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.background = '#f5f5f5';
    
    // Header
    const header = createElement('div', {
      style: {
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    });
    
    const titleDiv = createElement('div');
    titleDiv.appendChild(createElement('div', {
      style: { fontSize: '14px', fontWeight: '600', color: '#333' },
      children: ['聊天窗口']
    }));
    titleDiv.appendChild(createElement('div', {
      style: { fontSize: '11px', color: '#999', marginTop: '2px' },
      children: [messages.length + ' 条消息']
    }));
    header.appendChild(titleDiv);
    
    const clearBtn = createButton('清除', {
      padding: '6px 12px',
      background: '#f5f5f5',
      border: '1px solid #ddd',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      color: '#666'
    }, handleClear);
    header.appendChild(clearBtn);
    
    container.appendChild(header);
    
    // Messages area
    const messagesArea = createElement('div', {
      style: { flex: '1', overflowY: 'auto', padding: '16px' },
      attrs: { id: 'chat-messages' }
    });
    container.appendChild(messagesArea);
    
    renderMessages();
    
    // Input area
    const inputArea = createElement('div', {
      style: { padding: '16px', background: '#fff', borderTop: '1px solid #e0e0e0' }
    });
    
    const inputRow = createElement('div', {
      style: { display: 'flex', gap: '8px' }
    });
    
    const inputEl = createInput({
      placeholder: '输入消息... (Enter 发送)',
      style: { 
        flex: '1', 
        padding: '10px 14px', 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        fontSize: '14px', 
        outline: 'none' 
      }
    });
    inputEl.addEventListener('input', (e) => {
      inputText = e.target.value;
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    inputRow.appendChild(inputEl);
    
    const sendBtn = createButton('发送', {
      padding: '10px 20px',
      background: '#1976d2',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500'
    }, handleSend);
    sendBtn.disabled = true;
    inputRow.appendChild(sendBtn);
    
    inputArea.appendChild(inputRow);
    container.appendChild(inputArea);
    
    // Store references
    container._inputEl = inputEl;
    container._sendBtn = sendBtn;
    container._titleCount = titleDiv.children[1];
  }
  
  function renderMessages() {
    const messagesArea = document.getElementById('chat-messages');
    if (!messagesArea) return;
    
    clearElement(messagesArea);
    
    if (messages.length === 0) {
      messagesArea.appendChild(createElement('div', {
        style: { textAlign: 'center', color: '#999', marginTop: '60px', padding: '0 20px' }
      }, [
        createElement('div', { style: { fontSize: '48px', marginBottom: '16px' }, children: ['💬'] }),
        createElement('p', { style: { fontSize: '14px', marginBottom: '8px' }, children: ['开始对话吧！'] }),
        createElement('p', { style: { fontSize: '12px', color: '#bbb' }, children: ['向 AI 描述你想完成的任务'] })
      ]));
    } else {
      messages.forEach(msg => {
        const msgDiv = createElement('div', {
          style: { 
            marginBottom: '16px', 
            display: 'flex', 
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' 
          }
        });
        
        const bubble = createElement('div', {
          style: {
            maxWidth: '80%',
            padding: '12px 16px',
            borderRadius: '12px',
            background: msg.role === 'user' ? '#1976d2' : '#fff',
            color: msg.role === 'user' ? '#fff' : '#333',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            whiteSpace: 'pre-wrap',
            fontSize: '14px',
            lineHeight: '1.5'
          },
          children: [msg.content]
        });
        
        msgDiv.appendChild(bubble);
        messagesArea.appendChild(msgDiv);
      });
      
      if (isLoading) {
        const loadingDiv = createElement('div', {
          style: { marginBottom: '16px', display: 'flex', justifyContent: 'flex-start' }
        });
        loadingDiv.appendChild(createElement('div', {
          style: { 
            padding: '12px 16px', 
            borderRadius: '12px', 
            background: '#fff', 
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)', 
            color: '#999', 
            fontSize: '14px' 
          },
          children: ['AI 思考中...']
        }));
        messagesArea.appendChild(loadingDiv);
      }
    }
    
    // Update count
    if (container && container._titleCount) {
      container._titleCount.textContent = messages.length + ' 条消息';
    }
    
    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }
  
  function updateInputState() {
    if (container && container._inputEl && container._sendBtn) {
      container._inputEl.disabled = isLoading;
      container._sendBtn.disabled = isLoading || !inputText.trim();
      container._sendBtn.style.background = (isLoading || !inputText.trim()) ? '#ccc' : '#1976d2';
      container._sendBtn.style.cursor = (isLoading || !inputText.trim()) ? 'not-allowed' : 'pointer';
    }
  }
  
  window.ChatView = { init };
})();
