// ==================== Plugin Manager ====================
// 插件化管理系统 - 支持动态加载和插件间通信

class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
  
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
  
  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[EventEmitter] Error in listener:', error);
      }
    });
  }
}

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.uiPanels = new Map();
    this.eventBus = new EventEmitter();
  }
  
  // 注册插件
  async register(PluginClass) {
    try {
      const plugin = new PluginClass();
      
      if (!plugin.meta || !plugin.meta.name) {
        throw new Error('Plugin must have meta.name');
      }
      
      if (this.plugins.has(plugin.meta.name)) {
        console.warn(`[PluginManager] Plugin ${plugin.meta.name} already registered`);
        return false;
      }
      
      // 创建沙箱上下文
      const context = this.createSandboxContext(plugin);
      
      // 调用插件初始化
      if (plugin.init) {
        await plugin.init(context);
      }
      
      // 注册成功
      this.plugins.set(plugin.meta.name, {
        instance: plugin,
        meta: plugin.meta,
        enabled: true,
        registeredAt: Date.now()
      });
      
      console.log(`[PluginManager] Plugin registered: ${plugin.meta.name} v${plugin.meta.version}`);
      
      // 触发插件安装事件
      this.eventBus.emit('plugin:registered', {
        name: plugin.meta.name,
        version: plugin.meta.version
      });
      
      return true;
    } catch (error) {
      console.error(`[PluginManager] Failed to register plugin:`, error);
      return false;
    }
  }
  
  // 卸载插件
  async unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      console.warn(`[PluginManager] Plugin ${pluginName} not found`);
      return false;
    }
    
    try {
      // 调用销毁方法
      if (plugin.instance.destroy) {
        await plugin.instance.destroy();
      }
      
      // 清理 UI 面板
      this.uiPanels.forEach((panel, key) => {
        if (panel.pluginName === pluginName) {
          this.uiPanels.delete(key);
        }
      });
      
      // 移除插件
      this.plugins.delete(pluginName);
      
      console.log(`[PluginManager] Plugin unregistered: ${pluginName}`);
      
      // 触发卸载事件
      this.eventBus.emit('plugin:unregistered', { name: pluginName });
      
      return true;
    } catch (error) {
      console.error(`[PluginManager] Failed to unregister plugin:`, error);
      return false;
    }
  }
  
  // 启用/禁用插件
  setEnabled(pluginName, enabled) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;
    
    plugin.enabled = enabled;
    console.log(`[PluginManager] Plugin ${pluginName} ${enabled ? 'enabled' : 'disabled'}`);
    
    this.eventBus.emit('plugin:toggled', { name: pluginName, enabled });
    return true;
  }
  
  // 获取所有插件列表
  getPlugins() {
    return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
      name,
      ...plugin.meta,
      enabled: plugin.enabled,
      registeredAt: plugin.registeredAt
    }));
  }
  
  // 获取单个插件信息
  getPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return null;
    return {
      name,
      ...plugin.meta,
      enabled: plugin.enabled,
      registeredAt: plugin.registeredAt
    };
  }
  
  // 获取所有 UI 面板
  getUIPanels() {
    return Array.from(this.uiPanels.entries()).map(([name, panel]) => ({
      name,
      ...panel,
      pluginName: panel.pluginName
    }));
  }
  
  // 创建沙箱上下文
  createSandboxContext(plugin) {
    const pluginName = plugin.meta.name;
    
    return {
      // UI 接口 - 提供 Preact 能力
      ui: {
        h: window.React.createElement,
        useState: window.React.useState,
        useEffect: window.React.useEffect,
        
        // 注册 UI 面板
        addPanel: (panelDef) => {
          if (!panelDef.name || !panelDef.render) {
            throw new Error('Panel must have name and render function');
          }
          
          this.uiPanels.set(panelDef.name, {
            ...panelDef,
            pluginName
          });
          
          console.log(`[PluginManager] Panel registered: ${panelDef.name}`);
        },
        
        // 移除面板
        removePanel: (panelName) => {
          const panel = this.uiPanels.get(panelName);
          if (panel && panel.pluginName === pluginName) {
            this.uiPanels.delete(panelName);
            console.log(`[PluginManager] Panel removed: ${panelName}`);
          }
        }
      },
      
      // 存储 - 带命名空间隔离
      storage: {
        get: async (key) => {
          const namespacedKey = `plugin:${pluginName}:${key}`;
          const result = await chrome.storage.local.get(namespacedKey);
          return result[namespacedKey];
        },
        
        set: async (key, value) => {
          const namespacedKey = `plugin:${pluginName}:${key}`;
          return chrome.storage.local.set({ [namespacedKey]: value });
        },
        
        remove: async (key) => {
          const namespacedKey = `plugin:${pluginName}:${key}`;
          return chrome.storage.local.remove(namespacedKey);
        },
        
        clear: async () => {
          const result = await chrome.storage.local.get(null);
          const keysToRemove = Object.keys(result).filter(key => 
            key.startsWith(`plugin:${pluginName}:`)
          );
          if (keysToRemove.length > 0) {
            return chrome.storage.local.remove(keysToRemove);
          }
        }
      },
      
      // 插件间通信 - 受控的事件总线
      events: {
        on: (event, handler) => {
          const fullEvent = `plugin:${pluginName}:${event}`;
          this.eventBus.on(fullEvent, handler);
          
          // 返回取消订阅函数
          return () => this.eventBus.off(fullEvent, handler);
        },
        
        emit: (event, data) => {
          this.eventBus.emit(event, { 
            from: pluginName, 
            data,
            timestamp: Date.now()
          });
        },
        
        // 监听全局事件
        onGlobal: (event, handler) => {
          this.eventBus.on(event, handler);
          return () => this.eventBus.off(event, handler);
        }
      },
      
      // 日志
      log: (...args) => {
        console.log(`[Plugin:${pluginName}]`, ...args);
      },
      
      warn: (...args) => {
        console.warn(`[Plugin:${pluginName}]`, ...args);
      },
      
      error: (...args) => {
        console.error(`[Plugin:${pluginName}]`, ...args);
      }
    };
  }
  
  // 从 URL 加载插件代码
  async loadFromURL(url) {
    try {
      const response = await fetch(url);
      const code = await response.text();
      return this.loadFromCode(code);
    } catch (error) {
      console.error('[PluginManager] Failed to load plugin from URL:', error);
      return false;
    }
  }
  
  // 从代码字符串加载插件
  async loadFromCode(code) {
    try {
      // 通过 Blob URL 加载执行
      const PluginClass = await this.evaluateCode(code);
      
      if (!PluginClass || typeof PluginClass !== 'function') {
        throw new Error('Invalid plugin code: must export a class');
      }
      
      return this.register(PluginClass);
    } catch (error) {
      console.error('[PluginManager] Failed to evaluate plugin code:', error);
      return false;
    }
  }
  
  // 评估插件代码（通过动态 script 标签加载）
  evaluateCode(code) {
    return new Promise((resolve, reject) => {
      try {
        // 从代码中提取类名
        const classMatch = code.match(/class\s+(\w+)\s+extends\s+/);
        const className = classMatch ? classMatch[1] : null;
        
        if (!className) {
          reject(new Error('Invalid plugin code: cannot find class declaration'));
          return;
        }
        
        // 创建 Blob URL 并加载为 script
        const blob = new Blob([code], { type: 'application/javascript' });
        const scriptUrl = URL.createObjectURL(blob);
        
        const script = document.createElement('script');
        script.src = scriptUrl;
        
        script.onload = () => {
          // 获取全局暴露的类
          const PluginClass = window[className];
          
          // 清理
          URL.revokeObjectURL(scriptUrl);
          document.head.removeChild(script);
          
          if (typeof PluginClass === 'function') {
            resolve(PluginClass);
          } else {
            reject(new Error('Plugin class not found after execution'));
          }
        };
        
        script.onerror = () => {
          URL.revokeObjectURL(scriptUrl);
          reject(new Error('Failed to load plugin script'));
        };
        
        document.head.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// 导出到全局
window.PluginManager = PluginManager;
console.log('[PluginManager] Loaded');
