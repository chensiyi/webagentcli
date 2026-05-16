/**
 * 设置页面事件处理器
 * 负责注册设置页面的事件监听器，连接 View 和 Controller
 */

class SettingsEventHandler {
  constructor() {
    this.eventBus = window.EventBus;
    this.settingsController = window.SettingsController;
    
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
   * 处理保存设置请求
   */
  async _handleSaveRequest(data) {
    const { settings } = data;
    
    try {
      // 调用 Controller 的 updateSettings 方法
      if (this.settingsController) {
        this.settingsController.updateSettings(settings);
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
    const { endpoint, isAutoFilled } = data;
    const endpointInput = document.getElementById('api-endpoint-input');
    
    if (endpointInput && isAutoFilled) {
      endpointInput.value = endpoint;
      
      // 触发 input 事件以更新内部状态
      const event = new Event('input', { bubbles: true });
      endpointInput.dispatchEvent(event);
      
      console.log('[SettingsEventHandler] Auto-filled endpoint:', endpoint);
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
      if (window.SettingsController) {
        await window.SettingsController.clearModelCache();
      }
      
      // 发布模型加载请求事件
      this.eventBus.emit(window.Events.SETTINGS.MODELS_REQUEST, {
        apiKey,
        apiEndpoint,
        apiStandard
      });
    }
  }
}

// 导出类（不自动实例化，由 app.js 控制初始化时机）
window.SettingsEventHandler = SettingsEventHandler;
