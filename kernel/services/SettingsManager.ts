import { BaseSettings } from './ISettings.js';
import { KernelEvents } from '../Events.js';
import { Log } from './Log.js';
import { IStorageManager } from './IStorageManager.js';

export class SettingsManager extends BaseSettings {
  storage: IStorageManager | null;
  _settings: Record<string, unknown>;

  constructor(obj = null) {
    super(obj);
    this.storage = obj?.storage || null;
    this._settings = {};
  }
  async loadSettings() {
    if (!this.storage) {
      Log.warn('SETTINGS', 'No storage adapter, using defaults');
      return this._settings;
    }
    try {
      const stored = await this.storage.get('app_settings');
      if (stored && typeof stored === 'object') {
        this._settings = { ...stored };
      } else {
        Log.info('SETTINGS', 'No valid settings in storage, keeping defaults');
      }
    } catch (e) {
      Log.warn('SETTINGS', `loadSettings error: ${e?.message}`);
    }
    // 通过 IPC 通知 settingsChannel 设置已加载
    try {
      const channel = this.ipc?.getOrCreateChannel('settings');
      channel?.emit(KernelEvents.SETTINGS.LOADED, { settings: this._settings });
    } catch (e) {
      Log.warn('SETTINGS', `emit LOADED error: ${e?.message}`);
    }
    return this._settings;
  }
  async saveSetting(key, value) {
    this._settings[key] = value;
    if (this.storage) {
      try { await this.storage.set('app_settings', { ...this._settings }); } catch (e) {
        Log.warn('SETTINGS', `saveSetting error: ${e?.message}`);
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

  async saveSettings(settings: Record<string, any>) {
    this.updateSettings(settings);
    if (this.storage) {
      try {
        await this.storage.set('app_settings', { ...this._settings });
        Log.info('SETTINGS', `Saved settings: apiStandard=${settings.apiStandard || 'default'}`);
      } catch (e) {
        Log.warn('SETTINGS', `saveSettings error: ${(e as Error)?.message}`);
      }
    }
    // 通过 IPC 通知 ProviderFactory 重新配置 Provider
    try {
      const channel = this.ipc?.getOrCreateChannel('settings');
      channel?.emit(KernelEvents.SETTINGS.SAVED, { settings: this._settings });
    } catch (e) {
      Log.warn('SETTINGS', `emit SAVED error: ${(e as Error)?.message}`);
    }
    return this;
  }

  async clearModelCache() {
    await this.saveSetting('models', null);
    Log.info('SETTINGS', 'Model cache cleared');
  }
}