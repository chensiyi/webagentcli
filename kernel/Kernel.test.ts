/**
 * P0-2: StorageManager 类型不存在
 *
 * Kernel.ts:159 写了 getStorageManager() : StorageManager
 * 但 StorageManager 既没有 import 也没有定义。
 * 实际注册的服务是 Shell 层的 ChromeStorageAdapter，接口是 IStorageManager。
 *
 * 验证：
 * 1. kernel 模块导出中不包含 StorageManager
 * 2. Kernel.getStorageManager 应返回符合 IStorageManager 接口的对象
 */
import { describe, it, expect } from 'vitest';
import * as kernelExports from './index.js';
import { Kernel } from './Kernel.js';
import { IStorageManager } from './services/IStorageManager.js';

// 简单的 IStorageManager mock 实现
class MockStorageManager extends IStorageManager {
  constructor() { super(); this.name = 'mockStorage'; }
  init(kernel) { return Promise.resolve(); }
  shutdown() { return Promise.resolve(); }
  async get(key) { return null; }
  async set(key, value) { return true; }
  async remove(key) { return true; }
  async getAll() { return {}; }
}

describe('P0-2: StorageManager 类型不存在', () => {
  it('kernel/index.ts 不应导出 StorageManager（因为它不存在）', () => {
    const exportNames = Object.keys(kernelExports);
    expect(exportNames).not.toContain('StorageManager');
  });

  it('Kernel.getStorageManager 应返回注册的 IStorageManager 实例（boot 后）', async () => {
    const kernel = new Kernel();
    const storage = new MockStorageManager();
    kernel.register('storageManager', storage);
    // boot 才会初始化服务实例
    await kernel.boot();
    const result = kernel.getStorageManager();
    expect(result).toBe(storage);
    expect(result instanceof IStorageManager).toBe(true);
  });

  it('getStorageManager 返回的对象应符合 IStorageManager 接口', async () => {
    const kernel = new Kernel();
    const storage = new MockStorageManager();
    kernel.register('storageManager', storage);
    await kernel.boot();
    const result = kernel.getStorageManager();
    expect(typeof result.get).toBe('function');
    expect(typeof result.set).toBe('function');
    expect(typeof result.remove).toBe('function');
    expect(typeof result.getAll).toBe('function');
  });
});
