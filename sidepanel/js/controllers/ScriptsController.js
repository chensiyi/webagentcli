/**
 * Scripts Controller - 用户脚本管理控制器
 * 处理用户脚本业务逻辑，通过 EventBus 与 UI 通信
 */

class ScriptsController {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    this.model = window.ScriptsModel;
  }

  /**
   * 加载所有脚本
   */
  async loadAll() {
    try {
      const scripts = await this.model.getAll();
      this.eventBus.emit(Events.SCRIPTS.LOADED, { scripts });
    } catch (error) {
      this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }

  /**
   * 安装脚本
   * @param {string} code - 脚本代码
   */
  async install(code) {
    try {
      const script = await this.model.install(code);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }

  /**
   * 更新脚本代码
   * @param {string} id - 脚本 ID
   * @param {string} code - 新代码
   */
  async updateCode(id, code) {
    try {
      await this.model.updateCode(id, code);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }

  /**
   * 切换脚本启用状态
   * @param {string} id - 脚本 ID
   * @param {boolean} enabled - 启用状态
   */
  async toggle(id, enabled) {
    try {
      await this.model.toggle(id, enabled);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }

  /**
   * 删除脚本
   * @param {string} id - 脚本 ID
   */
  async remove(id) {
    try {
      await this.model.remove(id);
      await this.loadAll();
    } catch (error) {
      this.eventBus.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }
}

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.ScriptsController = ScriptsController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScriptsController;
}
