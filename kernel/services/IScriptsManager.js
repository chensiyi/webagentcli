/**
 * IScriptsManager - 脚本管理接口规范
 */
class IScriptsManager {
  constructor(serviceCenter) {
    if (new.target === IScriptsManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
  }

  async loadAll() { throw new Error('Not implemented'); }
  async install(code) { throw new Error('Not implemented'); }
  async updateCode(id, code) { throw new Error('Not implemented'); }
  async toggle(id, enabled) { throw new Error('Not implemented'); }
  async remove(id) { throw new Error('Not implemented'); }
}

window.IScriptsManager = IScriptsManager;
