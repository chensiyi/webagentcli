export class IAppSettings {
  constructor() {}
  async loadSettings() {}
  async saveSetting(key, value) {}
  async getSetting(key) {}
  async getSettings() {}
  async resetSettings() {}
}
export default IAppSettings;