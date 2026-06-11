/**
 * Scripts Manager - 用户脚本管理器
 * 处理用户脚本业务逻辑，通过 EventBus 与 UI 通信
 */

class ScriptsManager extends window.IScriptsManager {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   * @param {ScriptsModel} [scriptsModel] - 脚本模型实例（可选）
   */
  constructor(serviceCenter, scriptsModel = null) {
    super(serviceCenter);
    this.model = scriptsModel;
  }

  /**
   * 设置脚本模型（运行时注入）
   * @param {ScriptsModel} scriptsModel
   */
  setScriptsModel(scriptsModel) {
    this.model = scriptsModel;
  }

  /**
   * 加载所有脚本
   */
  async loadAll() {
    if (!this.model) {
      console.warn('[ScriptsManager] No ScriptsModel not initialized');
      return;
    }
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
    if (!this.model) {
      console.warn('[ScriptsManager] No ScriptsModel not initialized');
      return;
    }
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
    if (!this.model) {
      console.warn('[ScriptsManager] No ScriptsModel not initialized');
      return;
    }
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
    if (!this.model) {
      console.warn('[ScriptsManager] No ScriptsModel not initialized');
      return;
    }
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
    if (!this.model) {
      console.warn('[ScriptsManager] No ScriptsModel not initialized');
      return;
    }
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
  window.ScriptsManager = ScriptsManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScriptsManager;
}
