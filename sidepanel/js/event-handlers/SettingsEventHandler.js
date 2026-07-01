/**
 * 设置页面事件处理器
 * 负责注册设置页面的事件监听器，连接 View 和 Controller
 */

import { Events } from '../events.js';
import { Toast } from '../utils/toast.js';
import { Pages } from '../utils/dom.js';
import { ConfirmDialog } from '../utils/confirm.js';
import { OpenAIService } from '../../../kernel/services/ProviderAPIServices/OpenAIService.js';
import { OpenRouterService } from '../../../kernel/services/ProviderAPIServices/OpenRouterService.js';
import { LMStudioService } from '../../../kernel/services/ProviderAPIServices/LMStudioService.js';

class SettingsEventHandler {
  constructor(kernel) {
    this.kernel = kernel;
    this.ipc = kernel.getIPC();
    this.settingsChannel = this.ipc?.getOrCreateChannel('settings') || this.ipc;
    this.chatChannel = this.ipc?.getOrCreateChannel('chat') || this.ipc;
    
    if (kernel) {
      this.settingsManager = kernel.getSettingsManager();
    }
    
    this._registerEventListeners();
  }
  
  destroy() {
    if (!this.settingsChannel) return;
    this.settingsChannel.off(Events.SETTINGS.API_STANDARD_CHANGED);
    this.settingsChannel.off(Events.SETTINGS.MODELS_REQUEST);
    this.settingsChannel.off(Events.SETTINGS.UPDATED);
    this.settingsChannel.off(Events.SETTINGS.API_ENDPOINT_CHANGED);
    this.settingsChannel.off(Events.SETTINGS.MODELS_LOADED);
    this.settingsChannel.off(Events.SETTINGS.MODELS_ERROR);
    this.settingsChannel.off(Events.SETTINGS.SAVE_REQUEST);
    this.settingsChannel.off(Events.SETTINGS.SAVED);
    this.settingsChannel.off(Events.SETTINGS.LOADED);
    this.settingsChannel.off('settings:confirmReloadModels');
  }

  _registerEventListeners() {
    if (!this.settingsChannel) return;
    
    this.settingsChannel.on(Events.SETTINGS.API_STANDARD_CHANGED, (data) => this._handleApiStandardChanged(data));
    this.settingsChannel.on(Events.SETTINGS.MODELS_REQUEST, (data) => this._handleModelsRequest(data));
    this.settingsChannel.on(Events.SETTINGS.UPDATED, (data) => { this._handleSettingsUpdate(data); });
    this.settingsChannel.on(Events.SETTINGS.API_ENDPOINT_CHANGED, (data) => this._handleApiEndpointChanged(data));
    this.settingsChannel.on(Events.SETTINGS.MODELS_LOADED, (data) => this._handleModelsLoaded(data));
    this.settingsChannel.on(Events.SETTINGS.MODELS_ERROR, (data) => this._handleModelsError(data));
    this.settingsChannel.on(Events.SETTINGS.SAVE_REQUEST, (data) => this._handleSaveRequest(data));
    this.settingsChannel.on(Events.SETTINGS.SAVED, (data) => this._handleSettingsSaved(data));
    this.settingsChannel.on(Events.SETTINGS.LOADED, (data) => { this._handleSettingsLoaded(data); });
    this.settingsChannel.on('settings:confirmReloadModels', (data) => this._handleConfirmReloadModels(data));
  }
  
  _handleApiStandardChanged(data) {
    if (this.settingsManager) this.settingsManager._handleApiStandardChange(data);
  }
  
  async _handleModelsRequest(data) {
    if (this.settingsManager) await this.settingsManager._handleModelsRequest(data);
  }
  
  _handleSettingsUpdate(data) {
    if (this.settingsManager) this.settingsManager._handleSettingsUpdate(data);
  }
  
  async _handleSaveRequest(data) {
    const { settings } = data;
    console.log('[SettingsEventHandler] Save request received:', { apiStandard: settings.apiStandard, apiEndpoint: settings.apiEndpoint, model: settings.model });
    try {
      if (this.settingsManager) {
        this.settingsManager.updateSettings(settings);
        console.log('[SettingsEventHandler] Settings update delegated to SettingsManager');
      }
    } catch (error) {
      console.error('[SettingsEventHandler] Save error:', error);
      Toast?.error('保存失败: ' + error.message);
    }
  }
  
