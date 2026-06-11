/**
 * ChromeStorageAdapter - Chrome 存储适配器
 * 
 * 壳层实现，为内核提供 Chrome Storage 访问能力
 */

class ChromeStorageAdapter extends window.IStorageManager {
  constructor() {
    // 没有 serviceCenter，传入 null
    super(null);
    this.storage = chrome.storage.local;
  }

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
}

// 导出
if (typeof window !== 'undefined') {
  window.ChromeStorageAdapter = ChromeStorageAdapter;
}
