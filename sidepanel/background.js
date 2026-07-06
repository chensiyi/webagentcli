/**
 * 后台 Service Worker — 持续运行
 *
 * 职责：用户脚本自动注入（仿油猴）
 * 优先使用 chrome.userScripts API（Chrome 120+）注册脚本，Chrome 自动注入到匹配页面。
 * 如果 chrome.userScripts 不可用（用户未开启"允许用户脚本"开关），降级为手动注入。
 * 脚本的增删改在 sidepanel UI 中完成，storage 变化时自动触发重新注册/注入。
 */

// ==================== @match 模式 → 正则（降级模式用） ====================

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

// ==================== 降级模式：手动注入 ====================

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

    console.log(`[Background] Inject (fallback): ${script.name || script.id} → tab ${tabId}`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: new Function('scriptName',
          'var GM_info = { script: { name: scriptName, version: "1.0" } };\n' +
          'var GM_log = console.log.bind(console);\n' +
          'var unsafeWindow = window;\n' +
          'try {\n' +
          '  ' + script.code + '\n' +
          '} catch(__e) {\n' +
          '  console.error("[ScriptInject] " + scriptName + ": ", __e);\n' +
          '}'
        ),
        args: [script.name || script.id],
      });
    } catch (e) {
      console.log(`[Background] Inject skipped (${script.name || script.id}):`, e.message);
    }
  }
}

// ==================== 优先模式：chrome.userScripts.register() ====================

function isUserScriptsAvailable() {
  try {
    chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

function wrapWithGM(code, name) {
  var safeName = JSON.stringify(name || '');
  return (
    'var GM_info = { script: { name: ' + safeName + ', version: "1.0" } };\n' +
    'var GM_log = console.log.bind(console);\n' +
    'var unsafeWindow = window;\n' +
    'try {\n' +
    '  ' + code + '\n' +
    '} catch(__e) {\n' +
    '  console.error("[ScriptInject] " + ' + safeName + ' + ": ", __e);\n' +
    '}\n'
  );
}

async function syncRegisteredScripts() {
  if (!isUserScriptsAvailable()) return false;

  let scripts = [];
  try {
    const result = await chrome.storage.local.get(['user_scripts']);
    scripts = result.user_scripts || [];
  } catch (e) {
    console.error('[Background] Read scripts failed:', e);
    return false;
  }

  const enabled = scripts.filter(s => s.enabled && s.match && s.match.length > 0);

  // 先取消所有已注册脚本
  try { await chrome.userScripts.unregister(); } catch {}

  if (enabled.length === 0) return true;

  const registrations = enabled.map(s => ({
    id: s.id,
    matches: s.match,
    js: [{ code: wrapWithGM(s.code, s.name || s.id) }],
    world: 'MAIN',
    runAt: 'document_idle'
  }));

  try {
    await chrome.userScripts.register(registrations);
    console.log(`[Background] Registered ${registrations.length} user scripts via chrome.userScripts`);
    return true;
  } catch (e) {
    console.error('[Background] Register failed, falling back to manual injection:', e);
    return false;
  }
}

// ==================== 事件监听 ====================

// 扩展安装/更新 → 同步注册
chrome.runtime.onInstalled.addListener(() => {
  syncRegisteredScripts();
});

// 标签页加载完成 → 降级模式手动注入
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (isUserScriptsAvailable()) return; // 优先模式由 Chrome 自动注入
  if (changeInfo.status === 'complete') {
    await injectScriptsForTab(tab.id, tab.url);
  }
});

// 脚本数据变更 → 重新注册或重新注入
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local' || !changes.user_scripts) return;
  if (isUserScriptsAvailable()) {
    await syncRegisteredScripts();
  } else {
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

// 启动时同步注册
syncRegisteredScripts();

console.log('[Background] Service worker loaded');
