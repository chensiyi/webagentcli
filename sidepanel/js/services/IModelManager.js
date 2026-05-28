/**
 * IModelManager - 模型管理接口规范
 */
class IModelManager {
  constructor(serviceCenter) {
    if (new.target === IModelManager) {
      throw new Error('Cannot instantiate abstract class directly');
    }
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
  }

  async fetchModels(params) { throw new Error('Not implemented'); }
  getModels() { throw new Error('Not implemented'); }
  getModel(modelId) { throw new Error('Not implemented'); }
  async clearCache() { throw new Error('Not implemented'); }
}

window.IModelManager = IModelManager;
