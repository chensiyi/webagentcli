/**
 * 后台脚本 - 处理扩展图标点击与用户脚本注入
 */

import {
  injectScriptsForTab,
  clearInjectedScriptCache,
  cleanupInjectedScriptsForAllTabs
} from './services/ScriptInjector.module.js';

async function refreshCurrentTabInjection() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return;
    const tab = tabs[0];
    await injectScriptsForTab(tab.id, tab.url);
  } catch (error) {
    console.error('[Background] refreshCurrentTabInjection failed:', error);
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await injectScriptsForTab(tab.id, tab.url);
  } catch (error) {
    console.error('[Background] onActivated failed:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await injectScriptsForTab(tab.id, tab.url);
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.user_scripts) {
    clearInjectedScriptCache();
    await cleanupInjectedScriptsForAllTabs();
    refreshCurrentTabInjection();
  }
});

// 当扩展图标被点击时，打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[Background] Failed to open side panel:', error);
  }
});

// 启动时立即注入当前活跃标签页的脚本
async function injectOnStartup() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url) {
      console.log('[Background] 启动注入:', tabs[0].url);
      await injectScriptsForTab(tabs[0].id, tabs[0].url);
    }
  } catch (e) {
    console.error('[Background] 启动注入失败:', e);
  }
}

// 延迟执行启动注入，确保 service worker 完全就绪
setTimeout(injectOnStartup, 500);

console.log('[Background] Service worker loaded');
