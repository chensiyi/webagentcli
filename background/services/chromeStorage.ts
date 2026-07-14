/**
 * chromeStorage.ts — chrome.storage.local 的存储实现工厂
 *
 * 这是「由组装根（background 启动 / 应用入口）提供给内核」的存储实例：
 * 内核只依赖 IStorageManager 接口，不直接触碰 chrome。本工厂在 background 组装阶段
 * 创建**唯一**实例并注入内核（见 background/main.ts），不做任何中转 / 代理类包装。
 *
 * 日志策略（降低常规噪音，重要写由业务服务自己记 info）：
 * - set：打 **debug**（最高频的常规写——每次会话落盘 / 设置 / 脚本 / 工具 / 预装都会触发，刷屏）；
 *        流式批量写再叠加 { silent: true } 同样走 debug（带 [silent] 标记）。
 * - remove / clear：打 **info**（罕见且具破坏性，值得在常规日志里看到）。
 * - get / getAll：打 debug（生产默认不刷屏）。
 * 各业务服务（SettingsManager / SessionManager / ScriptsManager / ToolsManager / preset-installer）
 * 已对各自的关键写打 info，故 storage 层无需为 set 重复 info。
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

    async set(key: string, value: unknown, opts?: { silent?: boolean }): Promise<void> {
      if (opts?.silent) {
        Log.debug('STORAGE', `set ${key} (${_desc(value)}) [silent]`);
      } else {
        Log.debug('STORAGE', `set ${key} (${_desc(value)})`);
      }
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
