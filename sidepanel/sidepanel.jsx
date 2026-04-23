// ==================== Side Panel App ====================
// Preact 应用

const { useState, useEffect } = window.React;

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId] = useState('session_' + Date.now());
  const [tools, setTools] = useState([]);
  
  // 加载工具列表
  useEffect(() => {
    loadTools();
  }, []);
  
  async function loadTools() {
    try {
      const response = await sendMessage('GET_TOOLS', {});
      if (response.success) {
        setTools(response.data);
        console.log('[SidePanel] Tools loaded:', response.data.length);
      }
    } catch (error) {
      console.error('[SidePanel] Failed to load tools:', error);
    }
  }
  
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
  
  // 发送用户消息
  async function handleSend() {
    if (!input.trim()) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // 保存到 Runtime
    await sendMessage('ADD_MESSAGE', {
      sessionId,
      role: 'user',
      content: input
    });
    
    // TODO: 调用 AI API
    const aiResponse = {
      role: 'assistant',
      content: '收到！这是一个测试响应。工具数量: ' + tools.length
    };
    
    setMessages(prev => [...prev, aiResponse]);
    
    await sendMessage('ADD_MESSAGE', {
      sessionId,
      role: 'assistant',
      content: aiResponse.content
    });
  }
  
  // 清除会话
  async function handleClear() {
    await sendMessage('CLEAR_SESSION', { sessionId });
    setMessages([]);
  }
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Web Agent</h2>
        <button onClick={handleClear} style={{
          padding: '6px 12px',
          background: '#f0f0f0',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }}>
          清除
        </button>
      </div>
      
      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
            <p>开始对话吧！</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>
              已加载 {tools.length} 个工具
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{
              marginBottom: '12px',
              padding: '12px',
              borderRadius: '8px',
              background: msg.role === 'user' ? '#e3f2fd' : '#fff',
              marginLeft: msg.role === 'user' ? '40px' : '0',
              marginRight: msg.role === 'user' ? '0' : '40px'
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                {msg.role === 'user' ? '你' : 'AI'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>
      
      {/* Input */}
      <div style={{
        padding: '16px',
        background: '#fff',
        borderTop: '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onInput={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button onClick={handleSend} style={{
            padding: '10px 20px',
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

// 挂载应用
const root = document.getElementById('root');
if (root && window.React) {
  window.React.render(window.React.createElement(App), root);
  console.log('[SidePanel] App mounted');
} else {
  console.error('[SidePanel] Failed to mount app');
}
