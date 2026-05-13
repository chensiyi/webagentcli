/**
 * 设置控制器
 * 负责设置的加载、保存、应用
 */

class SettingsController {
  constructor() {
    this.settings = new window.Settings();
    this.storageKey = 'app_settings';
    
    // 加载设置
    this.loadSettings();
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
    Object.assign(this.settings, updates);
    this.saveSettings();
    console.log('[SettingsController] Settings updated:', updates);
  }
  
  /**
   * 保存设置
   */
  saveSettings() {
    chrome.storage.local.set({ [this.storageKey]: this.settings.toJSON() }, () => {
      console.log('[SettingsController] Settings saved');
    });
  }
  
  /**
   * 加载设置
   */
  loadSettings() {
    chrome.storage.local.get([this.storageKey], (result) => {
      const data = result[this.storageKey];
      if (data) {
        this.settings = window.Settings.fromJSON(data);
        console.log('[SettingsController] Settings loaded:', this.settings);
      }
    });
  }
  
  /**
   * 重置设置
   */
  resetSettings() {
    this.settings = new window.Settings();
    this.saveSettings();
    console.log('[SettingsController] Settings reset');
  }
}

// 导出单例
window.SettingsController = new SettingsController();
