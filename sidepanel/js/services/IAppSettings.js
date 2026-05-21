/**
 * IAppSettings - 应用设置管理器接口（抽象基类）
 * 
 * 定义应用设置管理的标准接口，所有具体实现必须继承此基类。
 * 
 * 职责：
 * - 定义设置管理的标准方法签名
 * - 提供默认的空实现（便于子类继承）
 * - 不包含具体业务逻辑
 * 
 * 设计原则：
 * 1. I 前缀表示这是一个接口规范
 * 2. 使用者可以实现自己的 IAppSettings 并替换
 * 3. 业务逻辑在具体实现类中（如 SettingsManager）
 */

class IAppSettings {
  /**
   * @param {EventBus} eventBus - 事件总线实例
   * @param {Object} storage - 存储接口（默认使用 chrome.storage.local）
   */
  constructor(eventBus, storage = null) {
    if (new.target === IAppSettings) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    
    this.eventBus = eventBus;
    this.storage = storage || chrome.storage.local;
    this.settings = null;
    this.storageKey = 'app_settings';
  }

  /**
   * 获取设置
   * @returns {Settings} 设置对象
   */
  getSettings() {
    throw new Error('Method not implemented: getSettings');
  }

  /**
   * 更新设置
   * @param {Object} updates - 要更新的设置项
   */
  updateSettings(updates) {
    throw new Error('Method not implemented: updateSettings');
  }

  /**
   * 保存设置
   * @returns {Promise<void>}
   */
  async saveSettings() {
    throw new Error('Method not implemented: saveSettings');
  }

  /**
   * 加载设置
   * @returns {Promise<Settings>}
   */
  async loadSettings() {
    throw new Error('Method not implemented: loadSettings');
  }

  /**
   * 重置设置
   */
  resetSettings() {
    throw new Error('Method not implemented: resetSettings');
  }

  /**
   * 处理 API 标准变更
   * @param {Object} data - { apiStandard }
   */
  _handleApiStandardChange(data) {
    throw new Error('Method not implemented: _handleApiStandardChange');
  }

  /**
   * 处理模型加载请求
   * @param {Object} data - { apiKey, apiEndpoint, apiStandard }
   */
  async _handleModelsRequest(data) {
    throw new Error('Method not implemented: _handleModelsRequest');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.IAppSettings = IAppSettings;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IAppSettings;
}
