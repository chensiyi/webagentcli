/**
 * ModelCache - 模型缓存管理
 * 
 * 负责模型列表的本地持久化存储和缓存管理
 * 使用 chrome.storage.local 进行数据存储
 */

class ModelCache {
  constructor() {
    this.storageKey = 'model_cache';
    this.cacheDuration = 30 * 24 * 60 * 60 * 1000; // 30 天
  }

  /**
   * 保存模型缓存
   * @param {string} apiEndpoint - API 端点
   * @param {string} apiStandard - API 标准
   * @param {Array} models - 模型 ID 列表
   * @param {Object} modelDetails - 模型详细信息
   */
  async save(apiEndpoint, apiStandard, models, modelDetails = {}) {
    const cacheData = {
      apiEndpoint,
      apiStandard,
      models,
      modelDetails,
      timestamp: Date.now(),
      version: '1.0'
    };

    try {
      await chrome.storage.local.set({ [this.storageKey]: cacheData });
      console.log('[ModelCache] Saved', models.length, 'models for', apiStandard);
      return true;
    } catch (error) {
      console.error('[ModelCache] Save error:', error);
      return false;
    }
  }

  /**
   * 加载模型缓存
   * @param {string} apiEndpoint - API 端点（用于验证）
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  async load(apiEndpoint) {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const cache = result[this.storageKey];

      if (!cache) {
        console.log('[ModelCache] No cache found');
        return null;
      }

      // 验证 API 端点是否匹配
      if (cache.apiEndpoint !== apiEndpoint) {
        console.log('[ModelCache] API endpoint changed, ignoring cache');
        return null;
      }

      // 检查缓存是否过期
      if (this.isExpired(cache.timestamp)) {
        console.log('[ModelCache] Cache expired');
        return null;
      }

      console.log('[ModelCache] Loaded', cache.models.length, 'models from cache');
      return cache;
    } catch (error) {
      console.error('[ModelCache] Load error:', error);
      return null;
    }
  }

  /**
   * 清除缓存
   * @returns {Promise<boolean>}
   */
  async clear() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      console.log('[ModelCache] Cache cleared');
      return true;
    } catch (error) {
      console.error('[ModelCache] Clear error:', error);
      return false;
    }
  }

  /**
   * 检查缓存是否有效
   * @param {string} apiEndpoint - API 端点
   * @returns {Promise<boolean>}
   */
  async isValid(apiEndpoint) {
    const cache = await this.load(apiEndpoint);
    return cache !== null;
  }

  /**
   * 获取缓存年龄（毫秒）
   * @returns {Promise<number>} 缓存年龄，如果无缓存返回 -1
   */
  async getAge() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const cache = result[this.storageKey];
      
      if (!cache || !cache.timestamp) {
        return -1;
      }

      return Date.now() - cache.timestamp;
    } catch (error) {
      return -1;
    }
  }

  /**
   * 检查时间戳是否过期
   * @param {number} timestamp - 时间戳
   * @returns {boolean}
   */
  isExpired(timestamp) {
    return Date.now() - timestamp > this.cacheDuration;
  }

  /**
   * 获取缓存统计信息
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const cache = result[this.storageKey];

      if (!cache) {
        return {
          hasCache: false,
          modelCount: 0,
          age: -1
        };
      }

      return {
        hasCache: true,
        apiEndpoint: cache.apiEndpoint,
        apiStandard: cache.apiStandard,
        modelCount: cache.models.length,
        age: Date.now() - cache.timestamp,
        ageDays: ((Date.now() - cache.timestamp) / (24 * 60 * 60 * 1000)).toFixed(1),
        isExpired: this.isExpired(cache.timestamp),
        version: cache.version
      };
    } catch (error) {
      console.error('[ModelCache] Get stats error:', error);
      return {
        hasCache: false,
        modelCount: 0,
        age: -1
      };
    }
  }
}

// 导出单例
window.ModelCache = new ModelCache();
