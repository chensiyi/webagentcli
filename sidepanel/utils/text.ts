/**
 * 文本处理工具函数
 * 提取自 ChatPage.svelte，供多个页面共享使用
 */

/** 从 msg.content 统一提取纯文本（兼容 OpenAI 富文本数组格式） */
export function extractText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n\n');
  }
  return String(content);
}

/** HTML 安全转义 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Markdown 渲染（依赖全局 marked 库） */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  try {
    return (window as any).marked?.parse(md) ?? md;
  } catch {
    return md;
  }
}
