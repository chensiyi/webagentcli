/**
 * App Initializer - 应用初始化脚本
 * 
 * 避免 inline script 的 CSP 问题
 */

window.addEventListener('load', () => {
  console.log('[App] All modules loaded, initializing new ChatPage...');
  
  // 创建聊天页面
  if (window.ChatPage) {
    new window.ChatPage();
  } else {
    console.error('[App] ChatPage not found!');
  }
});
