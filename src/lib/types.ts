/**
 * Svelte UI 层类型定义
 * 
 * 最小化 Kernel 引用——只暴露 UI 需要的接口。
 */

export type PageId = 'chat' | 'history' | 'storage' | 'scripts' | 'settings';

export interface PageDef {
  id: PageId;
  icon: string;
  label: string;
}

export const PAGES: PageDef[] = [
  { id: 'chat', icon: '💬', label: '对话' },
  { id: 'history', icon: '📋', label: '历史' },
  { id: 'storage', icon: '💾', label: '存储' },
  { id: 'scripts', icon: '📜', label: '脚本' },
  { id: 'settings', icon: '⚙️', label: '设置' },
];
