import { marked } from 'marked';
import DOMPurify from 'dompurify';

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

/** 从 msg.content 提取媒体块（图片/音频/视频/文件），供渲染层单独绘制 */
export function extractMediaBlocks(content: unknown): any[] {
  if (!content || !Array.isArray(content)) return [];
  return (content as any[]).filter(
    (b) => b && (b.type === 'media' || b.type === 'image')
  );
}

/** 媒体 kind 归一化：image/audio/video/file */
export function normalizeMediaKind(block: any): 'image' | 'audio' | 'video' | 'file' {
  if (!block) return 'file';
  if (block.type === 'image') return 'image';
  const k = (block.kind || '').toLowerCase();
  if (k === 'image' || k === 'audio' || k === 'video') return k;
  return 'file';
}

/** HTML 安全转义 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Markdown 渲染：先 parse 再净化。
 * LLM 输出经 {@html} 直接注入 DOM，必须净化以阻断 <script> / onerror 等注入（XSS P0）。
 * marked 默认透传原始 HTML，故统一在出口用 DOMPurify 兜底。
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  try {
    const rawHtml = marked.parse(md, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  } catch {
    return md;
  }
}
