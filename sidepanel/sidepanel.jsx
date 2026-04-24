// ==================== Side Panel App ====================
// 完整应用 - 所有组件在一个文件中

const { useState, useEffect } = window.React;

// 页面类型
const PAGES = {
  CHAT: 'chat',
  TOOLS: 'tools',
  SETTINGS: 'settings',
  HISTORY: 'history'
};

// ==================== 主应用 ====================
function App() {
  const [currentPage, setCurrentPage] = useState(PAGES.CHAT);
  const [sessionId, setSessionId] = useState('session_' + Date.now());
  
  async function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  function renderPage() {
    switch (currentPage) {
      case PAGES.CHAT:
        return window.React.createElement(ChatView, { sessionId, sendMessage });
      case PAGES.TOOLS:
        return window.React.createElement(ToolsView, { sendMessage });
      case PAGES.SETTINGS:
        return window.React.createElement(SettingsView, { sendMessage });
      case PAGES.HISTORY:
        return window.React.createElement(HistoryView, { 
          sessionId, 
          sendMessage,
          onSwitchSession: (id) => setSessionId(id)
        });
      default:
        return window.React.createElement(ChatView, { sessionId, sendMessage });
    }
  }
  
  return window.React.createElement('div', {
    style: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }
  },
    window.React.createElement(Header),
    window.React.createElement('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
      window.React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
        renderPage()
      ),
      window.React.createElement(Sidebar, { currentPage, onNavigate: setCurrentPage })
    )
  );
}

// ==================== Header ====================
function Header() {
  return window.React.createElement('div', {
    style: {
      padding: '12px 16px',
      background: '#1976d2',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }
  },
    window.React.createElement('h1', { style: { fontSize: '16px', fontWeight: '600' } }, 'Web Agent Client'),
    window.React.createElement('div', { style: { fontSize: '12px', opacity: 0.9 } }, 'v0.1.0')
  );
}

// ==================== Sidebar ====================
function Sidebar({ currentPage, onNavigate }) {
  const menuItems = [
    { id: PAGES.CHAT, icon: '💬', label: '聊天' },
    { id: PAGES.TOOLS, icon: '🔧', label: '工具' },
    { id: PAGES.HISTORY, icon: '📋', label: '历史' },
    { id: PAGES.SETTINGS, icon: '⚙️', label: '设置' }
  ];
  
  return window.React.createElement('div', {
    style: {
      width: '60px',
      background: '#fafafa',
      borderLeft: '1px solid #e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: '8px'
    }
  },
    ...menuItems.map(item => 
      window.React.createElement('button', {
        key: item.id,
        onClick: () => onNavigate(item.id),
        style: {
          width: '44px',
          height: '44px',
          border: 'none',
          borderRadius: '8px',
          background: currentPage === item.id ? '#e3f2fd' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px'
        }
      },
        window.React.createElement('span', { style: { fontSize: '20px' } }, item.icon),
        window.React.createElement('span', { 
          style: { fontSize: '10px', color: currentPage === item.id ? '#1976d2' : '#666' } 
        }, item.label)
      )
    )
  );
}

// ==================== ChatView ====================
function ChatView({ sessionId, sendMessage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    loadHistory();
  }, [sessionId]);
  
  async function loadHistory() {
    try {
      const response = await sendMessage('GET_CONTEXT', { sessionId });
      if (response.success && response.data) {
        const userMessages = response.data.filter(m => m.role !== 'system');
        setMessages(userMessages);
      }
    } catch (error) {
      console.error('[ChatView] Failed to load history:', error);
    }
  }
  
  async function handleSend() {
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      await sendMessage('ADD_MESSAGE', { sessionId, role: 'user', content: input });
      
      const aiResponse = {
        role: 'assistant',
        content: `收到你的消息！\n\n当前会话: ${sessionId}\n这是一个测试响应，AI 集成功能即将上线。`
      };
      
      setMessages(prev => [...prev, aiResponse]);
      await sendMessage('ADD_MESSAGE', { sessionId, role: 'assistant', content: aiResponse.content });
    } catch (error) {
      console.error('[ChatView] Send failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ 发送失败: ' + error.message
      }]);
    } finally {
      setIsLoading(false);
    }
  }
  
  async function handleClear() {
    if (!confirm('确定要清除当前会话吗？')) return;
    await sendMessage('CLEAR_SESSION', { sessionId });
    setMessages([]);
  }
  
  return window.React.createElement('div', {
    style: { height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }
  },
    // Header
    window.React.createElement('div', {
      style: {
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    },
      window.React.createElement('div', null,
        window.React.createElement('div', { style: { fontSize: '14px', fontWeight: '600', color: '#333' } }, '聊天窗口'),
        window.React.createElement('div', { style: { fontSize: '11px', color: '#999', marginTop: '2px' } }, messages.length + ' 条消息')
      ),
      window.React.createElement('button', {
        onClick: handleClear,
        style: { padding: '6px 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#666' }
      }, '清除')
    ),
    // Messages
    window.React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '16px' } },
      messages.length === 0 
        ? window.React.createElement('div', { style: { textAlign: 'center', color: '#999', marginTop: '60px', padding: '0 20px' } },
            window.React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '💬'),
            window.React.createElement('p', { style: { fontSize: '14px', marginBottom: '8px' } }, '开始对话吧！'),
            window.React.createElement('p', { style: { fontSize: '12px', color: '#bbb' } }, '向 AI 描述你想完成的任务')
          )
        : messages.map((msg, idx) =>
            window.React.createElement('div', {
              key: idx,
              style: { marginBottom: '16px', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }
            },
              window.React.createElement('div', {
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
                }
              }, msg.content)
            )
          ).concat(
            isLoading ? [window.React.createElement('div', {
              style: { marginBottom: '16px', display: 'flex', justifyContent: 'flex-start' }
            },
              window.React.createElement('div', {
                style: { padding: '12px 16px', borderRadius: '12px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', color: '#999', fontSize: '14px' }
              }, 'AI 思考中...')
            )] : []
          )
    ),
    // Input
    window.React.createElement('div', {
      style: { padding: '16px', background: '#fff', borderTop: '1px solid #e0e0e0' }
    },
      window.React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        window.React.createElement('input', {
          type: 'text',
          value: input,
          onInput: e => setInput(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } },
          placeholder: '输入消息... (Enter 发送)',
          disabled: isLoading,
          style: { flex: 1, padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }
        }),
        window.React.createElement('button', {
          onClick: handleSend,
          disabled: isLoading || !input.trim(),
          style: {
            padding: '10px 20px',
            background: isLoading || !input.trim() ? '#ccc' : '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }
        }, '发送')
      )
    )
  );
}

