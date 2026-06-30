export class ISettings {
  constructor(obj = null) {
    this.ipc = obj?.ipc || null;
  }
  async loadSettings() {}
  async saveSetting(key, value) {}
  async getSetting(key) {}
  async getSettings() {}
  async resetSettings() {}
}