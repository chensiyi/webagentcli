/**
 * HistoryPage - 历史会话管理页面
 */

window.Pages = window.Pages || {};

window.Pages.history = function(container) {
  const { create, clear } = window.DOM;
  
  // 确保 SessionManager 已初始化
  if (!window.sessionManagerInstance && !window.SessionManager) {
    console.error('[HistoryPage] SessionManager not initialized');
    container.innerHTML = '<div class="empty-state">会话管理器未初始化，请刷新页面重试</div>';
    return;
  }
  
  const sessionManager = window.sessionManagerInstance || window.SessionManager;
  
  let searchKeyword = '';
  let searchTimer = null;
  let filteredConversations = [];
  let listContainer = null;
  
  // 智能生成标题：取第一条用户消息的前几个字
  function generateSmartTitle(messages) {
    if (!messages || !Array.isArray(messages)) return '新对话';
    
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return '新对话';
    
    let content = '';
    if (typeof firstUserMsg.content === 'string') {
      content = firstUserMsg.content;
    } else if (Array.isArray(firstUserMsg.content)) {
      content = firstUserMsg.content
        .filter(item => item.type === 'text')
        .map(item => item.text || '')
        .join(' ');
    }
    
    // 移除换行符和多余空格
    content = content.replace(/\n/g, ' ').trim();
    return content.substring(0, 20) + (content.length > 20 ? '...' : '');
  }

  async function loadConversations() {
    // SessionManager 在初始化时已经加载了
    return Promise.resolve();
  }
  
  async function deleteConversation(id) {
    const confirmed = await window.Toast.confirm({
      title: '删除对话',
      message: '确定删除此对话？此操作不可恢复。'
    });
    
    if (!confirmed) return;
    
    if (sessionManager.deleteSession) {
      // 历史页面删除会话时不自动切换，避免影响用户当前浏览的页面
      sessionManager.deleteSession(id, false);
    }
    render();
    window.Toast.success('对话已删除');
  }
  
  async function loadConversation(id) {
    if (sessionManager.loadSession) {
      sessionManager.loadSession(id);
    } else if (sessionManager.switchSession) {
      sessionManager.switchSession(id);
    }
    
    if (window.App && window.App.navigateTo) {
      window.App.navigateTo('chat');
    }
  }
  
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    page.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '历史对话' })
    ]));
    
    const content = create('div', { className: 'page-content' });
    
    // 搜索框
    const searchBox = create('input', {
      className: 'input mb-12',
      style: { width: '100%' },
      attrs: { type: 'text', placeholder: '搜索对话...' },
      onInput: (e) => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          searchKeyword = e.target.value.trim().toLowerCase();
          updateSearchResults();
        }, 500);
      }
    });
    content.appendChild(searchBox);
    
    // 列表容器
    listContainer = create('div', { 
      className: 'flex-1 overflow-y-auto p-12'
    });
    content.appendChild(listContainer);
    page.appendChild(content);
    container.appendChild(page);
    
    updateSearchResults();
  }
    
  function updateSearchResults() {
    // 兼容 SessionController 和 SessionManager
    const sessions = sessionManager.getSessions ? sessionManager.getSessions() : 
                     (sessionManager.getAllSessions ? sessionManager.getAllSessions() : []);
    
    // 过滤
    if (searchKeyword) {
      filteredConversations = sessions.filter(session => {
        const title = generateSmartTitle(session.messages).toLowerCase();
        return title.includes(searchKeyword);
      });
    } else {
      filteredConversations = [...sessions];
    }
    
    // 按时间排序
    filteredConversations.sort((a, b) => (b.updated_at || b.updatedAt || 0) - (a.updated_at || a.updatedAt || 0));
    
    const currentSession = sessionManager.getCurrentSession ? sessionManager.getCurrentSession() : 
                           (sessionManager.currentSessionId ? sessionManager.sessions.find(s => s.id === sessionManager.currentSessionId) : null);
    const currentId = currentSession ? currentSession.id : null;
    
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    if (filteredConversations.length === 0) {
      listContainer.appendChild(create('div', { className: 'empty-state' }, [
        create('div', { className: 'empty-state-icon', text: '📋' }),
        create('div', { className: 'empty-state-title', text: searchKeyword ? '没有找到匹配的对话' : '暂无历史对话' })
      ]));
    } else {
      filteredConversations.forEach(conv => {
        const isActive = conv.id === currentId;
        const item = create('div', {
          className: `history-item ${isActive ? 'history-item-active' : ''}`
        });
        
        const title = generateSmartTitle(conv.messages);
        const timeStr = window.TimeUtils.formatTimestamp(conv.updated_at || conv.updatedAt || Date.now());
        const msgCount = conv.messages ? conv.messages.filter(m => m.role === 'user').length : 0;
        
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
    render();
  });
};
