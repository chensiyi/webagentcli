/**
 * 用户脚本页面事件处理器
 * 负责注册脚本页面的事件监听器，连接 View 和 Controller
 */

class ScriptsEventHandler {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    
    // 通过 ServiceCenter 获取 ScriptsController
    if (serviceCenter && serviceCenter.getScriptsController) {
      this.scriptsController = serviceCenter.getScriptsController();
    } else {
      // 降级：直接使用全局 ScriptsController
      this.scriptsController = window.ScriptsController;
    }
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听脚本列表加载
    this.eventBus.on(window.Events.SCRIPTS.LOADED, (data) => {
      this._handleScriptsLoaded(data);
    });
    
    // 监听错误
    this.eventBus.on(window.Events.SCRIPTS.ERROR, (data) => {
      this._handleScriptsError(data);
    });
  }
  
  /**
   * 处理脚本列表加载
   */
  _handleScriptsLoaded(data) {
    const { scripts } = data;
    console.log('[ScriptsEventHandler] Scripts loaded:', scripts.length);
    
    // 通知页面更新
    if (window.Pages && window.Pages.scripts) {
      window.Pages.scripts.updateScripts(scripts);
    }
  }
  
  /**
   * 处理脚本错误
   */
  _handleScriptsError(data) {
    const { error } = data;
    console.error('[ScriptsEventHandler] Error:', error);
    window.Toast?.error(error);
  }
  
  /**
   * 处理安装脚本（由页面调用）
   */
  async handleInstall(code) {
    if (!code.trim()) {
      window.Toast?.warning('请输入脚本代码');
      return;
    }
    
    await this.scriptsController.install(code);
  }
  
  /**
   * 处理切换脚本状态（由页面调用）
   */
  handleToggle(id, enabled) {
    this.scriptsController.toggle(id, enabled);
  }
  
  /**
   * 处理删除脚本（由页面调用）
   */
  async handleDelete(id) {
    const confirmed = await window.Toast?.confirm?.({
      title: '删除脚本',
      message: '确定删除此脚本？此操作不可恢复。'
    });
    
    if (confirmed) {
      this.scriptsController.remove(id);
      window.Toast?.success('脚本已删除');
    }
  }
  
  /**
   * 处理编辑脚本（由页面调用）
   */
  handleEdit(id, code) {
    this.scriptsController.update(id, code);
  }
}

// 不导出到全局，仅在 app.js 中通过 new ScriptsEventHandler(serviceCenter) 创建实例
