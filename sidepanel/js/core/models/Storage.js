/**
 * Storage Model - 存储数据模型
 * 管理 chrome.storage.local 的操作
 */

class StorageModel {
  constructor() {
    this.storage = chrome.storage.local;
  }

  /**
   * 获取所有存储项
   * @returns {Promise<Array<[string, any]>>} 键值对数组
   */
  async getAll() {
    try {
      const result = await this.storage.get(null);
      return Object.entries(result).sort((a, b) => {
        const sizeA = JSON.stringify(a[1]).length;
        const sizeB = JSON.stringify(b[1]).length;
        return sizeB - sizeA; // 按大小降序
      });
    } catch (error) {
      console.error('[StorageModel] Failed to get all:', error);
      throw error;
    }
  }

  /**
   * 获取指定键的值
   * @param {string} key - 键名
   * @returns {Promise<any>} 值
   */
  async get(key) {
    try {
      const result = await this.storage.get(key);
      return result[key];
    } catch (error) {
      console.error('[StorageModel] Failed to get:', key, error);
      throw error;
    }
  }

  /**
   * 设置存储项
   * @param {string} key - 键名
   * @param {any} value - 值
   * @returns {Promise<void>}
   */
  async set(key, value) {
    try {
      await this.storage.set({ [key]: value });
    } catch (error) {
      console.error('[StorageModel] Failed to set:', key, error);
      throw error;
    }
  }

  /**
   * 删除指定存储项
   * @param {string} key - 键名
   * @returns {Promise<void>}
   */
  async remove(key) {
    try {
      await this.storage.remove(key);
    } catch (error) {
      console.error('[StorageModel] Failed to remove:', key, error);
      throw error;
    }
  }

  /**
   * 清除所有存储
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this.storage.clear();
    } catch (error) {
      console.error('[StorageModel] Failed to clear:', error);
      throw error;
    }
  }

  /**
   * 搜索存储项
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array<[string, any]>>} 匹配的键值对数组
   */
  async search(keyword) {
    const all = await this.getAll();
    const lowerKeyword = keyword.toLowerCase();
    
    return all.filter(([key, value]) => {
      const keyStr = key.toLowerCase();
      const valueStr = JSON.stringify(value).toLowerCase();
      return keyStr.includes(lowerKeyword) || valueStr.includes(lowerKeyword);
    });
  }

  /**
   * 获取存储使用量统计
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const all = await this.getAll();
    const totalSize = all.reduce((sum, [, value]) => {
      return sum + JSON.stringify(value).length;
    }, 0);

    return {
      totalItems: all.length,
      totalSize: totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      largestItem: all.length > 0 ? {
        key: all[0][0],
        size: JSON.stringify(all[0][1]).length
      } : null
    };
  }

  /**
   * 缓存相关方法
   */

  /**
   * 设置缓存（带过期时间）
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒），默认 30 天
   * @returns {Promise<void>}
   */
  async setCache(key, value, ttl = 30 * 24 * 60 * 60 * 1000) {
    const cacheData = {
      value,
      timestamp: Date.now(),
      ttl
    };
    await this.set(`cache:${key}`, cacheData);
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<any|null>} 缓存值，如果不存在或已过期则返回 null
   */
  async getCache(key) {
    const cacheData = await this.get(`cache:${key}`);
    
    if (!cacheData) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - cacheData.timestamp > cacheData.ttl) {
      console.log(`[StorageModel] Cache expired: ${key}`);
      await this.remove(`cache:${key}`);
      return null;
    }

    return cacheData.value;
  }

  /**
   * 清除指定缓存
   * @param {string} key - 缓存键
   * @returns {Promise<void>}
   */
  async removeCache(key) {
    await this.remove(`cache:${key}`);
  }

  /**
   * 清除所有缓存
   * @returns {Promise<void>}
   */
  async clearAllCache() {
    const all = await this.getAll();
    const cacheKeys = all
      .filter(([key]) => key.startsWith('cache:'))
      .map(([key]) => key);
    
    if (cacheKeys.length > 0) {
      await this.storage.remove(cacheKeys);
      console.log(`[StorageModel] Cleared ${cacheKeys.length} cache items`);
    }
  }

  /**
   * 检查缓存是否存在且有效
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>}
   */
  async hasValidCache(key) {
    const value = await this.getCache(key);
    return value !== null;
  }
}

window.StorageModel = new StorageModel();
