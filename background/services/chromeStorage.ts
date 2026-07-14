/**
 * chromeStorage.ts — chrome.storage.local 的存储实现工厂
 *
 * 这是「由组装根（background 启动 / 应用入口）提供给内核」的存储实例：
 * 内核只依赖 IStorageManager 接口，不直接触碰 chrome。本工厂在 background 组装阶段
 * 创建**唯一**实例并注入内核（见 background/main.ts），不做任何中转 / 代理类包装。
 *
 * 关键动作（set / remove / clear）均打 info 日志并附值的简短描述（类型+大小），
 * 便于排查存储读写；get / getAll 仅打 debug（生产默认不刷屏）。
 * 注意：会话消息落盘走批量定时器（MSG_PERSIST_BATCH_MS），非逐 token，故 set 日志不会随流式刷屏。
 */

import { IStorageManager } from 'kernel/services/IStorageManager.js';
import { Log } from 'kernel/services/Log.js';

/** 存储值的简短描述（避免把大对象直接打进日志） */
function _desc(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return `string(${v.length})`;
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === 'object') return `object(${Object.keys(v as object).length} keys)`;
  return typeof v;
}

export function createChromeStorage(): IStorageManager {
  return {
    async get(key: string): Promise<unknown> {
      const result = await chrome.storage.local.get(key);
      Log.debug('STORAGE', `get ${key}`);
      return result[key];
    },

    async set(key: string, value: unknown): Promise<void> {
      Log.info('STORAGE', `set ${key} (${_desc(value)})`);
      await chrome.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
      Log.info('STORAGE', `remove ${key}`);
      await chrome.storage.local.remove(key);
    },

    async clear(): Promise<void> {
      Log.info('STORAGE', 'clear all');
      await chrome.storage.local.clear();
    },

    async getAll(): Promise<Record<string, unknown>> {
      const all = await chrome.storage.local.get(null);
      Log.debug('STORAGE', `getAll (${Object.keys(all).length} keys)`);
      return all;
    },
  };
}
