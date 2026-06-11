/**
 * IStorageManager - 存储管理器基类（抽象接口）
 * 
 * 统一存储接口，包含底层存储操作和上层管理功能
 */
class IStorageManager {
  constructor(serviceCenter) {
    if (new.target === IStorageManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter ? serviceCenter.getEventBus() : null;
  }

  // ========== 底层存储操作 ==========
  
  /**
   * 获取所有存储项
   * @returns {Promise<Array<[string, any]>>} 键值对数组
   */
  async getAll() { throw new Error('IStorageManager.getAll() must be implemented'); }

  /**
   * 获取指定键的值
   * @param {string} key - 键名
   * @returns {Promise<any>} 值
   */
  async get(key) { throw new Error('IStorageManager.get() must be implemented'); }

  /**
   * 设置存储项
   * @param {string} key - 键名
   * @param {any} value - 值
   * @returns {Promise<void>}
   */
  async set(key, value) { throw new Error('IStorageManager.set() must be implemented'); }

  /**
   * 删除指定存储项
   * @param {string} key - 键名
   * @returns {Promise<void>}
   */
  async remove(key) { throw new Error('IStorageManager.remove() must be implemented'); }

  /**
   * 清除所有存储
   * @returns {Promise<void>}
   */
  async clear() { throw new Error('IStorageManager.clear() must be implemented'); }

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

  // ========== 上层管理功能 ==========
  
  /**
   * 加载所有存储项（并触发事件）
   */
  async loadAll() { throw new Error('IStorageManager.loadAll() must be implemented'); }

  /**
   * 删除指定存储项（并刷新列表）
   * @param {string} key - 键名
   */
  async removeItem(key) { throw new Error('IStorageManager.removeItem() must be implemented'); }

  /**
   * 更新指定存储项（并刷新列表）
   * @param {string} key - 键名
   * @param {any} value - 新值
   */
  async updateItem(key, value) { throw new Error('IStorageManager.updateItem() must be implemented'); }

  /**
   * 清除所有存储（并刷新列表）
   */
  async clearAll() { throw new Error('IStorageManager.clearAll() must be implemented'); }
}

window.IStorageManager = IStorageManager;

// 向后兼容：保留 IStorage 别名
window.IStorage = IStorageManager;