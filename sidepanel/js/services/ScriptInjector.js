// ScriptInjector.js - 给 sidepanel 用的版本（无 export）
class ScriptInjector {
  constructor() {
    this.initialized = false;
    this.scripts = [];
    this.isolatedWorldId = 'WebAgent_UserScripts';
  }
  async initialize() {
    if (this.initialized) return;
    chrome.tabs.onUpdated.addListener(this._handleTabUpdate.bind(this));
    this._loadScripts();
    this.initialized = true;
  }
  async _loadScripts() {
    if (window.ScriptsModel) {
      this.scripts = await window.ScriptsModel.getAll();
    } else {
      await new Promise(resolve => chrome.storage.local.get(['user_scripts'], r => {
        this.scripts = r.user_scripts || [];
        resolve();
      }));
    }
  }
  _matchUrl(pattern, url) {
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(url);
  }
  _handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;
    this._injectMatchingScripts(tabId, tab.url);
  }
  async _injectMatchingScripts(tabId, url) {
    const enabledScripts = this.scripts.filter(s => s.enabled && s.match);
    for (const script of enabledScripts) {
      const isMatch = script.match.some(pattern => this._matchUrl(pattern, url));
      if (!isMatch) continue;
      try { await this._injectScript(tabId, script); } catch (e) {}
    }
  }
  async _injectScript(tabId, script) {
    return chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (scriptCode, worldId) => {
        const sandbox = { GM_info: { script: { name: worldId, version: '1.0' } }, GM_log: console.log.bind(console), unsafeWindow: window };
        try { new Function(...Object.keys(sandbox), scriptCode)(...Object.values(sandbox)); } catch (e) { console.error('[ScriptInjector] 执行错误:', e); }
      },
      args: [script.code, 'WebAgent_UserScripts']
    });
  }
}

// 函数版本（供全局调用）
async function injectScriptsForTab(tabId, url) {
  const result = await new Promise((resolve) => chrome.storage.local.get(['user_scripts'], r => resolve(r)));
  const scripts = result.user_scripts || [];
  const enabledScripts = scripts.filter(s => s.enabled && s.match);
  
  for (const script of enabledScripts) {
    const isMatch = script.match.some(pattern => {
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}$`).test(url);
    });
    if (!isMatch) continue;
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (scriptCode, worldId) => {
          const sandbox = { GM_info: { script: { name: worldId, version: '1.0' } }, GM_log: console.log.bind(console), unsafeWindow: window };
          try { new Function(...Object.keys(sandbox), scriptCode)(...Object.values(sandbox)); } catch (e) {}
        },
        args: [script.code, 'WebAgent_UserScripts']
      });
    } catch (e) { console.error('[ScriptInjector] 注入失败:', e); }
  }
}

function clearInjectedScriptCache() {
  console.log('[ScriptInjector] 已清空注入缓存');
}

async function cleanupInjectedScriptsForAllTabs() {
  console.log('[ScriptInjector] 清理所有标签页的注入脚本');
  try {
    const tabs = await chrome.tabs.query({});
    console.log('[ScriptInjector] 清理完成');
  } catch (e) { console.error('[ScriptInjector] 清理失败:', e); }
}

// 全局变量导出
window.ScriptInjector = ScriptInjector;
window.injectScriptsForTab = injectScriptsForTab;
window.clearInjectedScriptCache = clearInjectedScriptCache;
window.cleanupInjectedScriptsForAllTabs = cleanupInjectedScriptsForAllTabs;

// CommonJS 兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ScriptInjector,
    injectScriptsForTab,
    clearInjectedScriptCache,
    cleanupInjectedScriptsForAllTabs
  };
}