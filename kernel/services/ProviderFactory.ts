/**
 * ProviderFactory - Provider Service 工厂
 *
 * 职责：
 * - 根据 settings 创建对应的 provider service 实例
 * - 持有并管理 currentProviderService（从 Kernel 上移出的业务逻辑）
 * - 订阅 settings 事件，自动响应配置变更
 */

import { BaseProviderAPIService } from './IProviderAPIService.js';
import { KernelEvents } from '../Events.js';
import { Settings } from '../models/Settings.js';
import { Log } from './Log.js';
import { IPC } from '../IPC.js';

/** 最小 Kernel 接口，避免与 Kernel.ts 产生循环引用 */
interface KernelRef { getIPC(): IPC | null; getSettingsManager(): { getSettings(): Record<string, any> }; }
import { OpenAIService } from './ProviderAPIServices/OpenAIService.js';
import { OpenRouterService } from './ProviderAPIServices/OpenRouterService.js';
import { LMStudioService } from './ProviderAPIServices/LMStudioService.js';

export class ProviderFactory {
  kernel: KernelRef;
  ipc: IPC | null;
  settingsChannel: IPC | null;
  _listening: boolean;
  _listenerRefs: Array<{ event: string; fn: (...args: unknown[]) => void }>;
  currentProvider: BaseProviderAPIService | null;

  constructor(kernel: KernelRef) {
    this.kernel = kernel;
    this.ipc = kernel?.getIPC() ?? null;
    this.settingsChannel = this.ipc?.getOrCreateChannel('settings') ?? null;
    this._listening = false;
    this._listenerRefs = [];
    this.currentProvider = null;
    // 构造时立即同步应用已有 settings，确保 HANDLERS_INIT 时 provider 已就绪
    const existing = kernel?.getSettingsManager()?.getSettings();
    this._applySettings(existing);
    this._registerListeners();
  }

  /** 获取当前活跃的 provider service */
  getCurrentProvider(): BaseProviderAPIService | null {
    return this.currentProvider;
  }

  /** 更新当前 provider service（由工厂内部或 Shell EventHandler 调用） */
  updateProvider(service: BaseProviderAPIService) {
    if (!service) return;
    this.currentProvider = service;
    Log.info('PROVIDER_FACTORY', `Provider updated: ${service.name}`);
  }

  _onSettingsLoaded = (data: any) => { if (data?.settings) this._applySettings(data.settings); };
  _onSettingsUpdated = (data: any) => { if (data?.newSettings || data?.settings) this._applySettings(data.newSettings || data.settings); };
  _onSettingsSaved = (data: any) => { if (data?.settings) this._applySettings(data.settings); };
  _onApiStandardChanged = (data: any) => {
    const settings = this.kernel.getSettingsManager()?.getSettings();
    if (settings && data?.apiStandard) { settings.apiStandard = data.apiStandard; this._applySettings(settings); }
  };

  _registerListeners() {
    if (!this.settingsChannel || this._listening) return;
    this._listening = true;
    const pairs: Array<[string, (...args: unknown[]) => void]> = [
      [KernelEvents.SETTINGS.LOADED, this._onSettingsLoaded],
      [KernelEvents.SETTINGS.UPDATED, this._onSettingsUpdated],
      [KernelEvents.SETTINGS.SAVED, this._onSettingsSaved],
      [KernelEvents.SETTINGS.API_STANDARD_CHANGED, this._onApiStandardChanged],
    ];
    for (const [event, fn] of pairs) {
      this.settingsChannel.on(event, fn);
      this._listenerRefs.push({ event, fn });
    }
  }

  /** 根据 apiStandard 创建对应的 Provider Service */
  _createService(apiStandard: string, effective: { apiEndpoint: string; apiKey: string; model: string }): BaseProviderAPIService | null {
    const ServiceClass = apiStandard === 'openai' ? OpenAIService
      : apiStandard === 'openrouter' ? OpenRouterService
      : apiStandard === 'lm-studio' ? LMStudioService
      : null;
    if (!ServiceClass) return null;
    const service = new (ServiceClass as any)() as BaseProviderAPIService;
    service.config = Object.assign(new Settings(), {
      provider: apiStandard, endpoint: effective.apiEndpoint,
      apiKey: effective.apiKey, model: effective.model,
    });
    return service;
  }

  _applySettings(settings: Record<string, any>) {
    if (!settings) return;
    const apiStandard = settings.apiStandard || 'openai';
    Log.info('PROVIDER_FACTORY', `Applying settings: apiStandard=${apiStandard}`);
    const effective = {
      apiEndpoint: settings.apiEndpoint,
      apiKey: settings.apiKey || '',
      model: settings.model || 'gpt-4o',
    };
    const service = this._createService(apiStandard, effective);
    if (service) this.updateProvider(service);
  }

  destroy() {
    if (!this.settingsChannel || !this._listening) return;
    for (const { event, fn } of this._listenerRefs) {
      this.settingsChannel.off(event, fn);
    }
    this._listenerRefs = [];
    this._listening = false;
  }
}
