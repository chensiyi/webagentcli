/**
 * 后台脚本 - 处理扩展图标点击与用户脚本注入
 */

import {
  injectScriptsForTab,
  clearInjectedScriptCache,
  cleanupInjectedScriptsForAllTabs
} from './services/ScriptInjector.js';

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
    await injectScriptsForTab(tabId, tab.url);
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

console.log('[Background] Service worker loaded');
