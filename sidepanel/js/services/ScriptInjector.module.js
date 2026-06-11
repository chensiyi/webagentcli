// ScriptInjector.module.js - ES 模块版本（给 background.js 使用）
export async function injectScriptsForTab(tabId, url) {
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

export function clearInjectedScriptCache() {
  console.log('[ScriptInjector] 已清空注入缓存');
}

export async function cleanupInjectedScriptsForAllTabs() {
  console.log('[ScriptInjector] 清理所有标签页的注入脚本');
  try {
    const tabs = await chrome.tabs.query({});
    console.log('[ScriptInjector] 清理完成');
  } catch (e) { console.error('[ScriptInjector] 清理失败:', e); }
}