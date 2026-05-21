/**
 * Storage Manager - 存储管理器
 * 处理存储管理业务逻辑，通过 EventBus 与 UI 通信
 */

class StorageManager extends window.IStorageManager {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    super(serviceCenter);
    this.model = window.StorageModel;
  }

  /**
   * 加载所有存储项
   */
  async loadAll() {
    try {
      const items = await this.model.getAll();
      const stats = await this.model.getStats();
      
      this.eventBus.emit(window.Events.STORAGE.LOADED, { items, stats });
    } catch (error) {
      this.eventBus.emit(window.Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 搜索存储项
   * @param {string} keyword - 搜索关键词
   */
  async search(keyword) {
    try {
      const items = await this.model.search(keyword);
      this.eventBus.emit(window.Events.STORAGE.SEARCHED, { items, keyword });
    } catch (error) {
      this.eventBus.emit(window.Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 删除指定存储项
   * @param {string} key - 键名
   */
  async removeItem(key) {
    try {
      await this.model.remove(key);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(window.Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 编辑存储项
   * @param {string} key - 键名
   * @param {any} value - 新值
   */
  async updateItem(key, value) {
    try {
      await this.model.set(key, value);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(window.Events.STORAGE.ERROR, { error: error.message });
    }
  }

  /**
   * 清除所有存储
   */
  async clearAll() {
    try {
      await this.model.clear();
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(window.Events.STORAGE.ERROR, { error: error.message });
    }
  }
}

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
