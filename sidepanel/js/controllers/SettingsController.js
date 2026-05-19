/**
 * 设置控制器
 * 负责设置的加载、保存、应用
 * 通过 EventBus 与其他模块通信
 */

class SettingsController {
  constructor() {
    this.settings = new window.Settings();
    this.storageKey = 'app_settings';
    
    // 不在构造函数中加载设置，由 app.js 控制初始化时机
    // this.loadSettings();
  }
  
  /**
   * 处理设置更新
   */
  _handleSettingsUpdate(data) {
    const { updates } = data;
    
    // 检查是否更新了 API 相关配置
    const apiRelatedKeys = ['apiStandard', 'apiEndpoint', 'apiKey', 'model'];
    const hasApiUpdate = apiRelatedKeys.some(key => key in updates);
    
    if (!hasApiUpdate) {
      return; // 非 API 配置更新，无需重新配置 Service
    }
    
    // 重新配置 ChatService
    this._reconfigureChatService();
    
    // 如果切换了 API 标准，清除模型缓存
    if (updates.apiStandard) {
      this._reconfigureModelManager();
    }
  }
  
  /**
   * 重新配置聊天服务
   */
  _reconfigureChatService() {
    if (!window.ChatController) {
      console.warn('[SettingsController] ChatController not available');
      return;
    }
    
    const settings = this.settings.toJSON();
    
    // 直接创建 Service 实例
    let ServiceClass = null;
    switch (settings.apiStandard) {
      case 'openai':
        ServiceClass = window.OpenAIService;
        break;
      case 'openrouter':
        ServiceClass = window.OpenRouterService;
        break;
      case 'lm-studio':
        ServiceClass = window.LMStudioService;
        break;
    }
    
    if (!ServiceClass) {
      console.warn('[SettingsController] Unsupported API standard:', settings.apiStandard);
      return;
    }
    
    const service = new ServiceClass();
    
    // 重新配置服务
    service.configure({
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey,
      defaultModel: settings.model || 'default'
    });
    
    // 更新 ChatController 的服务引用
    window.ChatController.setService(service);
    
    // 同步更新全局 ChatService 引用（供 UI 层调用）
    window.ChatService = service;
    
    console.log('[SettingsController] ChatService reconfigured:', settings.apiStandard);
    
    // 发布服务重新配置事件
    window.EventBus.emit(window.Events.SERVICE.CONFIGURED, {
      apiStandard: settings.apiStandard,
      endpoint: settings.apiEndpoint
    });
  }
  
  /**
   * 重新配置模型管理器
   */
  _reconfigureModelManager() {
    if (!window.ModelManager) {
      console.warn('[SettingsController] ModelManager not available');
      return;
    }
    
    const settings = this.settings.toJSON();
    
    // 清除旧的模型缓存（因为 API 标准变了）
    window.ModelManager.clearCache();
    
    console.log('[SettingsController] ModelManager cache cleared for new API standard:', settings.apiStandard);
  }
  
  /**
   * 处理 API 标准变更
   */
  _handleApiStandardChange(data) {
    const { apiStandard } = data;
    
    // 自动填充默认端点
    const defaultEndpoint = window.Settings.getDefaultEndpoint(apiStandard);
    
    // 保存通用参数（temperature, maxTokens, systemPrompt 等）
    const preservedParams = {
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens,
      systemPrompt: this.settings.systemPrompt,
      autoContextTruncation: this.settings.autoContextTruncation
    };
    
    // 更新内部设置对象
    this.settings.apiStandard = apiStandard;
    this.settings.apiEndpoint = defaultEndpoint;
    
    // 恢复通用参数（确保不被重置）
    Object.assign(this.settings, preservedParams);
    
    // 发布端点变更事件（通知 UI 更新输入框）
    window.EventBus.emit(window.Events.SETTINGS.API_ENDPOINT_CHANGED, {
      apiStandard,
      endpoint: defaultEndpoint,
      isAutoFilled: true
    });
    
    // 同时发布设置更新事件，确保其他模块（如 ChatService）也能感知到变化
    window.EventBus.emit(window.Events.SETTINGS.UPDATED, {
      updates: { apiStandard, apiEndpoint: defaultEndpoint, ...preservedParams },
      newSettings: this.settings.toJSON()
    });
    
    console.log('[SettingsController] API standard changed:', apiStandard, '-> endpoint:', defaultEndpoint);
  }
  
