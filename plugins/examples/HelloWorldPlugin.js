// ==================== 示例插件 - Hello World ====================
// 演示插件的基本用法

class HelloWorldPlugin {
  static meta = {
    name: 'hello-world',
    version: '1.0.0',
    description: 'Hello World 示例插件',
    author: 'Web Agent Client'
  };
  
  init({ ui, storage, events, log }) {
    log('Initializing Hello World plugin');
    
    // 1. 注册 UI 面板
    ui.addPanel({
      name: 'hello-panel',
      icon: '👋',
      title: 'Hello World',
      render: () => {
        const [count, setCount] = ui.useState(0);
        const [message, setMessage] = ui.useState('');
        
        // 加载保存的消息
        ui.useEffect(() => {
          storage.get('message').then(saved => {
            if (saved) setMessage(saved);
          });
        }, []);
        
        // 保存消息
        const saveMessage = async () => {
          await storage.set('message', message);
          log('Message saved:', message);
        };
        
        return ui.h('div', { style: { padding: '16px' } },
          ui.h('h3', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, 'Hello World'),
          ui.h('p', { style: { fontSize: '14px', color: '#666', marginBottom: '16px' } }, 
            '这是一个示例插件，展示如何创建 UI 和使用存储'),
          
          // 计数器
          ui.h('div', { style: { marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '8px' } },
            ui.h('p', { style: { fontSize: '14px', marginBottom: '8px' } }, '点击次数: ' + count),
            ui.h('button', {
              onClick: () => setCount(count + 1),
              style: {
                padding: '8px 16px',
                background: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }
            }, '点击我')
          ),
          
          // 消息输入
          ui.h('div', null,
            ui.h('label', { style: { display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' } }, '保存消息'),
            ui.h('input', {
              type: 'text',
              value: message,
              onInput: (e) => setMessage(e.target.value),
              placeholder: '输入消息...',
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '8px'
              }
            }),
            ui.h('button', {
              onClick: saveMessage,
              style: {
                padding: '8px 16px',
                background: '#4caf50',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }
            }, '保存')
          )
        );
      }
    });
    
    // 2. 监听事件
    events.onGlobal('plugin:registered', (data) => {
      log('New plugin registered:', data.name);
    });
    
    log('Hello World plugin initialized');
  }
  
  destroy() {
    console.log('[HelloWorldPlugin] Destroyed');
  }
}

// 自动注册（如果在浏览器环境中）
if (typeof window !== 'undefined' && window.PluginManager) {
  window.HelloWorldPlugin = HelloWorldPlugin;
  console.log('[HelloWorldPlugin] Loaded');
}
