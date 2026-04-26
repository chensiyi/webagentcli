// ==================== User Script Manager ====================
// 用户脚本管理器 - 兼容 Tampermonkey API

class UserScriptManager {
  constructor() {
    this.scripts = new Map();
    
    // 加载已安装的脚本
    this.loadInstalledScripts();
  }

  // 从 storage 加载已安装脚本
  async loadInstalledScripts() {
    const installedScripts = await window.UserScriptStorage.loadInstalledScripts(this.scripts);
    
    // 执行启用的脚本
    for (const scriptInfo of installedScripts) {
      if (scriptInfo.enabled) {
        await this.executeScript(scriptInfo.id);
      }
    }
  }

  // 安装脚本（从代码）
  async installFromCode(code) {
    try {
      const metadata = window.UserScriptMetadata.parseMetadata(code);
      
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
      await window.UserScriptStorage.saveScriptCode(id, code);
      
      // 添加到列表
      this.scripts.set(id, scriptInfo);
      await window.UserScriptStorage.saveInstalledScripts(this.scripts);
      
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
      if (scriptInfo && !window.UserScriptMetadata.matchesURL(tab.url, scriptInfo)) {
        console.log('[UserScriptManager] URL does not match script rules');
        return false;
      }
      
      // 获取脚本代码
      const code = await window.UserScriptStorage.getScriptCode(scriptId);
      
      if (!code) {
        console.error('[UserScriptManager] Script code not found:', scriptId);
        return false;
      }
      
      // 创建沙箱上下文并包装代码
      const sandboxContext = window.UserScriptSandbox.createSandboxContext(scriptId, scriptInfo);
      const wrappedCode = window.UserScriptSandbox.wrapCode(code, sandboxContext);
      
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

  // 启用/禁用脚本
  async toggleScript(scriptId, enabled) {
    const scriptInfo = this.scripts.get(scriptId);
    if (!scriptInfo) {
      return false;
    }
    
    scriptInfo.enabled = enabled;
    scriptInfo.updatedAt = Date.now();
    
    await window.UserScriptStorage.saveInstalledScripts(this.scripts);
    
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
    await window.UserScriptStorage.deleteScript(scriptId);
    
    // 从列表移除
    this.scripts.delete(scriptId);
    await window.UserScriptStorage.saveInstalledScripts(this.scripts);
    
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
    return await window.UserScriptStorage.getScriptCode(scriptId);
  }

  // 更新脚本代码
  async updateScriptCode(scriptId, newCode) {
    const scriptInfo = this.scripts.get(scriptId);
    if (!scriptInfo) {
      return false;
    }
    
    const metadata = window.UserScriptMetadata.parseMetadata(newCode);
    if (metadata) {
      scriptInfo.name = metadata.name || scriptInfo.name;
      scriptInfo.version = metadata.version || scriptInfo.version;
      scriptInfo.description = metadata.description || scriptInfo.description;
      scriptInfo.matches = metadata.match || metadata.include || scriptInfo.matches;
      scriptInfo.excludes = metadata.exclude || scriptInfo.excludes;
    }
    
    scriptInfo.updatedAt = Date.now();
    
    await window.UserScriptStorage.saveScriptCode(scriptId, newCode);
    await window.UserScriptStorage.saveInstalledScripts(this.scripts);
    
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
