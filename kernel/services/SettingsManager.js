import IAppSettings from './IAppSettings.js';
export class SettingsManager extends IAppSettings {
  constructor() { super(); this._settings = {}; }
  async loadSettings() { return this._settings; }
  async saveSetting(key, value) { this._settings[key] = value; return this; }
  async getSetting(key) { return this._settings[key]; }
  async getSettings() { return { ...this._settings }; }
  async resetSettings() { this._settings = {}; }
}
export default SettingsManager;