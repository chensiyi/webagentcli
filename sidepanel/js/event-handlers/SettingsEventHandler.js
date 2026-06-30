/**
 * 设置页面事件处理器
 * 负责注册设置页面的事件监听器，连接 View 和 Controller
 */

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
    this.settingsChannel.off(window.Events.SETTINGS.API_STANDARD_CHANGED);
    this.settingsChannel.off(window.Events.SETTINGS.MODELS_REQUEST);
    this.settingsChannel.off(window.Events.SETTINGS.UPDATED);
    this.settingsChannel.off(window.Events.SETTINGS.API_ENDPOINT_CHANGED);
    this.settingsChannel.off(window.Events.SETTINGS.MODELS_LOADED);
    this.settingsChannel.off(window.Events.SETTINGS.MODELS_ERROR);
    this.settingsChannel.off(window.Events.SETTINGS.SAVE_REQUEST);
    this.settingsChannel.off(window.Events.SETTINGS.SAVED);
    this.settingsChannel.off(window.Events.SETTINGS.LOADED);
    this.settingsChannel.off('settings:confirmReloadModels');
  }

  _registerEventListeners() {
    if (!this.settingsChannel) return;
    
    this.settingsChannel.on(window.Events.SETTINGS.API_STANDARD_CHANGED, (data) => this._handleApiStandardChanged(data));
    this.settingsChannel.on(window.Events.SETTINGS.MODELS_REQUEST, (data) => this._handleModelsRequest(data));
    this.settingsChannel.on(window.Events.SETTINGS.UPDATED, (data) => { this._handleSettingsUpdate(data); });
    this.settingsChannel.on(window.Events.SETTINGS.API_ENDPOINT_CHANGED, (data) => this._handleApiEndpointChanged(data));
    this.settingsChannel.on(window.Events.SETTINGS.MODELS_LOADED, (data) => this._handleModelsLoaded(data));
    this.settingsChannel.on(window.Events.SETTINGS.MODELS_ERROR, (data) => this._handleModelsError(data));
    this.settingsChannel.on(window.Events.SETTINGS.SAVE_REQUEST, (data) => this._handleSaveRequest(data));
    this.settingsChannel.on(window.Events.SETTINGS.SAVED, (data) => this._handleSettingsSaved(data));
    this.settingsChannel.on(window.Events.SETTINGS.LOADED, (data) => { this._handleSettingsLoaded(data); });
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
      window.Toast?.error('保存失败: ' + error.message);
    }
  }
  
  _handleApiEndpointChanged(data) {
    const { endpoint, isAutoFilled, apiStandard } = data;
    console.log('[SettingsEventHandler] API_ENDPOINT_CHANGED received:', { endpoint, isAutoFilled, apiStandard, hasPages: !!window.Pages, hasSettingsPage: !!(window.Pages && window.Pages.settings) });
    if (isAutoFilled && window.Pages && window.Pages.settings) {
      if (window.Pages.settings.currentSettings) {
        console.log('[SettingsEventHandler] Before update - currentSettings:', { apiStandard: window.Pages.settings.currentSettings.apiStandard, apiEndpoint: window.Pages.settings.currentSettings.apiEndpoint });
        window.Pages.settings.currentSettings.apiEndpoint = endpoint;
        window.Pages.settings.currentSettings.apiStandard = apiStandard;
        console.log('[SettingsEventHandler] After update - currentSettings:', { apiStandard: window.Pages.settings.currentSettings.apiStandard, apiEndpoint: window.Pages.settings.currentSettings.apiEndpoint });
      } else {
        console.warn('[SettingsEventHandler] window.Pages.settings.currentSettings is null!');
      }
      const fillForm = window.Pages.settings.fillForm;
      if (typeof fillForm === 'function') {
        console.log('[SettingsEventHandler] Calling fillForm with:', { apiStandard: window.Pages.settings.currentSettings?.apiStandard, apiEndpoint: window.Pages.settings.currentSettings?.apiEndpoint });
        fillForm(window.Pages.settings.currentSettings);
      }
      const rerenderProviderConfig = window.Pages.settings.rerenderProviderConfig;
      if (typeof rerenderProviderConfig === 'function') rerenderProviderConfig();
      console.log('[SettingsEventHandler] Auto-filled endpoint and re-rendered UI:', endpoint);
    }
  }
  
  _handleModelsLoaded(data) {
    const { models, count, fromCache } = data;
    if (window.Pages && window.Pages.settings) {
      const updateModelCache = window.Pages.settings.updateModelCache;
      if (typeof updateModelCache === 'function') updateModelCache(models);
      const updateModelDropdown = window.Pages.settings.updateModelDropdown;
      if (typeof updateModelDropdown === 'function') updateModelDropdown();
    }
    const source = fromCache ? '（缓存）' : '';
    window.Toast?.success(`成功加载 ${count} 个模型${source}`);
    console.log('[SettingsEventHandler] Models loaded:', count, fromCache ? '(from cache)' : '(from API)');
  }
  
  _handleModelsError(data) {
    const { error } = data;
    window.Toast?.error('加载失败: ' + error.message);
    const btn = document.getElementById('load-models-btn');
    if (btn) { btn.textContent = '加载模型'; btn.disabled = false; }
    console.error('[SettingsEventHandler] Models load error:', error);
  }
  
  _handleSettingsSaved(data) {
    const { settings } = data;
    console.log('[SettingsEventHandler] Settings saved successfully:', { apiStandard: settings.apiStandard, apiEndpoint: settings.apiEndpoint, model: settings.model });
    window.Toast?.success('设置已保存');
  }
  
  _reconfigureProvider(settings) {
    if (!settings) return;
    // 根据 settings 创建对应的 provider service 实例
    let providerService = null;
    const apiStandard = settings.apiStandard || 'openai';
    if (apiStandard === 'openai' && window.OpenAIService) {
      providerService = new window.OpenAIService();
      providerService.config = {
        endpoint: settings.apiEndpoint || 'https://api.openai.com/v1',
        apiKey: settings.apiKey || '',
        model: settings.model || 'gpt-4o',
        provider: 'openai'
      };
    } else if (apiStandard === 'openrouter' && window.OpenRouterService) {
      providerService = new window.OpenRouterService();
      providerService.config = {
        endpoint: settings.apiEndpoint || 'https://openrouter.ai/api/v1',
        apiKey: settings.apiKey || '',
        model: settings.model || 'openai/gpt-4o',
        provider: 'openrouter'
      };
    } else if (apiStandard === 'lm-studio' && window.LMStudioService) {
      providerService = new window.LMStudioService();
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
    if (window.Agent) {
      const ai = new window.Agent();
      ai.registerProvider('default', { endpoint: settings.apiEndpoint, apiKey: settings.apiKey || 'local', defaultModel: settings.model, adapterType: settings.apiStandard || 'openrouter' });
      ai.setProvider('default');
      window.aiManager = ai;
      console.log('[SettingsEventHandler] AI Manager reconfigured with adapter:', settings.apiStandard);
    }
  }
  
  _handleSettingsLoaded(data) {
    const { settings } = data;
    if (window.Pages && window.Pages.settings) {
      const fillForm = window.Pages.settings.fillForm;
      if (typeof fillForm === 'function') fillForm(settings);
    }
    console.log('[SettingsEventHandler] Settings loaded');
  }
  
  async _handleConfirmReloadModels(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    const dialogResult = await new Promise((resolve) => {
      if (window.ConfirmDialog) {
        window.ConfirmDialog.show({ title: '刷新模型', message: '确定要重新从 API 拉取模型列表吗？这将清除当前缓存。', confirmText: '确定', cancelText: '取消', onConfirm: () => resolve(true) });
      } else {
        resolve(confirm('确定要重新从 API 拉取模型列表吗？'));
      }
    });
    if (dialogResult) {
      const settingsManager = this.kernel.getSettingsManager();
      await settingsManager.clearModelCache();
      this.settingsChannel?.emit(window.Events.SETTINGS.MODELS_REQUEST, { apiKey, apiEndpoint, apiStandard });
    }
  }
}

// 不导出到全局，仅在 app.js 中通过 new SettingsEventHandler(kernel) 创建实例
