// 历史页面
window.Pages = window.Pages || {};

window.Pages.history = function(container) {
  const { create, clear } = window.DOM;
  const sessionManager = window.SessionManager;
  
  let conversations = [];
  let currentConversationId = null;
  let searchKeyword = '';
  let searchTimer = null;
  let filteredConversations = [];
  
  // 从 storage 加载对话历史
  async function loadConversations() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['conversations', 'currentConversationId'], resolve);
    });
    conversations = result.conversations || [];
    currentConversationId = result.currentConversationId;
    
    // 同步当前对话 ID
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (!conv) {
        currentConversationId = null;
      }
    }
  }
  
  // 保存对话历史
  async function saveConversations() {
    await chrome.storage.local.set({ 
      conversations,
      currentConversationId 
    });
  }
  
  // 删除对话
  async function deleteConversation(id) {
    const confirmed = await window.Toast.confirm({
      title: '删除对话',
      message: '确定删除此对话？此操作不可恢复。'
    });
    
    if (!confirmed) return;
    
    // 取消该会话的请求
    sessionManager.cancelRequest(id);
    sessionManager.deleteSession(id);
    
    // 从列表中移除
    conversations = conversations.filter(c => c.id !== id);
    
    // 如果删除的是当前对话，清除 currentConversationId
    if (currentConversationId === id) {
      currentConversationId = null;
      await chrome.storage.local.set({ 
        currentConversationId: null,
        chatMessages: []
      });
    }
    
    await saveConversations();
    render();
    
    window.Toast.success('对话已删除');
  }
  
  // 加载当前对话到 chat 页面
  async function loadConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    
    // 更新当前对话 ID
    currentConversationId = id;
    
    // 在 SessionManager 中创建或更新会话
    let session = sessionManager.getSession(id);
    if (!session) {
      session = sessionManager.createSession(id, conv.messages);
    } else {
      // 只更新 messages，保留其他状态（如 isLoading、port）
      session.messages = [...conv.messages];
    }
    sessionManager.setCurrentSession(id);
    
    // 保存到 storage
    await chrome.storage.local.set({ 
      chatMessages: conv.messages,
      currentConversationId: id
    });
    
    // 触发页面刷新
    if (window.App && window.App.navigateTo) {
      window.App.navigateTo('chat');
    }
  }
  
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    // 头部
    page.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '历史对话' })
    ]));
    
    // 内容容器
    const content = create('div', { className: 'page-content', style: { padding: '0' } });
    
    // 搜索框
    const searchBox = create('input', {
      className: 'input',
      attrs: { type: 'text', placeholder: '搜索对话...' },
      style: { 
        margin: '12px',
        width: 'calc(100% - 24px)' // 减去左右 margin
      },
      onInput: (e) => {
        // 清除之前的定时器
        if (searchTimer) {
          clearTimeout(searchTimer);
        }
        
        // 设置新定时器（1秒后执行搜索）
        searchTimer = setTimeout(() => {
          searchKeyword = e.target.value.trim().toLowerCase();
          updateSearchResults();
        }, 1000);
      }
    });
    content.appendChild(searchBox);
    
    // 对话列表容器
    const listContainer = create('div', { 
      style: { flex: 1, overflowY: 'auto', padding: '12px' }
    });
    content.appendChild(listContainer);
    page.appendChild(content);
    container.appendChild(page);
    
    // 初始渲染列表
    updateSearchResults();
  }
    
  // 更新搜索结果（不重新渲染整个页面）
  function updateSearchResults() {
    // 过滤对话
    if (searchKeyword) {
      filteredConversations = conversations.filter(conv => {
        const firstUserMsg = conv.messages.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.toLowerCase() : '';
        return title.includes(searchKeyword);
      });
    } else {
      filteredConversations = [...conversations];
    }
    
    // 按时间排序
    filteredConversations.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // 更新列表容器（content 的最后一个子元素）
    const content = container.querySelector('.page-content');
    if (!content || !content.lastElementChild) return;
    const listContainer = content.lastElementChild;
    
    // 清空列表
    listContainer.innerHTML = '';
    
    if (filteredConversations.length === 0) {
      const emptyText = searchKeyword ? '没有找到匹配的对话' : '暂无历史对话';
      listContainer.appendChild(create('div', { className: 'empty-state' }, [
        create('div', { className: 'empty-state-icon', text: '📋' }),
        create('div', { className: 'empty-state-title', text: emptyText })
      ]));
    } else {
      filteredConversations.forEach(conv => {
        const item = create('div', {
          className: 'history-item',
          style: {
            padding: '12px',
            marginBottom: '8px',
            borderRadius: '8px',
            cursor: 'pointer',
            border: '1px solid var(--color-border)',
            background: conv.id === currentConversationId ? 'var(--color-primary-light)' : 'var(--color-surface)',
            position: 'relative'
          }
        });
        
        // 标题（第一条用户消息）
        const firstUserMsg = conv.messages.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '') : '新对话';
        
        // 时间
        const date = new Date(conv.updatedAt);
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        // 消息数量
        const msgCount = conv.messages.filter(m => m.role === 'user').length;
        
        // 点击区域（除了删除按钮）
        const contentDiv = create('div', {
          style: { paddingRight: '40px' },
          onClick: () => loadConversation(conv.id)
        });
        
        contentDiv.appendChild(create('div', {
          style: { fontWeight: '500', marginBottom: '4px', fontSize: '14px' },
          text: title
        }));
        
        contentDiv.appendChild(create('div', {
          style: { fontSize: '12px', color: 'var(--color-text-secondary)' },
          text: `${timeStr} · ${msgCount} 条消息`
        }));
        
        item.appendChild(contentDiv);
        
        // 删除按钮
        const deleteBtn = create('button', {
          className: 'btn btn-text',
          style: {
            position: 'absolute',
            top: '50%',
            right: '8px',
            transform: 'translateY(-50%)',
            fontSize: '18px',
            padding: '4px 8px',
            color: 'var(--color-error)'
          },
          text: '🗑',
          title: '删除对话',
          onClick: (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
          }
        });
        
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
      });
    }
  }
  
  // 初始化
  loadConversations().then(() => {
    render();
  });
};
