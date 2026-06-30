import { ISettings } from './ISettings.js';
import { KernelEvents } from '../Events.js';
import { KernelLog } from '../KernelLog.js';
import { IStorageManager } from './IStorageManager.js';

export class SettingsManager extends ISettings {
  storage: IStorageManager | null;
  log: KernelLog | null;
  _settings: Record<string, unknown>;

  constructor(obj = null) {
    super(obj);
    this.storage = obj?.storage || null;
    this.log = obj?.log || null;
    this._settings = {};
  }
  async loadSettings() {
    if (!this.storage) {
      this.log?.warn('SETTINGS', 'No storage adapter, using defaults');
      return this._settings;
    }
    try {
      const stored = await this.storage.get('app_settings');
      // loaded
      if (stored && typeof stored === 'object') {
        this._settings = { ...stored };
      } else {
        this.log?.info('SETTINGS', 'No valid settings in storage, keeping defaults');
      }
    } catch (e) {
      this.log?.warn('SETTINGS', `loadSettings error: ${e?.message}`);
    }
    // settings ready
    // 通过 IPC 通知 settingsChannel 设置已加载
    try {
      const channel = this.ipc?.getOrCreateChannel('settings');
      channel?.emit(KernelEvents.SETTINGS.LOADED, { settings: this._settings });
      // emitted
    } catch (e) {
      this.log?.warn('SETTINGS', `emit LOADED error: ${e?.message}`);
    }
    return this._settings;
  }
  async saveSetting(key, value) {
    this._settings[key] = value;
    if (this.storage) {
      try { await this.storage.set('app_settings', { ...this._settings }); } catch (e) {
        this.log?.warn('SETTINGS', `saveSetting error: ${e?.message}`);
      }
    }
    return this;
  }
  getSetting(key) { return this._settings[key]; }
  getSettings() { return { ...this._settings }; }
  resetSettings() { this._settings = {}; }

  updateSettings(settings) {
    Object.assign(this._settings, settings);
  }
  _handleApiStandardChange(data) { /* settings handler delegates to page */ }
  async _handleModelsRequest(data) { /* settings handler delegates to provider */ }
  _handleSettingsUpdate(data) { /* settings handler delegates to page */ }
  async clearModelCache() { /* clear models cache */ }
}