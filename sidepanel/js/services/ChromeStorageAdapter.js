/**
 * ChromeStorageAdapter - Chrome 存储适配器（IStorageManager 的 Chrome 环境实现）
 * 
 * 壳层实现，为内核提供 Chrome Storage 访问能力
 * 同时实现底层存储操作和上层管理功能
 */

import { IStorageManager } from '../../../kernel/services/IStorageManager.js';
import { Events } from '../events.js';

class ChromeStorageAdapter extends IStorageManager {
  /**
   * @param {Kernel} [kernel] - 内核实例，用于事件通信
   */
    constructor(kernel = null) {
    super(kernel);
    this.storage = chrome.storage.local;
    const ipc = kernel?.getIPC();
    console.log('[ChromeStorageAdapter] ipc type:', ipc?.constructor?.name, 'methods:', Object.keys(ipc || {}));
    this.ipc = ipc;
    this.storageChannel = ipc?.getOrCreateChannel ? ipc.getOrCreateChannel('storage') : ipc;
  }

  // ========== 底层存储操作 ==========

  /**
   * 获取所有存储项
   * @returns {Promise<Array<[string, any]>>} 键值对数组
   */
  async getAll() {
    return new Promise((resolve, reject) => {
      this.storage.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(Object.entries(result));
        }
      });
    });
  }

  /**
   * 获取指定键的值
   * @param {string} key - 键名
   * @returns {Promise<any>} 值
   */
  async get(key) {
    return new Promise((resolve, reject) => {
      this.storage.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  /**
   * 设置存储项
   * @param {string} key - 键名
   * @param {any} value - 值
   * @returns {Promise<void>}
   */
  async set(key, value) {
    return new Promise((resolve, reject) => {
      this.storage.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 删除指定存储项
   * @param {string} key - 键名
   * @returns {Promise<void>}
   */
  async remove(key) {
    return new Promise((resolve, reject) => {
      this.storage.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 清除所有存储
   * @returns {Promise<void>}
   */
  async clear() {
    return new Promise((resolve, reject) => {
      this.storage.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // ========== 上层管理功能 ==========

  /**
   * 搜索存储项（触发搜索结果事件）
   * @param {string} keyword - 搜索关键词
   */
  async search(keyword) {
    try {
      const items = await this.getAll();
      const lowerKeyword = keyword.toLowerCase();
      const filtered = items.filter(([key, value]) => {
        const keyStr = key.toLowerCase();
        const valueStr = JSON.stringify(value).toLowerCase();
        return keyStr.includes(lowerKeyword) || valueStr.includes(lowerKeyword);
      });
      this.storageChannel?.emit(Events.STORAGE.SEARCHED, { items: filtered, keyword });
    } catch (error) {
      this.storageChannel?.emit(Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 加载所有存储项（触发 LOADED 事件）
   */
  async loadAll() {
    try {
      const items = await this.getAll();
      const stats = { total: items.length };
      
      this.storageChannel?.emit(Events.STORAGE.LOADED, { items, stats });
    } catch (error) {
      this.storageChannel?.emit(Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 删除指定存储项（并刷新列表）
   * @param {string} key - 键名
   */
  async removeItem(key) {
    try {
      await this.remove(key);
      await this.loadAll();
    } catch (error) {
      this.storageChannel?.emit(Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 更新指定存储项（并刷新列表）
   * @param {string} key - 键名
   * @param {any} value - 新值
   */
  async updateItem(key, value) {
    try {
      await this.set(key, value);
      await this.loadAll();
    } catch (error) {
      this.storageChannel?.emit(Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 清除所有存储（并刷新列表）
   */
  async clearAll() {
    try {
      await this.clear();
      await this.loadAll();
    } catch (error) {
      this.storageChannel?.emit(Events.STORAGE.ERROR, { error: error.message });
    }
  }
}

export { ChromeStorageAdapter };