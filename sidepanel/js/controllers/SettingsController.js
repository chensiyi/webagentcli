/**
 * 设置控制器
 * 负责设置的加载、保存、应用
 * 通过 EventBus 与其他模块通信
 */

class SettingsController {
  constructor() {
    this.settings = new window.Settings();
    this.storageKey = 'app_settings';
    this.eventBus = window.EventBus;
    
    // 注册事件监听
    this._registerEventListeners();
    
    // 加载设置
    this.loadSettings();
  }
  
  /**
   * 注册事件监听
   */
  _registerEventListeners() {
    // 监听 API 标准变更
    this.eventBus.on(window.Events.SETTINGS.API_STANDARD_CHANGED, (data) => {
      this._handleApiStandardChange(data);
    });
    
    // 监听模型加载请求
    this.eventBus.on(window.Events.SETTINGS.MODELS_REQUEST, (data) => {
      this._handleModelsRequest(data);
    });
  }
  
  /**
   * 处理 API 标准变更
   */
  _handleApiStandardChange(data) {
    const { apiStandard } = data;
    
    // 自动填充默认端点
    const defaultEndpoint = window.Settings.getDefaultEndpoint(apiStandard);
    
    // 发布端点变更事件
    this.eventBus.emit(window.Events.SETTINGS.API_ENDPOINT_CHANGED, {
      apiStandard,
      endpoint: defaultEndpoint,
      isAutoFilled: true
    });
    
    console.log('[SettingsController] API standard changed:', apiStandard, '-> endpoint:', defaultEndpoint);
  }
  
  /**
   * 处理模型加载请求
   */
  async _handleModelsRequest(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    
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
      
      // 通过 ServiceManager 获取 Service
      const service = window.ServiceManager.getService(apiStandard);
      if (!service) {
        throw new Error(`Unsupported API standard: ${apiStandard}`);
      }
      
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
      this.eventBus.emit(window.Events.SETTINGS.MODELS_LOADED, {
        models,
        count: models.length,
        fromCache: false
      });
      
      console.log('[SettingsController] Loaded', models.length, 'models from API');
    } catch (error) {
      this.eventBus.emit(window.Events.SETTINGS.MODELS_ERROR, { error });
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
    
    // 更新设置
    Object.assign(this.settings, updates);
    
    // 发布更新事件
    this.eventBus.emit(window.Events.SETTINGS.UPDATED, {
      updates,
      oldSettings,
      newSettings: this.settings.toJSON()
    });
    
    // 保存到存储
    this.saveSettings();
    
    console.log('[SettingsController] Settings updated:', updates);
  }
  
  /**
   * 保存设置
   */
  saveSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.storageKey]: this.settings.toJSON() }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log('[SettingsController] Settings saved');
        
        // 发布保存事件
        this.eventBus.emit(window.Events.SETTINGS.SAVED, {
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
          this.eventBus.emit(window.Events.SETTINGS.LOADED, {
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
    this.eventBus.emit(window.Events.SETTINGS.RESET);
    
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
