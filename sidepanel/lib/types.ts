/**
 * 共享 UI 类型（Sidepanel 与 Sidebar 共用）
 *
 * 抽出是因为导航相关类型（页面 id / 页面定义）在两处都要用，
 * 此前 Sidebar 直接 import 本文件，故集中在此避免散落与悬空引用。
 */

export type PageId = 'chat' | 'history' | 'storage' | 'scripts' | 'tools' | 'settings';

export interface PageDef {
  id: PageId;
  icon: string;
  label: string;
}
