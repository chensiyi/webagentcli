// ==================== Script Injector ====================
// 用户脚本管理和注入功能

/**
 * 更新用户脚本（由 Side Panel 的 UserScriptManager 处理）
 * Background 只负责监听安装/卸载事件
 */
export async function updateUserScripts() {
  console.log('[Background] Scripts managed by UserScriptManager in Side Panel');
}

/**
 * 向标签页注入匹配的脚本
 */
export async function injectScriptsToTab(tabId, url) {
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
export function matchesURL(url, scriptInfo) {
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
export function matchPattern(url, pattern) {
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
