/**
 * 设置页面事件处理器
 * 负责注册设置页面的事件监听器，连接 View 和 Controller
 */

class SettingsEventHandler {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    
    // 通过 ServiceCenter 获取 SettingsController 实例
    if (serviceCenter) {
      this.settingsController = serviceCenter.getSettingsController();
    }
    
    // 注册事件监听
    this._registerEventListeners();
    
    // 主动加载设置
    this._loadSettingsOnInit();
  }
  
  /**
   * 初始化时加载设置
   */
  _loadSettingsOnInit() {
    if (this.settingsController) {
      this.settingsController.loadSettings().then(() => {
        console.log('[SettingsEventHandler] Settings loaded on init');
      }).catch(err => {
        console.error('[SettingsEventHandler] Failed to load settings:', err);
      });
    }
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听 API 标准变更
    this.eventBus.on(window.Events.SETTINGS.API_STANDARD_CHANGED, (data) => {
      this._handleApiStandardChanged(data);
    });
    
    // 监听模型加载请求
    this.eventBus.on(window.Events.SETTINGS.MODELS_REQUEST, (data) => {
      this._handleModelsRequest(data);
    });
    
    // 监听设置更新，动态重新配置 Service
    this.eventBus.on(window.Events.SETTINGS.UPDATED, (data) => {
      this._handleSettingsUpdate(data);
    });
    
    // 监听 API 端点变更（自动填充）
    this.eventBus.on(window.Events.SETTINGS.API_ENDPOINT_CHANGED, (data) => {
      this._handleApiEndpointChanged(data);
    });
    
    // 监听模型列表加载完成
    this.eventBus.on(window.Events.SETTINGS.MODELS_LOADED, (data) => {
      this._handleModelsLoaded(data);
    });
    
    // 监听模型加载错误
    this.eventBus.on(window.Events.SETTINGS.MODELS_ERROR, (data) => {
      this._handleModelsError(data);
    });
    
    // 监听保存设置请求
    this.eventBus.on(window.Events.SETTINGS.SAVE_REQUEST, (data) => {
      this._handleSaveRequest(data);
    });
    
    // 监听设置保存完成
    this.eventBus.on(window.Events.SETTINGS.SAVED, (data) => {
      this._handleSettingsSaved(data);
    });
    
    // 监听设置加载完成
    this.eventBus.on(window.Events.SETTINGS.LOADED, (data) => {
      this._handleSettingsLoaded(data);
    });
    
    // 监听模型刷新确认请求
    this.eventBus.on('settings:confirmReloadModels', (data) => {
      this._handleConfirmReloadModels(data);
    });
  }
  
  /**
   * 处理 API 标准变更
   */
  _handleApiStandardChanged(data) {
    if (this.settingsController) {
      this.settingsController._handleApiStandardChange(data);
    }
  }
  
  /**
   * 处理模型加载请求
   */
  async _handleModelsRequest(data) {
    if (this.settingsController) {
      await this.settingsController._handleModelsRequest(data);
    }
  }
  
  /**
   * 处理设置更新（重新配置服务）
   */
  _handleSettingsUpdate(data) {
    if (this.settingsController) {
      this.settingsController._handleSettingsUpdate(data);
    }
  }
  
  /**
   * 处理保存设置请求
   */
  async _handleSaveRequest(data) {
    const { settings } = data;
    
    console.log('[SettingsEventHandler] Save request received:', {
      apiStandard: settings.apiStandard,
      apiEndpoint: settings.apiEndpoint,
      model: settings.model
    });
    
    try {
      // 调用 Controller 的 updateSettings 方法
      if (this.settingsController) {
        this.settingsController.updateSettings(settings);
        console.log('[SettingsEventHandler] Settings update delegated to Controller');
      }
    } catch (error) {
      console.error('[SettingsEventHandler] Save error:', error);
      window.Toast?.error('保存失败: ' + error.message);
    }
  }
  
  /**
   * 处理 API 端点变更
   */
  _handleApiEndpointChanged(data) {
    const { endpoint, isAutoFilled, apiStandard } = data;
    
    console.log('[SettingsEventHandler] API_ENDPOINT_CHANGED received:', {
      endpoint,
      isAutoFilled,
      apiStandard,
      hasPages: !!window.Pages,
      hasSettingsPage: !!(window.Pages && window.Pages.settings)
    });
    
    if (isAutoFilled && window.Pages && window.Pages.settings) {
      // 先更新 Page 的内部 currentSettings，确保后续操作（如加载模型）使用新端点
      if (window.Pages.settings.currentSettings) {
        console.log('[SettingsEventHandler] Before update - currentSettings:', {
          apiStandard: window.Pages.settings.currentSettings.apiStandard,
          apiEndpoint: window.Pages.settings.currentSettings.apiEndpoint
        });
        
        window.Pages.settings.currentSettings.apiEndpoint = endpoint;
        window.Pages.settings.currentSettings.apiStandard = apiStandard;
        
        console.log('[SettingsEventHandler] After update - currentSettings:', { 
          apiStandard: window.Pages.settings.currentSettings.apiStandard,
          apiEndpoint: window.Pages.settings.currentSettings.apiEndpoint 
        });
      } else {
        console.warn('[SettingsEventHandler] window.Pages.settings.currentSettings is null!');
      }
      
      // 重新渲染整个页面以反映新的 API 标准
      // 注意：这里调用 fillForm 来更新所有表单字段（包括 API 标准选择框）
      const fillForm = window.Pages.settings.fillForm;
      if (typeof fillForm === 'function') {
        console.log('[SettingsEventHandler] Calling fillForm with:', {
          apiStandard: window.Pages.settings.currentSettings?.apiStandard,
          apiEndpoint: window.Pages.settings.currentSettings?.apiEndpoint
        });
        fillForm(window.Pages.settings.currentSettings);
      }
      
      // 重新渲染 Provider 配置，这会自动使用新的端点值填充输入框
      const rerenderProviderConfig = window.Pages.settings.rerenderProviderConfig;
      if (typeof rerenderProviderConfig === 'function') {
        rerenderProviderConfig();
      }
      
      console.log('[SettingsEventHandler] Auto-filled endpoint and re-rendered UI:', endpoint);
    }
  }
  
  /**
   * 处理模型列表加载完成
   */
  _handleModelsLoaded(data) {
    const { models, count, fromCache } = data;
    
    // 通知 Page 更新缓存
    if (window.Pages && window.Pages.settings) {
      const updateModelCache = window.Pages.settings.updateModelCache;
      if (typeof updateModelCache === 'function') {
        updateModelCache(models);
      }
      
      const updateModelDropdown = window.Pages.settings.updateModelDropdown;
      if (typeof updateModelDropdown === 'function') {
        updateModelDropdown();
      }
    }
    
    // 显示成功提示（区分缓存和 API）
    const source = fromCache ? '（缓存）' : '';
    window.Toast?.success(`成功加载 ${count} 个模型${source}`);
    
    console.log('[SettingsEventHandler] Models loaded:', count, fromCache ? '(from cache)' : '(from API)');
  }
  
  /**
   * 处理模型加载错误
   */
  _handleModelsError(data) {
    const { error } = data;
    window.Toast?.error('加载失败: ' + error.message);
    
    // 重置加载按钮状态
    const btn = document.getElementById('load-models-btn');
    if (btn) {
      btn.textContent = '加载模型';
      btn.disabled = false;
    }
    
    console.error('[SettingsEventHandler] Models load error:', error);
  }
  
  /**
   * 处理设置保存完成
   */
  _handleSettingsSaved(data) {
    const { settings } = data;
    
    console.log('[SettingsEventHandler] Settings saved successfully:', {
      apiStandard: settings.apiStandard,
      apiEndpoint: settings.apiEndpoint,
      model: settings.model
    });
    
    // 初始化 Agent
    if (window.Agent) {
      const ai = new window.Agent();
      ai.registerProvider('default', {
        endpoint: settings.apiEndpoint,
        apiKey: settings.apiKey || 'local',
        defaultModel: settings.model,
        adapterType: settings.apiStandard || 'openrouter'
      });
      ai.setProvider('default');
      window.aiManager = ai;
      console.log('[SettingsEventHandler] AI Manager initialized with adapter:', settings.apiStandard);
    }
    
    // 显示成功提示
    window.Toast?.success('设置已保存');
  }
  
  /**
   * 处理设置加载完成
   */
  _handleSettingsLoaded(data) {
    const { settings } = data;
    
    // 通知页面填充表单
    if (window.Pages && window.Pages.settings) {
      const fillForm = window.Pages.settings.fillForm;
      if (typeof fillForm === 'function') {
        fillForm(settings);
      }
    }
    
    console.log('[SettingsEventHandler] Settings loaded');
  }
  
  /**
   * 处理模型刷新确认请求
   */
  async _handleConfirmReloadModels(data) {
    const { apiKey, apiEndpoint, apiStandard } = data;
    
    const dialogResult = await new Promise((resolve) => {
      if (window.ConfirmDialog) {
        window.ConfirmDialog.show({
          title: '刷新模型',
          message: '确定要重新从 API 拉取模型列表吗？这将清除当前缓存。',
          confirmText: '确定',
          cancelText: '取消',
          onConfirm: () => resolve(true)
        });
      } else {
        resolve(confirm('确定要重新从 API 拉取模型列表吗？'));
      }
    });
    
    if (dialogResult) {
      // 用户确认，先清除缓存再重新加载
      const settingsController = this.serviceCenter.getSettingsController();
      await settingsController.clearModelCache();
      
      // 发布模型加载请求事件
      this.eventBus.emit(window.Events.SETTINGS.MODELS_REQUEST, {
        apiKey,
        apiEndpoint,
        apiStandard
      });
    }
  }
}

// 不导出到全局，仅在 app.js 中通过 new SettingsEventHandler(serviceCenter) 创建实例