  /**
   * 处理模型加载请求
   */
  async _handleModelsRequest(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    
    console.log('[SettingsController] MODELS_REQUEST received');
    console.trace('[SettingsController] MODELS_REQUEST call stack:');
    
    // 设置加载状态
    if (window.Pages && window.Pages.settings) {
      const updateLoadButtonState = window.Pages.settings.updateLoadButtonState;
      if (typeof updateLoadButtonState === 'function') {
        updateLoadButtonState(true);
      }
    }
    
    try {
      // 直接从 API 获取最新模型列表
      console.log('[SettingsController] Fetching models from API:', apiEndpoint);
      
      // 直接创建 Service 实例
      let ServiceClass = null;
      switch (apiStandard) {
        case 'openai':
          ServiceClass = window.OpenAIService;
          break;
        case 'openrouter':
          ServiceClass = window.OpenRouterService;
          break;
        case 'lm-studio':
          ServiceClass = window.LMStudioService;
          break;
      }
      
      if (!ServiceClass) {
        throw new Error(`Unsupported API standard: ${apiStandard}`);
      }
      
      const service = new ServiceClass();
      
      // 配置 Service
      service.configure({
        endpoint: apiEndpoint,
        apiKey: apiKey,
        defaultModel: 'default'
      });
      
      // 调用 Service 的 listModels 方法
      const models = await service.listModels();
      
      // 保存到缓存（用于页面初始化时显示）
      if (window.StorageModel) {
        const cacheKey = `models:${apiEndpoint}`;
        await window.StorageModel.setCache(cacheKey, models);
      }
      
      // 发布模型加载完成事件
      window.EventBus.emit(window.Events.SETTINGS.MODELS_LOADED, {
        models,
        count: models.length,
        fromCache: false
      });
      
      console.log('[SettingsController] Loaded', models.length, 'models from API');
    } catch (error) {
      window.EventBus.emit(window.Events.SETTINGS.MODELS_ERROR, { error });
    } finally {
      // 重置加载按钮状态（通过 Page）
      if (window.Pages && window.Pages.settings) {
        const updateLoadButtonState = window.Pages.settings.updateLoadButtonState;
        if (typeof updateLoadButtonState === 'function') {
          updateLoadButtonState(false);
        }
      }
    }
  }
  
  /**
   * 获取设置
   */
  getSettings() {
    return this.settings;
  }
  
  /**
   * 更新设置
   */
  updateSettings(updates) {
    const oldSettings = { ...this.settings.toJSON() };
    
    console.log('[SettingsController] Updating settings:', {
      apiStandard: updates.apiStandard,
      apiEndpoint: updates.apiEndpoint,
      model: updates.model
    });
    
    // 更新设置
    Object.assign(this.settings, updates);
    
    // 发布更新事件
    window.EventBus.emit(window.Events.SETTINGS.UPDATED, {
      updates,
      oldSettings,
      newSettings: this.settings.toJSON()
    });
    
    // 保存到存储
    this.saveSettings();
    
    console.log('[SettingsController] Settings updated and save initiated');
  }
  
  /**
   * 保存设置
   */
  saveSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.storageKey]: this.settings.toJSON() }, () => {
        if (chrome.runtime.lastError) {
          console.error('[SettingsController] Failed to save settings:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log('[SettingsController] Settings saved successfully to chrome.storage.local');
        
        // 发布保存事件
        window.EventBus.emit(window.Events.SETTINGS.SAVED, {
          settings: this.settings.toJSON()
        });
        
        resolve();
      });
    });
  }
  
  /**
   * 加载设置
   */
  loadSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        const data = result[this.storageKey];
        if (data) {
          this.settings = window.Settings.fromJSON(data);
          console.log('[SettingsController] Settings loaded:', this.settings);
          
          // 发布加载事件
          window.EventBus.emit(window.Events.SETTINGS.LOADED, {
            settings: this.settings.toJSON()
          });
          
          resolve(this.settings);
        } else {
          resolve(this.settings);
        }
      });
    });
  }
  
  /**
   * 加载模型列表（已废弃，直接使用 _handleModelsRequest）
   * @deprecated
   */
  async loadModels(apiKey, apiEndpoint, apiStandard) {
    console.warn('[SettingsController] loadModels is deprecated, use _handleModelsRequest instead');
    
    const service = window.ProviderServiceFactory.create(apiStandard);
    if (!service) {
      throw new Error(`Unsupported API standard: ${apiStandard}`);
    }
    
    service.configure({
      endpoint: apiEndpoint,
      apiKey: apiKey,
      defaultModel: 'default'
    });
    
    return await service.listModels();
  }
  
  /**
   * 重置设置
   */
  resetSettings() {
    this.settings = new window.Settings();
    this.saveSettings();
    
    // 发布重置事件
    window.EventBus.emit(window.Events.SETTINGS.RESET);
    
    console.log('[SettingsController] Settings reset');
  }
  
  /**
   * 清除模型缓存
   */
  async clearModelCache() {
    if (!window.StorageModel) {
      console.warn('[SettingsController] StorageModel not available');
      return false;
    }
    
    // 清除所有模型缓存
    await window.StorageModel.clearAllCache();
    
    console.log('[SettingsController] Model cache cleared');
    
    // 通知 Page 清空模型列表
    if (window.Pages && window.Pages.settings) {
      const updateModelCache = window.Pages.settings.updateModelCache;
      if (typeof updateModelCache === 'function') {
        updateModelCache([]);
      }
      
      const updateModelDropdown = window.Pages.settings.updateModelDropdown;
      if (typeof updateModelDropdown === 'function') {
        updateModelDropdown();
      }
    }
    
    return true;
  }
}

// 导出单例
window.SettingsController = new SettingsController();
