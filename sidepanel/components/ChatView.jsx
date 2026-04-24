// ==================== Chat View ====================
// 聊天窗口组件

const { useState, useEffect } = window.React;

function ChatView({ sessionId, sendMessage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 加载历史消息
  useEffect(() => {
    loadHistory();
  }, [sessionId]);
  
  async function loadHistory() {
    try {
      const response = await sendMessage('GET_CONTEXT', { sessionId });
      if (response.success && response.data) {
        // 过滤掉 system 消息，只显示用户和 AI 的对话
        const userMessages = response.data.filter(m => m.role !== 'system');
        setMessages(userMessages);
      }
    } catch (error) {
      console.error('[ChatView] Failed to load history:', error);
    }
  }
  
  // 发送消息
  async function handleSend() {
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // 保存到 Runtime
      await sendMessage('ADD_MESSAGE', {
        sessionId,
        role: 'user',
        content: input
      });
      
      // TODO: 调用 AI API
      // 现在返回测试响应
      const aiResponse = {
        role: 'assistant',
        content: `收到你的消息！\n\n当前会话: ${sessionId}\n这是一个测试响应，AI 集成功能即将上线。`
      };
      
      setMessages(prev => [...prev, aiResponse]);
      
      await sendMessage('ADD_MESSAGE', {
        sessionId,
        role: 'assistant',
        content: aiResponse.content
      });
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
  
  // 清除会话
  async function handleClear() {
    if (!confirm('确定要清除当前会话吗？')) return;
    
    await sendMessage('CLEAR_SESSION', { sessionId });
    setMessages([]);
  }
  
  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#f5f5f5'
    }}>
      {/* 聊天头部 */}
      <div style={{
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
            聊天窗口
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
            {messages.length} 条消息
          </div>
        </div>
        <button 
          onClick={handleClear}
          style={{
            padding: '6px 12px',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#666'
          }}
        >
          清除
        </button>
      </div>
      
      {/* 消息列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#999', 
            marginTop: '60px',
            padding: '0 20px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>
              开始对话吧！
            </p>
            <p style={{ fontSize: '12px', color: '#bbb' }}>
              向 AI 描述你想完成的任务
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '12px',
                background: msg.role === 'user' ? '#1976d2' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                whiteSpace: 'pre-wrap',
                fontSize: '14px',
                lineHeight: '1.5'
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'flex-start'
          }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              color: '#999',
              fontSize: '14px'
            }}>
              AI 思考中...
            </div>
          </div>
        )}
      </div>
      
      {/* 输入框 */}
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
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入消息... (Enter 发送)"
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              disabled: { opacity: 0.5 }
            }}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              padding: '10px 20px',
              background: isLoading || !input.trim() ? '#ccc' : '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

window.ChatView = ChatView;
