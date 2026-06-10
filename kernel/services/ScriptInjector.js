/**
 * ScriptInjector - 用户脚本注入辅助模块
 *
 * 负责脚本匹配、读取启用脚本和注入到目标标签页。
 */

const injectedScriptsByTab = new Map();

function escapeRegex(source) {
  return source.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
}

function patternToRegex(pattern) {
  if (pattern === '<all_urls>') {
    return /.*/;
  }

  const escaped = escapeRegex(pattern).replace(/\*/g, '.*');
  const regexSource = `^${escaped}$`;
  return new RegExp(regexSource);
}

function urlMatchesPattern(url, pattern) {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(url);
  } catch (error) {
    console.warn('[ScriptInjector] Invalid match pattern:', pattern, error);
    return false;
  }
}

export async function getEnabledScripts() {
  const result = await chrome.storage.local.get('user_scripts');
  return (result.user_scripts || []).filter(script => script.enabled);
}

export async function injectScriptCode(tabId, code, scriptId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (source, id) => {
        if (document.querySelector(`script[data-user-script-id="${id}"]`)) {
          return;
        }
        const script = document.createElement('script');
        script.dataset.userScriptId = id;
        script.textContent = source;
        (document.head || document.documentElement || document.body || document.documentElement).appendChild(script);
      },
      args: [code, scriptId]
    });

    const injected = injectedScriptsByTab.get(tabId) || new Set();
    injected.add(scriptId);
    injectedScriptsByTab.set(tabId, injected);
    console.log('[ScriptInjector] Injected script', scriptId, 'into tab', tabId);
  } catch (error) {
    console.error('[ScriptInjector] Failed to inject script', scriptId, 'into tab', tabId, error);
  }
}

export async function cleanupInjectedScriptsForTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        document.querySelectorAll('script[data-user-script-id]').forEach(el => el.remove());
      }
    });
  } catch (error) {
    console.error('[ScriptInjector] cleanupInjectedScriptsForTab failed for tab', tabId, error);
  }
}

export async function cleanupInjectedScriptsForAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(tab => cleanupInjectedScriptsForTab(tab.id)));
  } catch (error) {
    console.error('[ScriptInjector] cleanupInjectedScriptsForAllTabs failed:', error);
  }
}

export async function injectScriptsForTab(tabId, url) {
  if (!url || !url.startsWith('http')) {
    return;
  }

  const scripts = await getEnabledScripts();
  if (!scripts.length) {
    return;
  }

  const injected = injectedScriptsByTab.get(tabId) || new Set();
  for (const script of scripts) {
    if (!Array.isArray(script.match) || script.match.length === 0) {
      continue;
    }

    const matched = script.match.some(pattern => urlMatchesPattern(url, pattern));
    if (!matched) {
      continue;
    }

    if (injected.has(script.id)) {
      continue;
    }

    await injectScriptCode(tabId, script.code, script.id);
  }
}

export function clearInjectedScriptCache() {
  injectedScriptsByTab.clear();
}
