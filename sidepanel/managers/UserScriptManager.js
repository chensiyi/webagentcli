// ==================== User Script Manager ====================
// 用户脚本管理器 - 兼容 Tampermonkey API

class UserScriptManager {
  constructor() {
    this.scripts = new Map();
    this.scriptElements = new Map();
    
    // 加载已安装的脚本
    this.loadInstalledScripts();
  }

  // 从 storage 加载已安装脚本
  async loadInstalledScripts() {
    try {
      const result = await chrome.storage.local.get('installedScripts');
      const installedScripts = result.installedScripts || [];
      
      for (const scriptInfo of installedScripts) {
        const codeResult = await chrome.storage.local.get(`script_code_${scriptInfo.id}`);
        const code = codeResult[`script_code_${scriptInfo.id}`];
        
        if (code && scriptInfo.enabled) {
          await this.executeScript(scriptInfo.id);
        }
        
        this.scripts.set(scriptInfo.id, scriptInfo);
      }
      
      console.log('[UserScriptManager] Loaded', installedScripts.length, 'scripts');
    } catch (error) {
      console.error('[UserScriptManager] Failed to load scripts:', error);
    }
  }

  // 保存脚本列表到 storage
  async saveInstalledScripts() {
    const scriptList = Array.from(this.scripts.values());
    await chrome.storage.local.set({ installedScripts: scriptList });
  }

  // 解析用户脚本元数据
  parseMetadata(code) {
    const metadata = {};
    const metaMatch = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    
    if (!metaMatch) {
      return null;
    }
    
    const metaBlock = metaMatch[1];
    const lines = metaBlock.split('\n');
    
    for (const line of lines) {
      const match = line.match(/\/\/\s*@(\S+)\s+(.+)/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        
        if (key === 'match' || key === 'include' || key === 'exclude') {
          if (!metadata[key]) {
            metadata[key] = [];
          }
          metadata[key].push(value);
        } else {
          metadata[key] = value;
        }
      }
    }
    
    return metadata;
  }

