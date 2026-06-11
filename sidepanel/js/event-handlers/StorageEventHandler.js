/**
 * 存储管理页面事件处理器
 * 负责注册存储页面的事件监听器，连接 View 和 Controller
 */

class StorageEventHandler {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    
    // 通过 ServiceCenter 获取 StorageManager
    this.storageManager = serviceCenter.getStorageManager();
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  _registerEventListeners() {
    // 监听存储数据加载
    this.eventBus.on(window.Events.STORAGE.LOADED, (data) => {
      this._handleStorageLoaded(data);
    });
    
    // 监听搜索结果
    this.eventBus.on(window.Events.STORAGE.SEARCHED, (data) => {
      this._handleStorageSearched(data);
    });
    
    // 监听错误
    this.eventBus.on(window.Events.STORAGE.ERROR, (data) => {
      this._handleStorageError(data);
    });
  }
  
  /**
   * 处理存储数据加载
   */
  _handleStorageLoaded(data) {
    const { items, stats } = data;
    console.log('[StorageEventHandler] Storage loaded:', items.length, 'items');
    
    // 通知页面更新
    if (window.Pages && window.Pages.storage) {
      window.Pages.storage.updateData(items, stats);
    }
  }
  
  /**
   * 处理搜索结果
   */
  _handleStorageSearched(data) {
    const { items, keyword } = data;
    console.log('[StorageEventHandler] Search results:', items.length, 'items for', keyword);
    
    // 通知页面更新
    if (window.Pages && window.Pages.storage) {
      window.Pages.storage.updateSearchResults(items, keyword);
    }
  }
  
  /**
   * 处理存储错误
   */
  _handleStorageError(data) {
    const { error } = data;
    console.error('[StorageEventHandler] Error:', error);
    window.Toast?.error(error);
  }
  
  /**
   * 处理刷新（由页面调用）
   */
  handleRefresh() {
    this.storageManager.loadAll();
  }
  
  /**
   * 处理搜索（由页面调用）
   */
  handleSearch(keyword) {
    if (keyword.trim()) {
      this.storageManager.search(keyword);
    }
  }
  
  /**
   * 处理删除（由页面调用）
   */
  async handleDelete(key) {
    console.log('[StorageEventHandler] handleDelete called for key:', key);
    console.log('[StorageEventHandler] window.Toast:', window.Toast);
    console.log('[StorageEventHandler] window.Toast.confirm:', window.Toast?.confirm);
    
    const confirmed = await window.Toast.confirm({
      title: '删除存储项',
      message: `确定要删除 "${key}" 吗？`,
      confirmText: '删除',
      type: 'danger'
    });
    
    if (confirmed) {
      await this.storageManager.removeItem(key);
      window.Toast.success('已删除');
    }
  }
}

// 不导出到全局，仅在 app.js 中通过 new StorageEventHandler(serviceCenter) 创建实例
window.StorageEventHandler = StorageEventHandler;
