/**
 * 用户脚本页面事件处理器
 * 负责注册脚本页面的事件监听器，连接 View 和 Controller
 */

import { Log } from '../../../kernel/services/Log.js';
import { Events } from '../events.js';
import { Toast } from '../utils/toast.js';
import { Pages } from '../utils/dom.js';

class ScriptsEventHandler {
  constructor(kernel) {
    this.kernel = kernel;
    this.ipc = kernel.getIPC();
    this.scriptsChannel = this.ipc?.getOrCreateChannel('scripts') || this.ipc;
    
    // 通过 Kernel 获取 ScriptsManager
    this.scriptsManager = kernel.getScriptsManager();
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听脚本列表加载
    this.scriptsChannel.on(Events.SCRIPTS.LOADED, (data) => {
      this._handleScriptsLoaded(data);
    });
    
    // 监听错误
    this.scriptsChannel.on(Events.SCRIPTS.ERROR, (data) => {
      this._handleScriptsError(data);
    });
  }
  
  /**
   * 处理脚本列表加载
   */
  _handleScriptsLoaded(data) {
    const { scripts } = data;
    Log.info('ScriptsEventHandler', 'Scripts loaded:', scripts.length);
    
    // 通知页面更新
    if (Pages && Pages.scripts) {
      Pages.scripts.updateScripts(scripts);
    }
  }
  
  /**
   * 处理脚本错误
   */
  _handleScriptsError(data) {
    const { error } = data;
    Log.error('ScriptsEventHandler', 'Error:', error);
    Toast?.error(error);
  }
  
  /**
   * 处理安装脚本（由页面调用）
   */
  async handleInstall(code) {
    Log.info('ScriptsEventHandler', 'Installing script, codeLength:', code?.length || 0);
    if (!code.trim()) {
      Toast?.warning('请输入脚本代码');
      return;
    }
    
    await this.scriptsManager.install(code);
  }
  
  /**
   * 处理切换脚本状态（由页面调用）
   */
  async handleToggle(id, enabled) {
    Log.info('ScriptsEventHandler', 'Toggle script:', id, '→', enabled ? 'enabled' : 'disabled');
    try {
      await this.scriptsManager.toggle(id, enabled);
    } catch (error) {
      this.scriptsChannel.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }
  
  /**
   * 处理删除脚本（由页面调用）
   */
  async handleDelete(id) {
    Log.info('ScriptsEventHandler', 'Delete script:', id);
    const confirmed = await Toast?.confirm?.({
      title: '删除脚本',
      message: '确定删除此脚本？此操作不可恢复。'
    });
    
    if (confirmed) {
      await this.scriptsManager.remove(id);
      Toast?.success('脚本已删除');
    }
  }
  
  /**
   * 处理编辑脚本（由页面调用）
   */
  async handleEdit(id, code) {
    Log.info('ScriptsEventHandler', 'Edit script:', id, 'codeLength:', code?.length || 0);
    try {
      await this.scriptsManager.updateCode(id, code);
    } catch (error) {
      this.scriptsChannel.emit(Events.SCRIPTS.ERROR, { error: error.message });
    }
  }
}

export { ScriptsEventHandler };
