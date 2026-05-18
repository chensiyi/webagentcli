/**
 * 后台脚本 - 处理扩展图标点击
 */

// 当扩展图标被点击时，打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[Background] Failed to open side panel:', error);
  }
});

console.log('[Background] Service worker loaded');
