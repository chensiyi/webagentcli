/**
 * IStorageManager - 存储管理器基类（抽象接口）
 */
class IStorageManager {
  constructor(serviceCenter) {
    if (new.target === IStorageManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
  }

  async loadAll() { throw new Error('Not implemented'); }
  async search(keyword) { throw new Error('Not implemented'); }
  async removeItem(key) { throw new Error('Not implemented'); }
  async updateItem(key, value) { throw new Error('Not implemented'); }
  async clearAll() { throw new Error('Not implemented'); }
}

window.IStorageManager = IStorageManager;