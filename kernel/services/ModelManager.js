import IModelManager from './IModelManager.js';
export class ModelManager extends IModelManager {
  constructor(serviceCenter) { super(serviceCenter); this.models = []; }
  getModel(id) { return this.models.find(m => m.id === id) || null; }
  getAll() { return [...this.models]; }
  async fetchModels() { return this.models; }
}
export default ModelManager;