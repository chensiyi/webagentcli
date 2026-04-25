// ==================== Background Service Worker ====================
// Web Agent Runtime 核心 + User Scripts Manager

console.log('[WebAgent Client] Starting...');

// ==================== User Scripts Manager ====================
// 监听 storage 变化，自动注册/注销用户脚本
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.installedScripts) {
    console.log('[Background] installedScripts changed, updating user scripts...');
    await updateUserScripts();
  }
});

// 扩展安装或更新时，重新注册脚本
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed/updated:', details.reason);
  await updateUserScripts();
});

// 监听标签页更新，自动注入脚本
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 页面加载完成时
  if (changeInfo.status === 'complete' && tab.url) {
    await injectScriptsToTab(tabId, tab.url);
  }
});

/**
 * 更新用户脚本（由 Side Panel 的 UserScriptManager 处理）
 * Background 只负责监听安装/卸载事件
 */
async function updateUserScripts() {
  console.log('[Background] Scripts managed by UserScriptManager in Side Panel');
}

/**
 * 向标签页注入匹配的脚本
 */
async function injectScriptsToTab(tabId, url) {
  try {
    // 先清理该标签页中已注入的所有用户脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const scripts = document.querySelectorAll('script[id^="userscript-"]');
        scripts.forEach(script => script.remove());
      }
    });
    
    const result = await chrome.storage.local.get('installedScripts');
    const scripts = result.installedScripts || [];
    
    for (const script of scripts) {
      if (!script.enabled) continue;
      
      // 检查 URL 是否匹配
      if (!matchesURL(url, script)) continue;
      
      // 获取脚本代码
      const codeResult = await chrome.storage.local.get(`script_code_${script.id}`);
      const code = codeResult[`script_code_${script.id}`];
      
      if (!code) continue;
      
      // 包装代码（简化版，不含 GM API）
      const wrappedCode = `
(function() {
  'use strict';
  ${code}
})();
`;
      
      // 注入到页面
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (code, scriptId) => {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.textContent = code;
          script.id = `userscript-${scriptId}`;
          (document.head || document.documentElement).appendChild(script);
        },
        args: [wrappedCode, script.id]
      });
      
      console.log('[Background] Injected script:', script.name);
    }
  } catch (error) {
    console.error('[Background] Failed to inject scripts:', error);
  }
}

/**
 * 检查 URL 是否匹配脚本规则
 */
function matchesURL(url, scriptInfo) {
  if (!scriptInfo.matches || scriptInfo.matches.length === 0) {
    return true;
  }
  
  // 检查排除规则
  if (scriptInfo.excludes) {
    for (const pattern of scriptInfo.excludes) {
      if (matchPattern(url, pattern)) {
        return false;
      }
    }
  }
  
  // 检查包含规则
  for (const pattern of scriptInfo.matches) {
    if (matchPattern(url, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 匹配 URL 模式
 */
function matchPattern(url, pattern) {
  if (pattern === '*://*/*') {
    return true;
  }
  
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '\\?');
  
  const fullRegex = new RegExp('^' + regex + '$');
  return fullRegex.test(url);
}

// ==================== Message Handler ====================
// 监听来自 Side Panel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(error => {
    console.error('[Runtime Error]', error);
    sendResponse({ success: false, error: error.message });
  });
  
  return true; // 保持消息通道开放（异步响应）
});

/**
 * 处理消息
 */
async function handleMessage(message, sender) {
  const { type, payload } = message;
  
  console.log(`[Runtime] Received: ${type}`, payload);
  
  switch (type) {
    case 'GET_TOOLS':
      return { success: true, data: [] };
    
    case 'EXECUTE_TOOL':
      return { success: true, data: null };
    
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[WebAgent Client] Ready');
