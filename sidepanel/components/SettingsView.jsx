// ==================== Settings View ====================
// 设置页面

const { useState, useEffect } = window.React;

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
      if (result.settings) {
        setSettings(prev => ({ ...prev, ...result.settings }));
      }
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
  
  return (
    <div style={{ 
      height: '100%', 
      overflowY: 'auto',
      background: '#f5f5f5',
      padding: '16px'
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>
          设置
        </h2>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
          配置 AI API 和模型参数
        </p>
      </div>
      
      {/* API 配置 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
          API 配置
        </h3>
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            API Key
          </label>
          <input
            type="password"
            value={settings.apiKey}
            onInput={e => handleChange('apiKey', e.target.value)}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            API 端点
          </label>
          <input
            type="text"
            value={settings.apiEndpoint}
            onInput={e => handleChange('apiEndpoint', e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>
      
      {/* 模型配置 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
          模型配置
        </h3>
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            模型名称
          </label>
          <input
            type="text"
            value={settings.model}
            onInput={e => handleChange('model', e.target.value)}
            placeholder="openai/gpt-4o"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            Temperature: {settings.temperature}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onInput={e => handleChange('temperature', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#999' }}>
            <span>精确 (0)</span>
            <span>随机 (2)</span>
          </div>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            Max Tokens
          </label>
          <input
            type="number"
            value={settings.maxTokens}
            onInput={e => handleChange('maxTokens', parseInt(e.target.value))}
            min="100"
            max="32000"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>
      
      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        style={{
          width: '100%',
          padding: '12px',
          background: saved ? '#4caf50' : '#1976d2',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
        }}
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>
      
      {/* 说明 */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        background: '#fff3e0',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#e65100',
        lineHeight: '1.6'
      }}>
        <strong>提示：</strong>
        <br />
        • 推荐使用 OpenRouter: https://openrouter.ai
        <br />
        • API Key 仅存储在本地浏览器中
        <br />
        • AI 集成功能即将上线
      </div>
    </div>
  );
}

window.SettingsView = SettingsView;
