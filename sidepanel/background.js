/**
 * 后台 Service Worker — 持续运行
 *
 * 职责：用户脚本自动注入（仿油猴）
 * 不依赖 Kernel，直接读取 chrome.storage。
 * 脚本的增删改在 sidepanel UI 中完成，storage 变化时自动触发重新注入。
 */

// ==================== @match 模式 → 正则 ====================

function matchPatternToRegex(pattern) {
  let regexStr = pattern
    .replace(/\\/g, '\\\\')
    .replace(/\./g, '\\.')
    .replace(/\+/g, '\\+')
    .replace(/\?/g, '\\?')
    .replace(/\^/g, '\\^')
    .replace(/\$/g, '\\$')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\|/g, '\\|')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\//g, '\\/')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regexStr}$`);
}

async function injectScriptsForTab(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('chrome-extension://')) {
    return;
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
    console.error('[Background] Read scripts failed:', e);
    return;
  }

  const enabledScripts = scripts.filter(s => s.enabled && s.match && s.match.length > 0);
  if (enabledScripts.length === 0) return;

  for (const script of enabledScripts) {
    const isMatch = script.match.some(pattern => {
      try { return matchPatternToRegex(pattern).test(url); }
      catch (e) { return false; }
    });
    if (!isMatch) continue;

    console.log(`[Background] Inject: ${script.name || script.id} → tab ${tabId}`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (scriptCode, scriptName) => {
          const sandbox = {
            GM_info: { script: { name: scriptName, version: '1.0' } },
            GM_log: console.log.bind(console),
            unsafeWindow: window,
          };
          try { new Function(...Object.keys(sandbox), scriptCode)(...Object.values(sandbox)); }
          catch (e) { console.error(`[ScriptInject] ${scriptName}:`, e); }
        },
        args: [script.code, script.name || script.id],
      });
    } catch (e) {
      console.log(`[Background] Inject skipped (${script.name || script.id}):`, e.message);
    }
  }
}

// ==================== 事件监听 ====================

// 标签页激活 → 注入匹配脚本
// chrome.tabs.onActivated.addListener(async (activeInfo) => {
//   try {
//     const tab = await chrome.tabs.get(activeInfo.tabId);
//     await injectScriptsForTab(tab.id, tab.url);
//   } catch (e) {
//     console.warn('[Background] onActivated:', e);
//   }
// });

// 标签页加载完成 → 注入
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await injectScriptsForTab(tab.id, tab.url);
  }
});

// 脚本数据变更 → 立即重新注入当前标签页
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.user_scripts) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        await injectScriptsForTab(tabs[0].id, tabs[0].url);
      }
    } catch (e) {
      console.warn('[Background] re-inject:', e);
    }
  }
});

// 扩展图标点击 → 打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[Background] Failed to open side panel:', error);
  }
});

// 启动时注入当前活跃标签页
setTimeout(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url) {
      await injectScriptsForTab(tabs[0].id, tabs[0].url);
    }
  } catch (e) {
    console.error('[Background] Startup inject failed:', e);
  }
}, 500);

console.log('[Background] Service worker loaded');