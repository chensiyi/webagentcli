// ==================== Main App ====================
// 主应用 - 页面路由和布局

const { useState, useEffect } = window.React;

// 页面类型
const PAGES = {
  CHAT: 'chat',
  TOOLS: 'tools',
  SETTINGS: 'settings',
  HISTORY: 'history'
};

function App() {
  const [currentPage, setCurrentPage] = useState(PAGES.CHAT);
  const [sessionId, setSessionId] = useState('session_' + Date.now());
  
  // 发送消息到 Background
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
  
  // 渲染当前页面
  function renderPage() {
    switch (currentPage) {
      case PAGES.CHAT:
        return <ChatView sessionId={sessionId} sendMessage={sendMessage} />;
      case PAGES.TOOLS:
        return <ToolsView sendMessage={sendMessage} />;
      case PAGES.SETTINGS:
        return <SettingsView sendMessage={sendMessage} />;
      case PAGES.HISTORY:
        return <HistoryView 
          sessionId={sessionId} 
          sendMessage={sendMessage} 
          onSwitchSession={(id) => setSessionId(id)}
        />;
      default:
        return <ChatView sessionId={sessionId} sendMessage={sendMessage} />;
    }
  }
  
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#fff'
    }}>
      {/* 顶部标题栏 */}
      <Header />
      
      {/* 主内容区 + 右侧工具栏 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {renderPage()}
        </div>
        
        {/* 右侧工具栏 */}
        <Sidebar 
          currentPage={currentPage} 
          onNavigate={setCurrentPage} 
        />
      </div>
    </div>
  );
}

// ==================== Header 组件 ====================
function Header() {
  return (
    <div style={{
      padding: '12px 16px',
      background: '#1976d2',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: '600' }}>
        Web Agent Client
      </h1>
      <div style={{ fontSize: '12px', opacity: 0.9 }}>
        v0.1.0
      </div>
    </div>
  );
}

// ==================== Sidebar 组件 ====================
function Sidebar({ currentPage, onNavigate }) {
  const menuItems = [
    { id: PAGES.CHAT, icon: '💬', label: '聊天' },
    { id: PAGES.TOOLS, icon: '🔧', label: '工具' },
    { id: PAGES.HISTORY, icon: '📋', label: '历史' },
    { id: PAGES.SETTINGS, icon: '⚙️', label: '设置' }
  ];
  
  return (
    <div style={{
      width: '60px',
      background: '#fafafa',
      borderLeft: '1px solid #e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: '8px'
    }}>
      {menuItems.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={{
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
            gap: '2px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            if (currentPage !== item.id) {
              e.target.style.background = '#f0f0f0';
            }
          }}
          onMouseLeave={e => {
            if (currentPage !== item.id) {
              e.target.style.background = 'transparent';
            }
          }}
        >
          <span style={{ fontSize: '20px' }}>{item.icon}</span>
          <span style={{ 
            fontSize: '10px', 
            color: currentPage === item.id ? '#1976d2' : '#666' 
          }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// 导出供 sidepanel.jsx 使用
window.ChatView = null;
window.ToolsView = null;
window.SettingsView = null;
window.HistoryView = null;

// 挂载应用
const root = document.getElementById('root');
if (root && window.React) {
  window.React.render(window.React.createElement(App), root);
  console.log('[SidePanel] App mounted');
} else {
  console.error('[SidePanel] Failed to mount app');
}
