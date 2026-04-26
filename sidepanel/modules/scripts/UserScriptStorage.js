// 用户脚本存储管理器
// 负责脚本的持久化、加载和删除

window.UserScriptStorage = {
  /**
   * 从 storage 加载已安装脚本
   */
  async loadInstalledScripts(scriptsMap) {
    try {
      const result = await chrome.storage.local.get('installedScripts');
      const installedScripts = result.installedScripts || [];
      
      for (const scriptInfo of installedScripts) {
        const codeResult = await chrome.storage.local.get(`script_code_${scriptInfo.id}`);
        const code = codeResult[`script_code_${scriptInfo.id}`];
        
        scriptsMap.set(scriptInfo.id, scriptInfo);
      }
      
      console.log('[UserScriptStorage] Loaded', installedScripts.length, 'scripts');
      return installedScripts;
    } catch (error) {
      console.error('[UserScriptStorage] Failed to load scripts:', error);
      return [];
    }
  },

  /**
   * 保存脚本列表到 storage
   */
  async saveInstalledScripts(scriptsMap) {
    const scriptList = Array.from(scriptsMap.values());
    await chrome.storage.local.set({ installedScripts: scriptList });
  },

  /**
   * 获取脚本代码
   */
  async getScriptCode(scriptId) {
    const result = await chrome.storage.local.get(`script_code_${scriptId}`);
    return result[`script_code_${scriptId}`];
  },

  /**
   * 保存脚本代码
   */
  async saveScriptCode(scriptId, code) {
    await chrome.storage.local.set({
      [`script_code_${scriptId}`]: code
    });
  },

  /**
   * 删除脚本（包括代码和GM存储）
   */
  async deleteScript(scriptId) {
    // 删除脚本代码
    await chrome.storage.local.remove(`script_code_${scriptId}`);
    
    // 删除该脚本的所有GM存储数据
    const allData = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(allData).filter(key => 
      key.startsWith(`gm:${scriptId}:`)
    );
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }
};
