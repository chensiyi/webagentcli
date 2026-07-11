/**
 * chromeStorage.ts — chrome.storage.local 的存储实现工厂
 *
 * 这是「由组装根（background 启动 / 应用入口）提供给内核」的存储实例：
 * 内核只依赖 IStorageManager 接口，不直接触碰 chrome。本工厂在 background 组装阶段
 * 创建**唯一**实例并注入内核（见 background/main.ts），不做任何中转 / 代理类包装。
 */

import { IStorageManager } from 'kernel/services/IStorageManager.js';

export function createChromeStorage(): IStorageManager {
  return {
    async get(key: string): Promise<unknown> {
      const result = await chrome.storage.local.get(key);
      return result[key];
    },

    async set(key: string, value: unknown): Promise<void> {
      await chrome.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key);
    },

    async clear(): Promise<void> {
      await chrome.storage.local.clear();
    },

    async getAll(): Promise<Record<string, unknown>> {
      return await chrome.storage.local.get(null);
    },
  };
}
