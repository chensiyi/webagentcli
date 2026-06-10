/**
 * ServiceCenter - 框架核心服务管理中心（向后兼容层）
 * 
 * 职责：
 * - 提供全局框架服务的统一访问入口（单例管理）
 * - 底层 IPC 由 Kernel 提供，不再创建独立 EventBus
 * 
 * 注意：新代码应通过 kernel.get('serviceName') 访问服务
 */

class ServiceCenter {
  constructor(ipc = null) {
    // 使用 Kernel IPC 代替独立 EventBus
    this.eventBus = ipc;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsManager = null;
    this.storageManager = null;
    this.scriptsManager = null;
    this.modelManager = null;
    this.currentProviderService = null;
    this.currentProviderId = null;
    this.chatController = null;

    // 工具注册表
    this.tools = new Map();
  }

  /**
   * 获取事件总线实例（返回 Kernel IPC，API 完全兼容）
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 设置 IPC 实例（由 app.js 注入 Kernel IPC）
   * @param {IPC} ipc
   */
  setIPC(ipc) {
    this.eventBus = ipc;
    this._ownsEventBus = false;
  }

  /**
   * 初始化 SessionManager
   * @returns {Promise<void>}
   */
  initializeSessionManager() {
    if (this.sessionManager) {
      return Promise.resolve();
    }
    
    if (!window.SessionManager || !this.eventBus) {
      throw new Error('SessionManager or IPC not initialized');
    }
    
    this.sessionManager = new window.SessionManager(this.eventBus);
    
    console.log('[ServiceCenter] SessionManager initialized');

    this._registerBuiltInTools();
    
    return this.sessionManager.initialize();
  }

  // ==================== 工具管理 ====================

  _registerBuiltInTools() {
    const builtInClasses = [
      window.RunUserScriptTool,
      window.ManageUserScriptsTool
    ];

    builtInClasses.forEach(ToolClass => {
      if (typeof ToolClass !== 'function') return;
      try {
        const tool = new ToolClass();
        if (tool.definition && tool.definition.name) {
          this.tools.set(tool.definition.name, tool);
          console.log(`[ServiceCenter] Built-in tool registered: ${tool.definition.name} (enabled: ${tool.enabled})`);
        }
      } catch (e) {
        console.warn('[ServiceCenter] Failed to register tool:', e);
      }
    });
  }

  /**
   * 获取指定工具
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * 获取所有已启用的工具
   */
  getEnabledTools() {
    return Array.from(this.tools.values()).filter(t => t.enabled);
  }

  /**
   * 获取所有工具
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具定义（传给 LLM）
   */
  getToolDefinitionsForLLM() {
    return this.getEnabledTools()
      .filter(t => t.definition)
      .map(t => t.definition.toOpenAIFunction());
  }

  /**
   * 获取 SessionManager
   */
  getSessionManager() {
    if (!this.sessionManager) {
      throw new Error('SessionManager not initialized. Call initializeSessionManager() first.');
    }
    return this.sessionManager;
  }

  /**
   * 获取 SettingsManager
   */
  getSettingsManager() {
    if (!this.settingsManager) {
      if (!window.SettingsManager || !this.eventBus) {
        throw new Error('SettingsManager or IPC not initialized');
      }
      this.settingsManager = new window.SettingsManager(this);
      console.log('[ServiceCenter] SettingsManager initialized');
    }
    return this.settingsManager;
  }

  /**
   * 获取 StorageManager
   * 注意：类名改为 AppStorageManager，避免与浏览器原生 StorageManager API 冲突
   */
  getStorageManager() {
    if (!this.storageManager) {
      if (!window.AppStorageManager) {
        throw new Error('AppStorageManager not initialized');
      }
      this.storageManager = new window.AppStorageManager(this);
      console.log('[ServiceCenter] StorageManager initialized');
    }
    return this.storageManager;
  }

  /**
   * 获取 ScriptsManager
   */
  getScriptsManager() {
    if (!this.scriptsManager) {
      if (!window.ScriptsManager) {
        throw new Error('ScriptsManager not initialized');
      }
      this.scriptsManager = new window.ScriptsManager(this);
      console.log('[ServiceCenter] ScriptsManager initialized');
    }
    return this.scriptsManager;
  }

  /**
   * 获取 ModelManager
   */
  getModelManager() {
    if (!this.modelManager) {
      if (!window.ModelManager) {
        throw new Error('ModelManager not initialized');
      }
      this.modelManager = new window.ModelManager(this);
      console.log('[ServiceCenter] ModelManager initialized');
    }
    return this.modelManager;
  }

  /**
   * 登记或更新当前活跃的 Provider API 服务
   */
  updateProviderService(settings) {
    if (!settings || !settings.apiStandard) {
      console.warn('[ServiceCenter] Cannot update provider: settings or apiStandard missing');
      return null;
    }

    const providerId = settings.apiStandard;
    const config = {
      endpoint: settings.apiEndpoint,
      apiKey: settings.apiKey,
      defaultModel: settings.model || 'default'
    };

    if (!this.currentProviderService || this.currentProviderId !== providerId) {
      this.currentProviderService = this.createProviderService(providerId, config);
      this.currentProviderId = providerId;
      console.log('[ServiceCenter] New provider service registered:', providerId);
    } else {
      const currentConfig = this.currentProviderService.config || {};
      const configChanged = 
        currentConfig.endpoint !== config.endpoint ||
        currentConfig.apiKey !== config.apiKey ||
        currentConfig.defaultModel !== config.defaultModel;

      if (configChanged) {
        this.currentProviderService.configure(config);
        console.log('[ServiceCenter] Existing provider service updated:', providerId);
      }
    }

    return this.currentProviderService;
  }

  /**
   * 获取当前活跃的 Provider API 服务
   */
  getCurrentProviderService() {
    if (!this.currentProviderService) {
      const settings = this.getSettingsManager().getSettings();
      if (settings && settings.apiStandard) {
        return this.updateProviderService(settings.toJSON ? settings.toJSON() : settings);
      }
      throw new Error('Chat service not registered. Please ensure provider is initialized via SettingsEventHandler.');
    }
    return this.currentProviderService;
  }

  /**
   * 获取 ChatController（单例）
   */
  getChatController() {
    if (!this.chatController) {
      this.chatController = new window.ChatController(this);
      console.log('[ServiceCenter] ChatController initialized');
    }
    return this.chatController;
  }

  /**
   * 创建 Provider API 服务实例
   */
  createProviderService(providerId, config) {
    let ServiceClass = null;
    switch (providerId) {
      case 'openai':
        ServiceClass = window.OpenAIService;
        break;
      case 'openrouter':
        ServiceClass = window.OpenRouterService;
        break;
      case 'lm-studio':
        ServiceClass = window.LMStudioService;
        break;
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
    
    if (!ServiceClass) {
      throw new Error(`Service class not found for provider: ${providerId}`);
    }
    
    const service = new ServiceClass();
    service.configure(config);
    
    console.log('[ServiceCenter] Chat service created for:', providerId);
    return service;
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ServiceCenter = ServiceCenter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceCenter;
}