// ==================== ToolsView ====================
function ToolsView({ sendMessage }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadTools();
  }, []);
  
  async function loadTools() {
    try {
      setLoading(true);
      const response = await sendMessage('GET_TOOLS', {});
      if (response.success) setTools(response.data);
    } catch (error) {
      console.error('[ToolsView] Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function testTool(toolName) {
    try {
      let params = {};
      if (toolName === 'read_page' || toolName === 'click_element') {
        params = { selector: 'title' };
      } else if (toolName === 'fill_form') {
        params = { selector: 'input', value: 'test' };
      }
      const response = await sendMessage('EXECUTE_TOOL', { toolName, params });
      alert('工具测试结果:\n' + JSON.stringify(response, null, 2));
    } catch (error) {
      alert('测试失败: ' + error.message);
    }
  }
  
  if (loading) {
    return window.React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }
    }, '加载中...');
  }
  
  return window.React.createElement('div', {
    style: { height: '100%', overflowY: 'auto', background: '#f5f5f5', padding: '16px' }
  },
    window.React.createElement('div', { style: { marginBottom: '20px' } },
      window.React.createElement('h2', { style: { fontSize: '18px', fontWeight: '600', color: '#333' } }, '工具注册'),
      window.React.createElement('p', { style: { fontSize: '12px', color: '#999', marginTop: '4px' } }, '共 ' + tools.length + ' 个可用工具')
    ),
    ...tools.map((tool, idx) =>
      window.React.createElement('div', {
        key: idx,
        style: { background: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
      },
        window.React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }
        },
          window.React.createElement('div', { style: { flex: 1 } },
            window.React.createElement('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#1976d2', marginBottom: '4px' } }, tool.function.name),
            window.React.createElement('p', { style: { fontSize: '12px', color: '#666', lineHeight: '1.5' } }, tool.function.description)
          ),
          window.React.createElement('button', {
            onClick: () => testTool(tool.function.name),
            style: { padding: '4px 12px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#666', marginLeft: '12px' }
          }, '测试')
        )
      )
    ),
    tools.length === 0 && window.React.createElement('div', {
      style: { textAlign: 'center', color: '#999', marginTop: '60px' }
    },
      window.React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🔧'),
      window.React.createElement('p', null, '暂无可用工具')
    )
  );
}

