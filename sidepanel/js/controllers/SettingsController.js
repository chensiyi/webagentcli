/**
 * SettingsController - 设置控制器（IAppSettings 的具体实现）
 * 
 * 职责：
 * 1. 实现 IAppSettings 接口定义的所有方法
 * 2. 处理设置管理业务逻辑（加载、保存、应用）
 * 3. 通过 EventBus 与其他模块通信
 * 
 * 设计原则：
 * - 继承 IAppSettings 基类
 * - 包含完整的业务逻辑实现
 * - 统一通过 ServiceCenter 管理 Provider 服务实例
 */

class SettingsController extends window.IAppSettings {
  /**
   * @param {ServiceCenter} serviceCenter - 服务中心
   */
  constructor(serviceCenter) {
    super(serviceCenter.getEventBus());
    this.serviceCenter = serviceCenter;
    
    this.settings = new window.Settings();
    
    console.log('[SettingsController] Initialized');
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
    
    // 通知 ServiceCenter 重置 ProviderService（下次获取时会自动按新设置创建）
    this.serviceCenter.resetProviderService();
    
    console.log('[SettingsController] Provider service reset notified due to settings update');
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
    this.eventBus.emit(window.Events.SETTINGS.API_ENDPOINT_CHANGED, {
      apiStandard,
      endpoint: defaultEndpoint,
      isAutoFilled: true
    });
    
    // 同时发布设置更新事件，确保其他模块也能感知到变化
    this.eventBus.emit(window.Events.SETTINGS.UPDATED, {
      updates: { apiStandard, apiEndpoint: defaultEndpoint, ...preservedParams },
      newSettings: this.settings.toJSON()
    });
    
    // 重置服务
    this.serviceCenter.resetProviderService();
    
    console.log('[SettingsController] API standard changed:', apiStandard, '-> endpoint:', defaultEndpoint);
  }
  
  /**
   * 处理模型加载请求
   */
  async _handleModelsRequest(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    
    console.log('[SettingsController] MODELS_REQUEST received');
    
    // 设置加载状态
    if (window.Pages && window.Pages.settings) {
      const updateLoadButtonState = window.Pages.settings.updateLoadButtonState;
      if (typeof updateLoadButtonState === 'function') {
        updateLoadButtonState(true);
      }
    }
    
    try {
      const modelController = this.serviceCenter.getModelController();
      
      // 通过 ModelController 获取并标准化模型
      const models = await modelController.fetchModels({
        apiStandard,
        apiEndpoint,
        apiKey,
        forceRefresh: true
      });
      
      // 发布模型加载完成事件
      this.eventBus.emit(window.Events.SETTINGS.MODELS_LOADED, {
        models: models.map(m => m.toJSON()),
        count: models.length,
        fromCache: false
      });
      
      console.log('[SettingsController] Loaded', models.length, 'models via ModelController');
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
    
    console.log('[SettingsController] Updating settings:', {
      apiStandard: updates.apiStandard,
      apiEndpoint: updates.apiEndpoint,
      model: updates.model
    });
    
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
    const settings = this.getSettings();
    if (!settings || !settings.apiEndpoint) return false;

    const modelController = this.serviceCenter.getModelController();
    await modelController.clearCache(settings.apiEndpoint);
    
    console.log('[SettingsController] Model cache cleared via ModelController');
    
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

// 导出类（由 ServiceCenter 创建实例）
if (typeof window !== 'undefined') {
  window.SettingsController = SettingsController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsController;
}