  _handleApiEndpointChanged(data) {
    const { endpoint, isAutoFilled, apiStandard } = data;
    console.log('[SettingsEventHandler] API_ENDPOINT_CHANGED received:', { endpoint, isAutoFilled, apiStandard, hasPages: !!Pages, hasSettingsPage: !!(Pages && Pages.settings) });
    if (isAutoFilled && Pages && Pages.settings) {
      if (Pages.settings.currentSettings) {
        console.log('[SettingsEventHandler] Before update - currentSettings:', { apiStandard: Pages.settings.currentSettings.apiStandard, apiEndpoint: Pages.settings.currentSettings.apiEndpoint });
        Pages.settings.currentSettings.apiEndpoint = endpoint;
        Pages.settings.currentSettings.apiStandard = apiStandard;
        console.log('[SettingsEventHandler] After update - currentSettings:', { apiStandard: Pages.settings.currentSettings.apiStandard, apiEndpoint: Pages.settings.currentSettings.apiEndpoint });
      } else {
        console.warn('[SettingsEventHandler] Pages.settings.currentSettings is null!');
      }
      const fillForm = Pages.settings.fillForm;
      if (typeof fillForm === 'function') {
        console.log('[SettingsEventHandler] Calling fillForm with:', { apiStandard: Pages.settings.currentSettings?.apiStandard, apiEndpoint: Pages.settings.currentSettings?.apiEndpoint });
        fillForm(Pages.settings.currentSettings);
      }
      const rerenderProviderConfig = Pages.settings.rerenderProviderConfig;
      if (typeof rerenderProviderConfig === 'function') rerenderProviderConfig();
      console.log('[SettingsEventHandler] Auto-filled endpoint and re-rendered UI:', endpoint);
    }
  }
  
  _handleModelsLoaded(data) {
    const { models, count, fromCache } = data;
    if (Pages && Pages.settings) {
      const updateModelCache = Pages.settings.updateModelCache;
      if (typeof updateModelCache === 'function') updateModelCache(models);
      const updateModelDropdown = Pages.settings.updateModelDropdown;
      if (typeof updateModelDropdown === 'function') updateModelDropdown();
    }
    const source = fromCache ? '（缓存）' : '';
    Toast?.success(`成功加载 ${count} 个模型${source}`);
    console.log('[SettingsEventHandler] Models loaded:', count, fromCache ? '(from cache)' : '(from API)');
  }
  
  _handleModelsError(data) {
    const { error } = data;
    Toast?.error('加载失败: ' + error.message);
    const btn = document.getElementById('load-models-btn');
    if (btn) { btn.textContent = '加载模型'; btn.disabled = false; }
    console.error('[SettingsEventHandler] Models load error:', error);
  }
  
  _handleSettingsSaved(data) {
    const { settings } = data;
    console.log('[SettingsEventHandler] Settings saved successfully:', { apiStandard: settings.apiStandard, apiEndpoint: settings.apiEndpoint, model: settings.model });
    Toast?.success('设置已保存');
  }
  
  _reconfigureProvider(settings) {
    if (!settings) return;
    // 根据 settings 创建对应的 provider service 实例
    let providerService = null;
    const apiStandard = settings.apiStandard || 'openai';
    if (apiStandard === 'openai' && OpenAIService) {
      providerService = new OpenAIService();
      providerService.config = {
        endpoint: settings.apiEndpoint || 'https://api.openai.com/v1',
        apiKey: settings.apiKey || '',
        model: settings.model || 'gpt-4o',
        provider: 'openai'
      };
    } else if (apiStandard === 'openrouter' && OpenRouterService) {
      providerService = new OpenRouterService();
      providerService.config = {
        endpoint: settings.apiEndpoint || 'https://openrouter.ai/api/v1',
        apiKey: settings.apiKey || '',
        model: settings.model || 'openai/gpt-4o',
        provider: 'openrouter'
      };
    } else if (apiStandard === 'lm-studio' && LMStudioService) {
      providerService = new LMStudioService();
      providerService.config = {
        endpoint: settings.apiEndpoint || 'http://localhost:1234/v1',
        apiKey: settings.apiKey || 'local',
        model: settings.model || 'local-model',
        provider: 'lm-studio'
      };
    }
    if (providerService && this.kernel) {
      this.kernel.getProviderFactory().updateProvider(providerService);
      console.log('[SettingsEventHandler] Provider service updated via ProviderFactory:', apiStandard, providerService.config);
    }
    // Agent 重构暂不可用，保留占位
    // if (window.Agent) { ... }
  }
  
  _handleSettingsLoaded(data) {
    const { settings } = data;
    if (Pages && Pages.settings) {
      const fillForm = Pages.settings.fillForm;
      if (typeof fillForm === 'function') fillForm(settings);
    }
    console.log('[SettingsEventHandler] Settings loaded');
  }
  
  async _handleConfirmReloadModels(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    const dialogResult = await new Promise((resolve) => {
      if (ConfirmDialog) {
        ConfirmDialog.show({ title: '刷新模型', message: '确定要重新从 API 拉取模型列表吗？这将清除当前缓存。', confirmText: '确定', cancelText: '取消', onConfirm: () => resolve(true) });
      } else {
        resolve(confirm('确定要重新从 API 拉取模型列表吗？'));
      }
    });
    if (dialogResult) {
      const settingsManager = this.kernel.getSettingsManager();
      await settingsManager.clearModelCache();
      this.settingsChannel?.emit(Events.SETTINGS.MODELS_REQUEST, { apiKey, apiEndpoint, apiStandard });
    }
  }
}

export { SettingsEventHandler };
