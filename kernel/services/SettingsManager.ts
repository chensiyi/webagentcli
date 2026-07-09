import { BaseSettings } from './ISettings.js';
import { IPC } from '../IPC.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import { StorageKeys } from '../Keys.js';
import { Log } from './Log.js';
import { IStorageManager } from './IStorageManager.js';
import { clonePlain } from '../utils/clone.js';

export class SettingsManager extends BaseSettings {
  storage: IStorageManager | null;
  _settings: Record<string, unknown>;

  constructor(obj: { ipc?: IPC | null; storage?: IStorageManager | null } = {}) {
    super(obj);
    this.storage = obj?.storage ?? null;
    this._settings = {};
  }
  async loadSettings() {
    if (!this.storage) {
      Log.warn('SETTINGS', 'No storage adapter, using defaults');
      return this._settings;
    }
    try {
      const stored = await this.storage.get(StorageKeys.APP_SETTINGS);
      if (stored && typeof stored === 'object') {
        this._settings = { ...stored };
      } else {
        Log.info('SETTINGS', 'No valid settings in storage, keeping defaults');
      }
    } catch (e) {
      Log.warn('SETTINGS', `loadSettings error: ${(e)?.message}`);
    }
    // 通过 IPC 通知 settingsChannel 设置已加载
    try {
      const channel = this.ipc?.getOrCreateChannel(KernelChannels.SETTINGS);
      channel?.emit(KernelEvents.SETTINGS.LOADED, { settings: this._settings });
    } catch (e) {
      Log.warn('SETTINGS', `emit LOADED error: ${(e)?.message}`);
    }
    return this._settings;
  }
  async saveSetting(key: string, value: unknown) {
    // 防御：剥离 Svelte $state Proxy
    const plainValue = clonePlain(value);
    this._settings[key] = plainValue;
      if (this.storage) {
      try { await this.storage.set('app_settings', { ...this._settings }); } catch (e) {
        Log.warn('SETTINGS', `saveSetting error: ${(e)?.message}`);
      }
    }
    return this;
  }
  getSetting(key: string) { return this._settings[key]; }
  getSettings() { return { ...this._settings }; }
  resetSettings() { this._settings = {}; }

  /** 合并设置并持久化到存储，同时通过 IPC 通知 ProviderFactory 更新 */
  async saveSettings(settings: Record<string, any>) {
    // 防御：剥离 Svelte $state Proxy（JSON round-trip 确保纯 JS 对象）
    // 原因：前端传入的 settings 可能是 Svelte $state 代理对象，
    // Object.assign 会将代理内部属性（$$ 等）注入 _settings，导致 Chrome Storage 序列化异常
    const plainSettings: Record<string, any> = clonePlain(settings);
    Object.assign(this._settings, plainSettings);
    if (this.storage) {
      try {
        await this.storage.set(StorageKeys.APP_SETTINGS, { ...this._settings });
      } catch (e) {
        Log.warn('SETTINGS', `saveSettings error: ${(e)?.message}`);
      }
    }
    try {
      const channel = this.ipc?.getOrCreateChannel(KernelChannels.SETTINGS);
      channel?.emit(KernelEvents.SETTINGS.SAVED, { settings: { ...this._settings } });
    } catch (e) {
      Log.warn('SETTINGS', `emit SAVED error: ${(e)?.message}`);
    }
    Log.info('SETTINGS', 'Settings saved and SAVED event emitted');
  }
}