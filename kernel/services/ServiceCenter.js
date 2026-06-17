export class ServiceCenter {
  constructor(kernel) {
    this.kernel = kernel;
    this.ipc = kernel?.ipc;
    this.log = kernel?.log;
  }
  getEventBus() { return this.ipc || this.kernel?.ipc; }
  getSessionManager() { return this.sessionManager; }
  getSettingsManager() { return this.settingsManager; }
  getStorageManager() { return this.storageManager; }
  getScriptsManager() { return this.scriptsManager; }
  getModelManager() { return this.modelManager; }
  getProcessManager() { return this.processManager; }
  getAllTools() { return this.kernel?.toolRegistry?.getAll() || []; }
  getCurrentProviderService() { return this.currentProviderService; }
}
export default ServiceCenter;