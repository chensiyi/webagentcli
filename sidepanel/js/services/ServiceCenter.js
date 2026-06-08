/**
 * ServiceCenter - 框架核心服务管理中心
 * 
 * 职责：
 * - 提供全局框架服务的统一访问入口（单例管理）
 * - 支持外部业务逻辑（如 EventHandler）注册和更新服务
 */

class ServiceCenter {
  constructor(eventBus = window.EventBus) {
    this.eventBus = eventBus;
    
    // 服务实例缓存
    this.sessionManager = null;
    this.settingsManager = null;
    this.storageManager = null;
    this.scriptsManager = null;
    this.modelManager = null;
    this.currentProviderService = null; // 当前活跃的 Provider API 服务
    this.currentProviderId = null;
    this.chatController = null; // ChatController 单例

    // 工具注册表
    this.tools = new Map(); // name → IToolService 实例
  }

  /**
   * 获取事件总线实例
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 初始化 SessionManager（等待异步加载完成）
   * @returns {Promise<void>}
   */
  initializeSessionManager() {
    if (this.sessionManager) {
      return Promise.resolve(); // 已经初始化
    }
    
    if (!window.SessionManager || !this.eventBus) {
      throw new Error('SessionManager or EventBus not initialized');
    }
    
    this.sessionManager = new window.SessionManager(this.eventBus);
    
    console.log('[ServiceCenter] SessionManager initialized');

    // 在初始化时注册内置工具
    this._registerBuiltInTools();
    
    // 返回 Promise，等待异步加载完成
    return this.sessionManager.initialize();
  }

  // ==================== 工具管理 ====================

  /**
   * 注册内置工具
   * @private
   */
  _registerBuiltInTools() {
    const builtInClasses = [
      window.GetPageContentTool,
      window.GetPageMetadataTool,
      window.ReadStorageTool,
      window.WriteStorageTool,
      window.ListStorageTool,
      window.RunUserScriptTool
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
   * @param {string} name - 工具名
   * @returns {IToolService|null}
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * 获取所有已启用的工具
   * @returns {IToolService[]}
   */
  getEnabledTools() {
    return Array.from(this.tools.values()).filter(t => t.enabled);
  }

  /**
   * 获取所有工具
   * @returns {IToolService[]}
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有工具定义（用于传给 LLM 的 tools 参数）
   * @returns {Array} OpenAI function calling 格式数组
   */
  getToolDefinitionsForLLM() {
    return this.getEnabledTools()
      .filter(t => t.definition)
      .map(t => t.definition.toOpenAIFunction());
  }

  /**
   * 获取 SessionManager 实例（同步，要求已初始化）
   * @returns {SessionManager} SessionManager 实例
   */
  getSessionManager() {
    if (!this.sessionManager) {
      throw new Error('SessionManager not initialized. Call initializeSessionManager() first.');
    }
    return this.sessionManager;
  }

  /**
   * 获取 SettingsManager 实例
   * @returns {SettingsManager} SettingsManager 实例
   */
  getSettingsManager() {
    if (!this.settingsManager) {
      if (!window.SettingsManager || !this.eventBus) {
        throw new Error('SettingsManager or EventBus not initialized');
      }
      this.settingsManager = new window.SettingsManager(this);
      console.log('[ServiceCenter] SettingsManager initialized');
    }
    return this.settingsManager;
  }

  /**
   * 获取 StorageManager 实例
   * @returns {StorageManager} StorageManager 实例
   */
  getStorageManager() {
    if (!this.storageManager) {
      if (!window.StorageManager) {
        throw new Error('StorageManager not initialized');
      }
      this.storageManager = new window.StorageManager(this);
      console.log('[ServiceCenter] StorageManager initialized');
    }
    return this.storageManager;
  }

  /**
   * 获取 ScriptsManager 实例
   * @returns {ScriptsManager} ScriptsManager 实例
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
   * 获取 ModelManager 实例
   * @returns {ModelManager} ModelManager 实例
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
   * 登记或更新当前活跃的 Provider API 服务（单例管理）
   * @param {Object} settings - 包含 apiStandard, apiEndpoint, apiKey, model 的设置对象
   * @returns {IProviderAPIService} 配置好的服务实例
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

    // 如果服务提供商变更，创建新服务
    if (!this.currentProviderService || this.currentProviderId !== providerId) {
      this.currentProviderService = this.createProviderService(providerId, config);
      this.currentProviderId = providerId;
      console.log('[ServiceCenter] New provider service registered:', providerId);
    } else {
      // 检查配置是否发生变化，仅在变化时重新配置
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
   * 获取当前活跃的 Provider API 服务（要求已注册）
   * @returns {IProviderAPIService} Provider API 服务实例
   */
  getCurrentProviderService() {
    if (!this.currentProviderService) {
      // 降级处理：尝试从 SettingsManager 获取一次初始配置
      const settings = this.getSettingsManager().getSettings();
      if (settings && settings.apiStandard) {
        return this.updateProviderService(settings.toJSON ? settings.toJSON() : settings);
      }
      throw new Error('Chat service not registered. Please ensure provider is initialized via SettingsEventHandler.');
    }
    return this.currentProviderService;
  }

  /**
   * 获取当前 ChatController 实例（单例）
   * @returns {ChatController} ChatController 实例
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
   * @param {string} providerId - 服务提供商标识 ('openai', 'openrouter', 'lm-studio')
   * @param {Object} config - 服务配置
   * @returns {IProviderAPIService} Provider API 服务实例
   */
  createProviderService(providerId, config) {
    // 根据 providerId 选择对应的 Service 类
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
    
    // 创建并配置服务实例
    const service = new ServiceClass();
    service.configure(config);
    
    console.log('[ServiceCenter] Chat service created for:', providerId);
    return service;
  }
}

// 导出类（由 app.js 创建实例）
if (typeof window !== 'undefined') {
  window.ServiceCenter = ServiceCenter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceCenter;
}