  // 安装脚本（从代码）
  async installFromCode(code) {
    try {
      const metadata = this.parseMetadata(code);
      
      if (!metadata) {
        throw new Error('Invalid user script format: missing UserScript metadata block');
      }
      
      const id = `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const scriptInfo = {
        id,
        name: metadata.name || 'Unnamed Script',
        version: metadata.version || '1.0.0',
        description: metadata.description || '',
        namespace: metadata.namespace || '',
        author: metadata.author || '',
        matches: metadata.match || metadata.include || ['*://*/*'],
        excludes: metadata.exclude || [],
        enabled: true,
        installedAt: Date.now(),
        updatedAt: Date.now()
      };
      
      // 保存脚本代码
      await chrome.storage.local.set({
        [`script_code_${id}`]: code
      });
      
      // 添加到列表
      this.scripts.set(id, scriptInfo);
      await this.saveInstalledScripts();
      
      // 如果启用，立即执行
      if (scriptInfo.enabled) {
        await this.executeScript(id);
      }
      
      console.log('[UserScriptManager] Script installed:', scriptInfo.name);
      return scriptInfo;
    } catch (error) {
      console.error('[UserScriptManager] Failed to install script:', error);
      throw error;
    }
  }

  // 从 URL 安装脚本
  async installFromURL(url) {
    try {
      const response = await fetch(url);
      const code = await response.text();
      return this.installFromCode(code);
    } catch (error) {
      console.error('[UserScriptManager] Failed to load script from URL:', error);
      throw error;
    }
  }

  // 执行脚本（注入到当前页面）
  async executeScript(scriptId) {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        console.warn('[UserScriptManager] No active tab found');
        return false;
      }
      
      // 检查 URL 是否匹配
      const scriptInfo = this.scripts.get(scriptId);
      if (scriptInfo && !this.matchesURL(tab.url, scriptInfo)) {
        console.log('[UserScriptManager] URL does not match script rules');
        return false;
      }
      
      // 获取脚本代码
      const result = await chrome.storage.local.get(`script_code_${scriptId}`);
      const code = result[`script_code_${scriptId}`];
      
      if (!code) {
        console.error('[UserScriptManager] Script code not found:', scriptId);
        return false;
      }
      
      // 创建沙箱上下文
      const sandboxContext = this.createSandboxContext(scriptId);
      
      // 包装代码，注入 GM API
      const wrappedCode = `
(function() {
  'use strict';
  
  const GM = {
    getValue: ${sandboxContext.GM.getValue.toString()},
    setValue: ${sandboxContext.GM.setValue.toString()},
    deleteValue: ${sandboxContext.GM.deleteValue.toString()},
    listValues: ${sandboxContext.GM.listValues.toString()},
    addStyle: ${sandboxContext.GM.addStyle.toString()},
    log: ${sandboxContext.GM.log.toString()},
    info: ${JSON.stringify(sandboxContext.GM.info)}
  };
  
  const GM_getValue = GM.getValue;
  const GM_setValue = GM.setValue;
  const GM_deleteValue = GM.deleteValue;
  const GM_listValues = GM.listValues;
  const GM_addStyle = GM.addStyle;
  const GM_log = GM.log;
  const GM_info = GM.info;
  
  ${code}
})();
`;
      
      // 注入到网页 MAIN world
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (code, scriptId) => {
          // 清理旧脚本
          const oldScript = document.getElementById(`userscript-${scriptId}`);
          if (oldScript) oldScript.remove();
          
          // 注入新脚本
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.textContent = code;
          script.id = `userscript-${scriptId}`;
          (document.head || document.documentElement).appendChild(script);
        },
        args: [wrappedCode, scriptId]
      });
      
      console.log('[UserScriptManager] Script executed:', scriptId);
      return true;
    } catch (error) {
      console.error('[UserScriptManager] Failed to execute script:', error);
      return false;
    }
  }

  // 检查 URL 是否匹配脚本规则
  matchesURL(url, scriptInfo) {
    if (!scriptInfo.matches || scriptInfo.matches.length === 0) {
      return true;
    }
    
    // 检查排除规则
    if (scriptInfo.excludes) {
      for (const pattern of scriptInfo.excludes) {
        if (this.matchPattern(url, pattern)) {
          return false;
        }
      }
    }
    
    // 检查包含规则
    for (const pattern of scriptInfo.matches) {
      if (this.matchPattern(url, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  // 匹配 URL 模式（简化版）
  matchPattern(url, pattern) {
    if (pattern === '*://*/*') {
      return true;
    }
    
    // 转换为正则表达式
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?');
    
    const fullRegex = new RegExp('^' + regex + '$');
    return fullRegex.test(url);
  }

  // 创建沙箱上下文
  createSandboxContext(scriptId) {
    const scriptInfo = this.scripts.get(scriptId);
    
    return {
      GM: {
        // 存储 API
        getValue: async (key, defaultValue) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          const result = await chrome.storage.local.get(namespacedKey);
          return result[namespacedKey] !== undefined ? result[namespacedKey] : defaultValue;
        },
        
        setValue: async (key, value) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          await chrome.storage.local.set({ [namespacedKey]: value });
        },
        
        deleteValue: async (key) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          await chrome.storage.local.remove(namespacedKey);
        },
        
        listValues: async () => {
          const result = await chrome.storage.local.get(null);
          return Object.keys(result)
            .filter(key => key.startsWith(`gm:${scriptId}:`))
            .map(key => key.replace(`gm:${scriptId}:`, ''));
        },
        
        // 样式 API
        addStyle: (css) => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          return style;
        },
        
        // 日志 API
        log: (...args) => {
          console.log(`[GM:${scriptInfo?.name || scriptId}]`, ...args);
        },
        
        // 脚本信息
        info: {
          script: {
            name: scriptInfo?.name || '',
            version: scriptInfo?.version || '',
            description: scriptInfo?.description || '',
            namespace: scriptInfo?.namespace || ''
          }
        }
      }
    };
  }

  // 启用/禁用脚本
  async toggleScript(scriptId, enabled) {
    const scriptInfo = this.scripts.get(scriptId);
    if (!scriptInfo) {
      return false;
    }
    
    scriptInfo.enabled = enabled;
    scriptInfo.updatedAt = Date.now();
    
    await this.saveInstalledScripts();
    
    // 如果禁用，移除已注入的脚本
    if (!enabled) {
      await this.removeScriptFromPage(scriptId);
    } else {
      // 如果启用，重新执行
      await this.executeScript(scriptId);
    }
    
    console.log('[UserScriptManager] Script', scriptInfo.name, enabled ? 'enabled' : 'disabled');
    return true;
  }

  // 删除脚本
  async deleteScript(scriptId) {
    const scriptInfo = this.scripts.get(scriptId);
    if (!scriptInfo) {
      return false;
    }
    
    // 从页面移除
    await this.removeScriptFromPage(scriptId);
    
    // 从 storage 删除
    await chrome.storage.local.remove([
      `script_code_${scriptId}`,
      ...Array.from(this.scripts.keys()).map(id => `gm:${id}:*`)
    ]);
    
    // 从列表移除
    this.scripts.delete(scriptId);
    await this.saveInstalledScripts();
    
    console.log('[UserScriptManager] Script deleted:', scriptInfo.name);
    return true;
  }

  // 从页面移除脚本
  async removeScriptFromPage(scriptId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (scriptId) => {
          const scriptElement = document.getElementById(`userscript-${scriptId}`);
          if (scriptElement) {
            scriptElement.remove();
          }
        },
        args: [scriptId]
      });
    } catch (error) {
      console.error('[UserScriptManager] Failed to remove script from page:', error);
    }
  }

  // 获取所有脚本
  getScripts() {
    return Array.from(this.scripts.values());
  }

  // 获取单个脚本
  getScript(scriptId) {
    return this.scripts.get(scriptId);
  }

  // 获取脚本代码
  async getScriptCode(scriptId) {
    const result = await chrome.storage.local.get(`script_code_${scriptId}`);
    return result[`script_code_${scriptId}`];
  }

  // 更新脚本代码
  async updateScriptCode(scriptId, newCode) {
    const scriptInfo = this.scripts.get(scriptId);
    if (!scriptInfo) {
      return false;
    }
    
    const metadata = this.parseMetadata(newCode);
    if (metadata) {
      scriptInfo.name = metadata.name || scriptInfo.name;
      scriptInfo.version = metadata.version || scriptInfo.version;
      scriptInfo.description = metadata.description || scriptInfo.description;
      scriptInfo.matches = metadata.match || metadata.include || scriptInfo.matches;
      scriptInfo.excludes = metadata.exclude || scriptInfo.excludes;
    }
    
    scriptInfo.updatedAt = Date.now();
    
    await chrome.storage.local.set({
      [`script_code_${scriptId}`]: newCode
    });
    
    await this.saveInstalledScripts();
    
    // 如果启用，重新执行
    if (scriptInfo.enabled) {
      await this.executeScript(scriptId);
    }
    
    return true;
  }
}

// 导出到全局
window.UserScriptManager = UserScriptManager;
console.log('[UserScriptManager] Loaded');