// ==================== SettingsView ====================
function SettingsView({ sendMessage }) {
  const [settings, setSettings] = useState({
    apiKey: '',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
    temperature: 0.7,
    maxTokens: 4096
  });
  const [saved, setSaved] = useState(false);
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) setSettings(prev => ({ ...prev, ...result.settings }));
    } catch (error) {
      console.error('[SettingsView] Failed to load settings:', error);
    }
  }
  
  async function handleSave() {
    try {
      await chrome.storage.local.set({ settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('[SettingsView] Failed to save settings:', error);
      alert('保存失败: ' + error.message);
    }
  }
  
  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }
  
  return window.React.createElement('div', {
    style: { height: '100%', overflowY: 'auto', background: '#f5f5f5', padding: '16px' }
  },
    window.React.createElement('div', { style: { marginBottom: '20px' } },
      window.React.createElement('h2', { style: { fontSize: '18px', fontWeight: '600', color: '#333' } }, '设置'),
      window.React.createElement('p', { style: { fontSize: '12px', color: '#999', marginTop: '4px' } }, '配置 AI API 和模型参数')
    ),
    // API 配置
    window.React.createElement('div', {
      style: { background: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
    },
      window.React.createElement('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' } }, 'API 配置'),
      window.React.createElement('div', { style: { marginBottom: '12px' } },
        window.React.createElement('label', { style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' } }, 'API Key'),
        window.React.createElement('input', {
          type: 'password',
          value: settings.apiKey,
          onInput: e => handleChange('apiKey', e.target.value),
          placeholder: 'sk-...',
          style: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none' }
        })
      ),
      window.React.createElement('div', { style: { marginBottom: '12px' } },
        window.React.createElement('label', { style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' } }, 'API 端点'),
        window.React.createElement('input', {
          type: 'text',
          value: settings.apiEndpoint,
          onInput: e => handleChange('apiEndpoint', e.target.value),
          placeholder: 'https://...',
          style: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none' }
        })
      )
    ),
    // 模型配置
    window.React.createElement('div', {
      style: { background: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
    },
      window.React.createElement('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' } }, '模型配置'),
      window.React.createElement('div', { style: { marginBottom: '12px' } },
        window.React.createElement('label', { style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' } }, '模型名称'),
        window.React.createElement('input', {
          type: 'text',
          value: settings.model,
          onInput: e => handleChange('model', e.target.value),
          placeholder: 'openai/gpt-4o',
          style: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none' }
        })
      )
    ),
    // 保存按钮
    window.React.createElement('button', {
      onClick: handleSave,
      style: {
        width: '100%',
        padding: '12px',
        background: saved ? '#4caf50' : '#1976d2',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600'
      }
    }, saved ? '✓ 已保存' : '保存设置'),
    // 提示
    window.React.createElement('div', {
      style: { marginTop: '20px', padding: '12px', background: '#fff3e0', borderRadius: '6px', fontSize: '11px', color: '#e65100', lineHeight: '1.6' }
    },
      window.React.createElement('strong', null, '提示：'),
      window.React.createElement('br'),
      '• 推荐使用 OpenRouter: https://openrouter.ai',
      window.React.createElement('br'),
      '• API Key 仅存储在本地浏览器中',
      window.React.createElement('br'),
      '• AI 集成功能即将上线'
    )
  );
}

// ==================== HistoryView ====================
function HistoryView({ sessionId, sendMessage, onSwitchSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadSessions();
  }, []);
  
  async function loadSessions() {
    try {
      setLoading(true);
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
      setSessions(sessionList);
    } catch (error) {
      console.error('[HistoryView] Failed to load sessions:', error);
    } finally {
      setLoading(false);
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
  
  if (loading) {
    return window.React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }
    }, '加载中...');
  }
  
  return window.React.createElement('div', {
    style: { height: '100%', overflowY: 'auto', background: '#f5f5f5', padding: '16px' }
  },
    window.React.createElement('div', { style: { marginBottom: '20px' } },
      window.React.createElement('h2', { style: { fontSize: '18px', fontWeight: '600', color: '#333' } }, '会话历史'),
      window.React.createElement('p', { style: { fontSize: '12px', color: '#999', marginTop: '4px' } }, '共 ' + sessions.length + ' 个会话')
    ),
    sessions.length === 0
      ? window.React.createElement('div', { style: { textAlign: 'center', color: '#999', marginTop: '60px' } },
          window.React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '📋'),
          window.React.createElement('p', null, '暂无会话历史'),
          window.React.createElement('p', { style: { fontSize: '12px', marginTop: '8px' } }, '开始新对话后将自动保存')
        )
      : sessions.map((session, idx) =>
          window.React.createElement('div', {
            key: idx,
            style: {
              background: session.id === sessionId.replace('session_', '') ? '#e3f2fd' : '#fff',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              cursor: 'pointer'
            },
            onClick: () => onSwitchSession(session.id)
          },
            window.React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }
            },
              window.React.createElement('div', { style: { flex: 1 } },
                window.React.createElement('div', {
                  style: { fontSize: '13px', fontWeight: '600', color: session.id === sessionId.replace('session_', '') ? '#1976d2' : '#333', marginBottom: '4px' }
                }, '会话 ' + session.id.substring(0, 8) + '...'),
                window.React.createElement('div', {
                  style: { fontSize: '12px', color: '#666', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                }, session.lastMessage)
              ),
              window.React.createElement('div', { style: { fontSize: '11px', color: '#999', marginLeft: '12px', whiteSpace: 'nowrap' } }, formatTime(session.updatedAt || session.createdAt))
            ),
            window.React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#999' }
            },
              window.React.createElement('span', null, (session.messages?.length || 0) + ' 条消息'),
              window.React.createElement('button', {
                onClick: (e) => { e.stopPropagation(); handleDelete(session.id); },
                style: { padding: '3px 10px', background: 'transparent', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#f44336' }
              }, '删除')
            )
          )
        )
  );
}

// ==================== 挂载应用 ====================
const root = document.getElementById('root');
if (root && window.React) {
  window.React.render(window.React.createElement(App), root);
  console.log('[SidePanel] App mounted successfully');
} else {
  console.error('[SidePanel] Failed to mount app');
}
