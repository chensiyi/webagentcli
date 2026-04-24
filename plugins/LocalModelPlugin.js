/**
 * Local Model Plugin - 本地小模型配置插件
 * 
 * 功能：
 * 1. 在用户未配置模型或需要快速调整时，加载本地超小模型
 * 2. 提供模型配置界面
 * 3. 模型加载后可访问 PluginManager 和 StorageManager
 * 4. 支持更新配置、安装/卸载其他插件
 */

class LocalModelPlugin {
  static meta = {
    name: 'local-model',
    version: '1.0.0',
    description: '本地小模型配置插件，用于快速配置和测试 AI 模型',
    author: 'Web Agent Client'
  };
  
  constructor() {
    this.context = null;
    this.modelLoaded = false;
    this.modelInstance = null;
  }
  
  /**
   * 初始化插件
   */
  async init(context) {
    this.context = context;
    const { ui, storage, events, log } = context;
    
    log('Initializing Local Model plugin');
    
    // 加载保存的配置
    const savedConfig = await storage.get('modelConfig');
    
    // 注册 UI 面板
    ui.addPanel({
      name: 'local-model-config',
      icon: '🤖',
      title: '本地模型',
      render: () => this.renderConfigPanel(savedConfig)
    });
    
    // 监听配置变更事件
    events.on('model:configChanged', (data) => {
      log('Model config changed:', data);
    });
  }
  
  /**
   * 渲染配置面板
   */
  renderConfigPanel(savedConfig) {
    const { ui, storage, log } = this.context;
    const h = ui.h;
    
    return function LocalModelConfigPanel() {
      const [config, setConfig] = ui.useState(savedConfig || {
        modelPath: '',
        modelSize: 'small',
        autoLoad: false
      });
      const [loading, setLoading] = ui.useState(false);
      const [status, setStatus] = ui.useState('idle'); // idle | loading | ready | error
      
      // 加载模型
      const loadModel = async () => {
        if (!config.modelPath) {
          alert('请先选择模型文件');
          return;
        }
        
        setLoading(true);
        setStatus('loading');
        
        try {
          // TODO: 实现本地模型加载逻辑
          // 这里应该使用 WebLLM、Transformers.js 或其他本地推理引擎
          log('Loading model from:', config.modelPath);
          
          // 模拟加载过程
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 保存配置
          await storage.set('modelConfig', config);
          setStatus('ready');
          
          log('Model loaded successfully');
          
          // 触发配置变更事件
          window.pluginManager?.eventBus?.emit('model:configChanged', {
            modelPath: config.modelPath,
            status: 'ready'
          });
          
        } catch (error) {
          setStatus('error');
          log('Failed to load model:', error);
          alert('模型加载失败: ' + error.message);
        } finally {
          setLoading(false);
        }
      };
      
      // 卸载模型
      const unloadModel = async () => {
        try {
          // TODO: 实现模型卸载逻辑
          await storage.remove('modelConfig');
          setStatus('idle');
          log('Model unloaded');
        } catch (error) {
          log('Failed to unload model:', error);
        }
      };
      
      // 访问插件管理器
      const accessPluginManager = () => {
        const pm = window.pluginManager;
        if (pm) {
          log('PluginManager accessed:', {
            pluginsCount: pm.getPlugins().length,
            eventBus: pm.eventBus
          });
          alert('已成功访问 PluginManager');
        } else {
          alert('PluginManager 不可用');
        }
      };
      
      // 访问存储管理器
      const accessStorage = async () => {
        try {
          const allKeys = await storage.keys();
          log('Storage keys:', allKeys);
          alert('存储键列表: ' + allKeys.join(', '));
        } catch (error) {
          log('Failed to access storage:', error);
        }
      };
      
      // 安装插件示例
      const installPlugin = async () => {
        const url = prompt('输入插件 URL:');
        if (!url) return;
        
        try {
          const success = await window.pluginManager?.loadFromURL(url);
          if (success) {
            alert('插件安装成功');
          } else {
            alert('插件安装失败');
          }
        } catch (error) {
          alert('安装失败: ' + error.message);
        }
      };
      
      const statusColors = {
        idle: '#999',
        loading: '#ff9800',
        ready: '#4caf50',
        error: '#f44336'
      };
      
      const statusText = {
        idle: '未加载',
        loading: '加载中...',
        ready: '已就绪',
        error: '加载失败'
      };
      
      return h('div', { style: { padding: '16px' } },
        // 状态指示器
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            padding: '8px 12px',
            background: '#f5f5f5',
            borderRadius: '6px'
          }
        },
          h('div', {
            style: {
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: statusColors[status]
            }
          }),
          h('span', { style: { fontSize: '13px', color: '#666' } }, 
            '状态: ' + statusText[status]
          )
        ),
        
        // 模型路径配置
        h('div', { style: { marginBottom: '16px' } },
          h('label', {
            style: { display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }
          }, '模型文件路径'),
          h('input', {
            type: 'text',
            value: config.modelPath,
            onInput: (e) => setConfig({ ...config, modelPath: e.target.value }),
            placeholder: 'https://example.com/model.gguf',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px'
            }
          })
        ),
        
        // 模型大小选择
        h('div', { style: { marginBottom: '16px' } },
          h('label', {
            style: { display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }
          }, '模型大小'),
          h('select', {
            value: config.modelSize,
            onChange: (e) => setConfig({ ...config, modelSize: e.target.value }),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px'
            }
          },
            h('option', { value: 'tiny' }, 'Tiny (~100MB)'),
            h('option', { value: 'small' }, 'Small (~500MB)'),
            h('option', { value: 'medium' }, 'Medium (~2GB)')
          )
        ),
        
        // 自动加载开关
        h('div', { style: { marginBottom: '20px' } },
          h('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: '#666',
              cursor: 'pointer'
            }
          },
            h('input', {
              type: 'checkbox',
              checked: config.autoLoad,
              onChange: (e) => setConfig({ ...config, autoLoad: e.target.checked })
            }),
            '启动时自动加载模型'
          )
        ),
        
        // 操作按钮
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          // 加载/卸载模型
          status === 'ready'
            ? h('button', {
                onClick: unloadModel,
                style: {
                  flex: 1,
                  padding: '10px',
                  background: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }
              }, '卸载模型')
            : h('button', {
                onClick: loadModel,
                disabled: loading || !config.modelPath,
                style: {
                  flex: 1,
                  padding: '10px',
                  background: loading ? '#ccc' : '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }
              }, loading ? '加载中...' : '加载模型'),
          
          // 访问 PluginManager
          h('button', {
            onClick: accessPluginManager,
            style: {
              padding: '10px 16px',
              background: '#4caf50',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }
          }, '插件管理'),
          
          // 访问 Storage
          h('button', {
            onClick: accessStorage,
            style: {
              padding: '10px 16px',
              background: '#ff9800',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }
          }, '存储管理'),
          
          // 安装插件
          h('button', {
            onClick: installPlugin,
            style: {
              padding: '10px 16px',
              background: '#9c27b0',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }
          }, '安装插件')
        )
      );
    };
  }
  
  /**
   * 销毁插件
   */
  async destroy() {
    const { log } = this.context;
    log('Destroying Local Model plugin');
    
    // 卸载模型
    if (this.modelInstance) {
      // TODO: 清理模型资源
      this.modelInstance = null;
    }
    
    this.modelLoaded = false;
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  window.LocalModelPlugin = LocalModelPlugin;
}
