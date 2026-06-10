/**
 * ISettings - 设置页面接口规范（UI 契约）
 * 
 * 定义 Provider 设置的标准契约，包括渲染、验证等。
 * 注意：此类依赖 DOM，属于壳层而非内核。
 */

class ISettings {
  /**
   * 获取 Provider 名称
   * @returns {string}
   */
  getProviderName() {
    throw new Error('Method not implemented');
  }

  /**
   * 渲染设置表单到容器
   * @param {HTMLElement} container - 目标容器
   * @param {Object} settings - 当前设置对象
   * @param {Function} onUpdate - 更新回调 (key, value) => void
   */
  render(container, settings, onUpdate) {
    throw new Error('Method not implemented');
  }

  /**
   * 验证设置
   * @param {Object} settings - 设置对象
   * @returns {boolean}
   */
  validate(settings) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取默认设置
   * @returns {Object}
   */
  getDefaultSettings() {
    throw new Error('Method not implemented');
  }

  /**
   * 是否需要 API Key
   * @returns {boolean}
   */
  requiresApiKey() {
    return true;
  }
}

window.ISettings = ISettings;