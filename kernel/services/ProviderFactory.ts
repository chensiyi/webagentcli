/**
 * ProviderFactory - Provider Service 工厂
 *
 * 职责：
 * - 根据 settings 创建对应的 provider service 实例
 * - 持有并管理 currentProviderService（从 Kernel 上移出的业务逻辑）
 * - 订阅 settings 事件，自动响应配置变更
 */

import { IProviderAPIService } from './IProviderAPIService.js';
import { KernelEvents } from '../Events.js';
import { OpenAIService } from './ProviderAPIServices/OpenAIService.js';
import { OpenRouterService } from './ProviderAPIServices/OpenRouterService.js';
import { LMStudioService } from './ProviderAPIServices/LMStudioService.js';

export class ProviderFactory {
  kernel: any;
  ipc: any;
  settingsChannel: any;
  _listening: boolean;
  currentProvider: IProviderAPIService | null;

  constructor(kernel) {
    this.kernel = kernel;
    this.ipc = kernel?.getIPC();
    this.settingsChannel = this.ipc?.getOrCreateChannel('settings') || this.ipc;
    this._listening = false;
    this.currentProvider = null;
    // 构造时立即同步应用已有 settings，确保 HANDLERS_INIT 时 provider 已就绪
    const existing = kernel?.getSettingsManager()?.getSettings();
    this._applySettings(existing);
    this._registerListeners();
  }

  /** 获取当前活跃的 provider service */
  getCurrentProvider(): IProviderAPIService | null {
    return this.currentProvider;
  }

  /** 更新当前 provider service（由工厂内部或 Shell EventHandler 调用） */
  updateProvider(service: IProviderAPIService) {
    if (!service) return;
    this.currentProvider = service;
    this.kernel?.log?.info('PROVIDER_FACTORY', `Provider updated: ${service.name}`);
  }

  _registerListeners() {
    if (!this.settingsChannel || this._listening) return;
    this._listening = true;
    this.settingsChannel.on(KernelEvents.SETTINGS.LOADED, (data) => {
      if (data?.settings) this._applySettings(data.settings);
    });
    this.settingsChannel.on(KernelEvents.SETTINGS.UPDATED, (data) => {
      if (data?.newSettings || data?.settings) this._applySettings(data.newSettings || data.settings);
    });
    this.settingsChannel.on(KernelEvents.SETTINGS.SAVED, (data) => {
      if (data?.settings) this._applySettings(data.settings);
    });
    // 也监听 API_STANDARD_CHANGED，确保切换 provider 类型时即时生效
    this.settingsChannel.on(KernelEvents.SETTINGS.API_STANDARD_CHANGED, (data) => {
      const settings = this.kernel.getSettingsManager()?.getSettings();
      if (settings && data?.apiStandard) {
        settings.apiStandard = data.apiStandard;
        this._applySettings(settings);
      }
    });
  }

  _applySettings(settings) {
    if (!settings) return;
    const apiStandard = settings.apiStandard || 'openai';
    this.kernel.log?.info('PROVIDER_FACTORY', `Applying settings: apiStandard=${apiStandard}`);
    const effective = {
      apiEndpoint: settings.apiEndpoint,
      apiKey: settings.apiKey || '',
      model: settings.model || 'gpt-4o',
      provider: apiStandard,
    };
    let service: IProviderAPIService | null = null;
    if (apiStandard === 'openai') {
      service = new OpenAIService();
      service.config = {
        endpoint: effective.apiEndpoint,
        apiKey: effective.apiKey,
        model: effective.model,
        provider: 'openai'
      };
    } else if (apiStandard === 'openrouter') {
      service = new OpenRouterService();
      service.config = {
        endpoint: effective.apiEndpoint,
        apiKey: effective.apiKey,
        model: effective.model,
        provider: 'openrouter'
      };
    } else if (apiStandard === 'lm-studio') {
      service = new LMStudioService();
      service.config = {
        endpoint: effective.apiEndpoint,
        apiKey: effective.apiKey,
        model: effective.model,
        provider: 'lm-studio'
      };
    }
    if (service) {
      this.updateProvider(service);
    }
  }

  destroy() {
    if (!this.settingsChannel || !this._listening) return;
    this.settingsChannel.off(KernelEvents.SETTINGS.LOADED);
    this.settingsChannel.off(KernelEvents.SETTINGS.UPDATED);
    this.settingsChannel.off(KernelEvents.SETTINGS.SAVED);
    this.settingsChannel.off(KernelEvents.SETTINGS.API_STANDARD_CHANGED);
    this._listening = false;
  }
}
