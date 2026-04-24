// ==================== Tools View ====================
// 工具注册页面

const { useState, useEffect } = window.React;

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
      if (response.success) {
        setTools(response.data);
      }
    } catch (error) {
      console.error('[ToolsView] Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // 测试工具
  async function testTool(toolName) {
    try {
      let params = {};
      
      // 根据工具类型设置测试参数
      if (toolName === 'read_page' || toolName === 'click_element') {
        params = { selector: 'title' };
      } else if (toolName === 'fill_form') {
        params = { selector: 'input', value: 'test' };
      }
      
      const response = await sendMessage('EXECUTE_TOOL', {
        toolName,
        params
      });
      
      alert(`工具测试结果:\n${JSON.stringify(response, null, 2)}`);
    } catch (error) {
      alert('测试失败: ' + error.message);
    }
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
      <div style={{
        marginBottom: '20px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>
          工具注册
        </h2>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
          共 {tools.length} 个可用工具
        </p>
      </div>
      
      {tools.map((tool, idx) => (
        <div key={idx} style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#1976d2',
                marginBottom: '4px'
              }}>
                {tool.function.name}
              </h3>
              <p style={{ fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
                {tool.function.description}
              </p>
            </div>
            <button
              onClick={() => testTool(tool.function.name)}
              style={{
                padding: '4px 12px',
                background: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#666',
                marginLeft: '12px'
              }}
            >
              测试
            </button>
          </div>
          
          {/* 参数信息 */}
          {tool.function.parameters?.properties && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              background: '#f9f9f9',
              borderRadius: '6px',
              fontSize: '11px'
            }}>
              <div style={{ fontWeight: '600', color: '#666', marginBottom: '6px' }}>
                参数:
              </div>
              {Object.entries(tool.function.parameters.properties).map(([key, value]) => (
                <div key={key} style={{ 
                  marginBottom: '4px',
                  color: '#888'
                }}>
                  <span style={{ color: '#333', fontWeight: '500' }}>{key}</span>
                  {value.description && ` - ${value.description}`}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      
      {tools.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: '#999',
          marginTop: '60px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔧</div>
          <p>暂无可用工具</p>
        </div>
      )}
    </div>
  );
}

window.ToolsView = ToolsView;
