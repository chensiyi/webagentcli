// 历史页面
window.Pages = window.Pages || {};

window.Pages.history = function(container) {
  const { create, clear } = window.DOM;
  const sessionManager = window.SessionManager;
  
  let searchKeyword = '';
  let searchTimer = null;
  let filteredConversations = [];
  let listContainer = null; // 保存列表容器引用
  
  // 从 SessionManager 加载对话历史
  async function loadConversations() {
    await sessionManager.loadConversations();
  }
  
  // 删除对话
  async function deleteConversation(id) {
    const confirmed = await window.Toast.confirm({
      title: '删除对话',
      message: '确定删除此对话？此操作不可恢复。'
    });
    
    if (!confirmed) return;
    
    // 使用 SessionManager 删除（包括从 storage 中删除）
    await sessionManager.deleteConversation(id);
    
    render();
    
    window.Toast.success('对话已删除');
  }
  
  // 加载当前对话到 chat 页面
  async function loadConversation(id) {
    const sessions = sessionManager.getAllSessions();
    const session = sessions.find(s => s.id === id);
    
    if (!session) return;
    
    // 设置当前会话
    sessionManager.setCurrentSession(id);
    
    // 保存到 storage
    await sessionManager.saveConversations();
    
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
    const content = create('div', { className: 'page-content p-0' });
    
    // 搜索框
    const searchBox = create('input', {
      className: 'input m-12',
      style: { width: 'calc(100% - 24px)' },
      attrs: { type: 'text', placeholder: '搜索对话...' },
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
    listContainer = create('div', { 
      className: 'flex-1 overflow-y-auto p-12'
    });
    content.appendChild(listContainer);
    page.appendChild(content);
    container.appendChild(page);
    
    // 初始渲染列表
    updateSearchResults();
  }
    
  // 更新搜索结果（不重新渲染整个页面）
  function updateSearchResults() {
    const sessions = sessionManager.getAllSessions();
    
    console.log('[History] Updating search results, sessions:', sessions.length);
    
    // 过滤对话
    if (searchKeyword) {
      filteredConversations = sessions.filter(session => {
        const firstUserMsg = session.messages.find(m => m.role === 'user');
        if (!firstUserMsg) return false;
        
        // 安全地获取文本内容（处理多模态消息）
        let content = '';
        if (typeof firstUserMsg.content === 'string') {
          content = firstUserMsg.content.toLowerCase();
        } else if (Array.isArray(firstUserMsg.content)) {
          // 多模态消息，提取所有文本部分
          content = firstUserMsg.content
            .filter(item => item.type === 'text')
            .map(item => item.text || '')
            .join(' ')
            .toLowerCase();
        }
        
        return content.includes(searchKeyword);
      });
    } else {
      filteredConversations = [...sessions];
    }
    
    // 按时间排序
    filteredConversations.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // 获取当前会话 ID
    const currentSession = sessionManager.getCurrentSession();
    const currentConversationId = currentSession ? currentSession.id : null;
    
    console.log('[History] Filtered conversations:', filteredConversations.length);
    
    // 检查 listContainer 是否存在
    if (!listContainer) {
      console.error('[History] listContainer not found');
      return;
    }
    
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
        const isActive = conv.id === currentConversationId;
        const item = create('div', {
          className: `history-item ${isActive ? 'history-item-active' : ''}`
        });
        
        // 标题（第一条用户消息）
        const firstUserMsg = conv.messages.find(m => m.role === 'user');
        let title = '新对话';
        if (firstUserMsg) {
          // 安全地获取文本内容（处理多模态消息）
          let content = '';
          if (typeof firstUserMsg.content === 'string') {
            content = firstUserMsg.content;
          } else if (Array.isArray(firstUserMsg.content)) {
            // 多模态消息，提取所有文本部分
            content = firstUserMsg.content
              .filter(item => item.type === 'text')
              .map(item => item.text || '')
              .join(' ');
          }
          title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        }
        
        // 时间
        const timeStr = window.TimeUtils.formatTimestamp(conv.updatedAt);
        
        // 消息数量
        const msgCount = conv.messages.filter(m => m.role === 'user').length;
        
        // 点击区域（除了删除按钮）
        const contentDiv = create('div', {
          className: 'history-item-content',
          onClick: () => loadConversation(conv.id)
        });
        
        contentDiv.appendChild(create('div', {
          className: 'history-item-title',
          text: title
        }));
        
        contentDiv.appendChild(create('div', {
          className: 'history-item-meta',
          text: `${timeStr} · ${msgCount} 条消息`
        }));
        
        item.appendChild(contentDiv);
        
        // 删除按钮
        const deleteBtn = create('button', {
          className: 'history-item-delete btn btn-text',
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
    console.log('[History] Conversations loaded');
    render();
  });
};
