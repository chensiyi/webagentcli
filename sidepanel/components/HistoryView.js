// ==================== HistoryView - 历史页面 ====================

(function() {
  'use strict';
  
  const { createElement, clearElement, createButton } = window.DOMUtils;
  
  let sessions = [];
  let loading = true;
  let sessionId = '';
  let sendMessage = null;
  let onSwitchSession = null;
  let container = null;
  
  function init(rootElement, session, sendMsg, switchCallback) {
    container = rootElement;
    sessionId = session;
    sendMessage = sendMsg;
    onSwitchSession = switchCallback;
    render();
    loadSessions();
  }
  
  async function loadSessions() {
    try {
      loading = true;
      render();
      
      const result = await chrome.storage.local.get(null);
      const sessionList = Object.entries(result)
        .filter(([key]) => key.startsWith('session_'))
        .map(([key, data]) => ({
          id: key.replace('session_', ''),
          ...data,
          lastMessage: data.messages?.length > 0 
            ? data.messages[data.messages.length - 1].content.substring(0, 50) + '...'
            : '空会话'
        }))
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      
      sessions = sessionList;
    } catch (error) {
      console.error('[HistoryView] Failed to load sessions:', error);
    } finally {
      loading = false;
      render();
    }
  }
  
  async function handleDelete(id) {
    if (!confirm('确定要删除这个会话吗？')) return;
    try {
      await chrome.storage.local.remove('session_' + id);
      await sendMessage('CLEAR_SESSION', { sessionId: id });
      await loadSessions();
    } catch (error) {
      console.error('[HistoryView] Failed to delete session:', error);
      alert('删除失败: ' + error.message);
    }
  }
  
  function formatTime(timestamp) {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return date.toLocaleDateString('zh-CN');
  }
  
  function render() {
    clearElement(container);
    container.style.height = '100%';
    container.style.overflowY = 'auto';
    container.style.background = '#f5f5f5';
    container.style.padding = '16px';
    
    if (loading) {
      container.appendChild(createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' },
        children: ['加载中...']
      }));
      return;
    }
    
    // Header
    const header = createElement('div', { style: { marginBottom: '20px' } });
    header.appendChild(createElement('h2', {
      style: { fontSize: '18px', fontWeight: '600', color: '#333' },
      children: ['会话历史']
    }));
    header.appendChild(createElement('p', {
      style: { fontSize: '12px', color: '#999', marginTop: '4px' },
      children: ['共 ' + sessions.length + ' 个会话']
    }));
    container.appendChild(header);
    
    // Sessions list
    if (sessions.length === 0) {
      container.appendChild(createElement('div', {
        style: { textAlign: 'center', color: '#999', marginTop: '60px' }
      }, [
        createElement('div', { style: { fontSize: '48px', marginBottom: '16px' }, children: ['📜'] }),
        createElement('p', { children: ['暂无会话历史'] }),
        createElement('p', { style: { fontSize: '12px', marginTop: '8px' }, children: ['开始新对话后将自动保存'] })
      ]));
    } else {
      sessions.forEach(session => {
        const currentId = sessionId.replace('session_', '');
        const isCurrent = session.id === currentId;
        
        const card = createElement('div', {
          style: {
            background: isCurrent ? '#e3f2fd' : '#fff',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            cursor: 'pointer'
          }
        });
        
        card.addEventListener('click', () => onSwitchSession(session.id));
        
        // Header row
        const headerRow = createElement('div', {
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            marginBottom: '8px' 
          }
        });
        
        const infoDiv = createElement('div', { style: { flex: 1 } });
        infoDiv.appendChild(createElement('div', {
          style: { 
            fontSize: '13px', 
            fontWeight: '600', 
            color: isCurrent ? '#1976d2' : '#333', 
            marginBottom: '4px' 
          },
          children: ['会话 ' + session.id.substring(0, 8) + '...']
        }));
        infoDiv.appendChild(createElement('div', {
          style: { 
            fontSize: '12px', 
            color: '#666', 
            lineHeight: '1.5', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          },
          children: [session.lastMessage]
        }));
        headerRow.appendChild(infoDiv);
        
        headerRow.appendChild(createElement('div', {
          style: { fontSize: '11px', color: '#999', marginLeft: '12px', whiteSpace: 'nowrap' },
          children: [formatTime(session.updatedAt || session.createdAt)]
        }));
        
        card.appendChild(headerRow);
        
        // Footer row
        const footerRow = createElement('div', {
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            fontSize: '11px', 
            color: '#999' 
          }
        });
        
        footerRow.appendChild(createElement('span', {
          children: [(session.messages?.length || 0) + ' 条消息']
        }));
        
        const deleteBtn = createButton('删除', {
          padding: '3px 10px',
          background: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          color: '#f44336'
        }, (e) => {
          e.stopPropagation();
          handleDelete(session.id);
        });
        footerRow.appendChild(deleteBtn);
        
        card.appendChild(footerRow);
        container.appendChild(card);
      });
    }
  }
  
  window.HistoryView = { init };
})();
