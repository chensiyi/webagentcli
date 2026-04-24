// ==================== History View ====================
// 会话历史页面

const { useState, useEffect } = window.React;

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
      
      // 过滤出所有 session_ 开头的存储项
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
  
  async function handleSwitch(id) {
    onSwitchSession(id);
  }
  
  async function handleDelete(id) {
    if (!confirm('确定要删除这个会话吗？')) return;
    
    try {
      await chrome.storage.local.remove(`session_${id}`);
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
    
    // 小于 1 小时
    if (diff < 3600000) {
      return Math.floor(diff / 60000) + ' 分钟前';
    }
    // 小于 24 小时
    if (diff < 86400000) {
      return Math.floor(diff / 3600000) + ' 小时前';
    }
    // 大于 24 小时
    return date.toLocaleDateString('zh-CN');
  }
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100%',
        color: '#999'
      }}>
        加载中...
      </div>
    );
  }
  
  return (
    <div style={{ 
      height: '100%', 
      overflowY: 'auto',
      background: '#f5f5f5',
      padding: '16px'
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>
          会话历史
        </h2>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
          共 {sessions.length} 个会话
        </p>
      </div>
      
      {sessions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          color: '#999',
          marginTop: '60px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <p>暂无会话历史</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>
            开始新对话后将自动保存
          </p>
        </div>
      ) : (
        sessions.map((session, idx) => (
          <div 
            key={idx}
            style={{
              background: session.id === sessionId.replace('session_', '') ? '#e3f2fd' : '#fff',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              if (session.id !== sessionId.replace('session_', '')) {
                e.currentTarget.style.background = '#fafafa';
              }
            }}
            onMouseLeave={e => {
              if (session.id !== sessionId.replace('session_', '')) {
                e.currentTarget.style.background = '#fff';
              }
            }}
          >
            {/* 会话头部 */}
            <div 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
              }}
              onClick={() => handleSwitch(session.id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: session.id === sessionId.replace('session_', '') ? '#1976d2' : '#333',
                  marginBottom: '4px'
                }}>
                  会话 {session.id.substring(0, 8)}...
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#666',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {session.lastMessage}
                </div>
              </div>
              <div style={{
                fontSize: '11px',
                color: '#999',
                marginLeft: '12px',
                whiteSpace: 'nowrap'
              }}>
                {formatTime(session.updatedAt || session.createdAt)}
              </div>
            </div>
            
            {/* 会话信息 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#999'
            }}>
              <span>{session.messages?.length || 0} 条消息</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(session.id);
                }}
                style={{
                  padding: '3px 10px',
                  background: 'transparent',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: '#f44336'
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

window.HistoryView = HistoryView;
