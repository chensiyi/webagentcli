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

/**
 * 根据 storage 中的脚本列表注册 userScripts
 */
async function updateUserScripts() {
  try {
    const result = await chrome.storage.local.get('installedScripts');
    const scripts = result.installedScripts || [];
    
    console.log(`[Background] Found ${scripts.length} installed scripts`);
    
    // 清除已注册的脚本
    const existing = await chrome.userScripts.getScripts();
    if (existing.length > 0) {
      await chrome.userScripts.unregister({ ids: existing.map(s => s.id) });
      console.log('[Background] Unregistered', existing.length, 'existing scripts');
    }
    
    // 注册新脚本
    for (const script of scripts) {
      if (script.enabled !== false) {
        await registerUserScript(script);
      }
    }
    
    console.log('[Background] ✓ All scripts registered');
  } catch (error) {
    console.error('[Background] ✗ Failed to update scripts:', error);
  }
}

/**
 * 注册单个用户脚本
 */
async function registerUserScript(script) {
  try {
    console.log(`[Background] Registering: ${script.name}`);
    
    await chrome.userScripts.register([{
      id: script.name,
      matches: ['<all_urls>'], // 匹配所有网页
      world: 'MAIN', // 注入到主世界，绕过 CSP
      js: [{ code: script.code }]
    }]);
    
    console.log(`[Background] ✓ ${script.name} registered`);
  } catch (error) {
    console.error(`[Background] ✗ Failed to register ${script.name}:`, error);
  }
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
