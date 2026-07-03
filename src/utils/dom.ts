/**
 * DOM 操作工具函数
 */

/** 自动滚动到底部（仅当接近底部时才滚动，除非 force） */
export function autoScrollToBottom(
  el: HTMLElement,
  force = false,
  threshold = 100
): void {
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  if (force || nearBottom) {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }
}
