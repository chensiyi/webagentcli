// ==================== Background Service Worker ====================
// Web Agent Runtime 核心

import ToolRegistry from './src/runtime/ToolRegistry.js';
import ContextManager from './src/runtime/ContextManager.js';

console.log('[WebAgent Runtime] Starting...');

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
    // 获取可用工具列表
    case 'GET_TOOLS':
      return {
        success: true,
        data: ToolRegistry.getDefinitions()
      };
    
    // 执行工具
    case 'EXECUTE_TOOL':
      const result = await ToolRegistry.execute(
        payload.toolName,
        payload.params
      );
      return { success: true, data: result };
    
    // 获取上下文
    case 'GET_CONTEXT':
      // 先尝试从存储加载
      await ContextManager.loadSession(payload.sessionId);
      const context = ContextManager.getContext(payload.sessionId);
      return { success: true, data: context };
    
    // 添加消息
    case 'ADD_MESSAGE':
      ContextManager.addMessage(
        payload.sessionId,
        payload.role,
        payload.content
      );
      return { success: true };
    
    // 创建会话
    case 'CREATE_SESSION':
      ContextManager.createSession(payload.sessionId);
      return { success: true };
    
    // 清除会话
    case 'CLEAR_SESSION':
      ContextManager.clearSession(payload.sessionId);
      return { success: true };
    
    // 更新页面状态
    case 'UPDATE_PAGE_STATE':
      ContextManager.updatePageState(payload.sessionId, payload.pageState);
      return { success: true };
    
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  // 打开 Side Panel
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[WebAgent Runtime] Ready');
