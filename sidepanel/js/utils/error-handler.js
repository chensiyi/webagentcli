/**
 * 全局错误处理
 */

// 全局错误捕获
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.message, 'at', e.filename + ':' + e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason);
});

console.log('[Error Handler] Loaded');
