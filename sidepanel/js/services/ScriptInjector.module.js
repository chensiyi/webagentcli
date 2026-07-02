// ScriptInjector.module.js - ES 模块版本（给 background.js 使用）

// 将 Tampermonkey @match 模式转为正则表达式
// * 支持: *://*/*, https://example.com/*, *://*.example.com/* 等

function matchPatternToRegex(pattern) {
  // 逐个转义正则特殊字符，然后将 * 转为 .*
  let regexStr = pattern
    .replace(/\\/g, '\\\\')   // \ → \\
    .replace(/\./g, '\\.')    // . → \.
    .replace(/\+/g, '\\+')    // + → \+
    .replace(/\?/g, '\\?')    // ? → \?
    .replace(/\^/g, '\\^')    // ^ → \^
    .replace(/\$/g, '\\$')    // $ → \$
    .replace(/\{/g, '\\{')    // { → \{
    .replace(/\}/g, '\\}')    // } → \}
    .replace(/\(/g, '\\(')    // ( → \(
    .replace(/\)/g, '\\)')    // ) → \)
    .replace(/\|/g, '\\|')    // | → \|
    .replace(/\[/g, '\\[')    // [ → \[
    .replace(/\]/g, '\\]')    // ] → \]
    .replace(/\//g, '\\/')    // / → \/
    .replace(/\*/g, '.*');     // * → .*
  return new RegExp(`^${regexStr}$`);
}

export async function injectScriptsForTab(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('chrome-extension://')) {
    return; // 跳过浏览器内部页面
  }

  let scripts = [];
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.storage.local.get(['user_scripts'], (r) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(r);
      });
    });
    scripts = result.user_scripts || [];
  } catch (e) {
    console.error('[ScriptInjector] 读取脚本失败:', e);
    return;
  }

  const enabledScripts = scripts.filter(s => s.enabled && s.match && s.match.length > 0);
  if (enabledScripts.length === 0) return;

  console.log(`[ScriptInjector] 检查注入: tabId=${tabId}, url=${url}, 候选脚本=${enabledScripts.length}`);

  for (const script of enabledScripts) {
    const isMatch = script.match.some(pattern => {
      try {
        return matchPatternToRegex(pattern).test(url);
      } catch (e) {
        console.warn('[ScriptInjector] 模式匹配失败:', pattern, e);
        return false;
      }
    });
    if (!isMatch) continue;

    console.log(`[ScriptInjector] 注入脚本: ${script.name || script.id} → tab ${tabId}`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (scriptCode, scriptName) => {
          const sandbox = {
            GM_info: { script: { name: scriptName, version: '1.0' } },
            GM_log: console.log.bind(console),
            unsafeWindow: window
          };
          try {
            new Function(...Object.keys(sandbox), scriptCode)(...Object.values(sandbox));
          } catch (e) {
            console.error(`[ScriptInjector] 脚本执行错误 (${scriptName}):`, e);
          }
        },
        args: [script.code, script.name || script.id]
      });
    } catch (e) {
      console.error(`[ScriptInjector] 注入失败 (${script.name || script.id}):`, e);
    }
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