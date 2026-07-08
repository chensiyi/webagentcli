/**
 * gm-api.js — GM_* API 包裹函数
 *
 * 生成用户脚本注入时需要的 GM_* API 代码
 * 运行在 Service Worker 中，被 ManageUserScriptsTool 调用
 */

/**
 * 根据 @grant 列表生成 GM_* API 注入代码
 */
export function buildGMApiWrapper(scriptId, grantList, permissions = {}) {
    const apis = [];

    if (grantList.includes('GM_setValue') && permissions['GM_setValue'] !== false) {
        apis.push(`
            window.GM_setValue = function(key, value) {
                chrome.storage.local.set({
                    ['gm_${scriptId}_' + key]: JSON.stringify(value)
                });
            };
        `);
    }

    if (grantList.includes('GM_getValue') && permissions['GM_getValue'] !== false) {
        apis.push(`
            window.GM_getValue = async function(key, defaultValue) {
                const r = await chrome.storage.local.get(['gm_${scriptId}_' + key]);
                const v = r['gm_${scriptId}_' + key];
                return v !== undefined ? JSON.parse(v) : defaultValue;
            };
        `);
    }

    if (grantList.includes('GM_deleteValue') && permissions['GM_deleteValue'] !== false) {
        apis.push(`
            window.GM_deleteValue = function(key) {
                chrome.storage.local.remove('gm_${scriptId}_' + key);
            };
        `);
    }

    if (grantList.includes('GM_listValues') && permissions['GM_listValues'] !== false) {
        apis.push(`
            window.GM_listValues = async function() {
                const all = await chrome.storage.local.get(null);
                const prefix = 'gm_${scriptId}_';
                return Object.keys(all)
                    .filter(k => k.startsWith(prefix))
                    .map(k => k.substring(prefix.length));
            };
        `);
    }

    if (grantList.includes('GM_addStyle') && permissions['GM_addStyle'] !== false) {
        apis.push(`
            window.GM_addStyle = function(css) {
                const style = document.createElement('style');
                style.textContent = css;
                document.head?.appendChild(style);
                return style;
            };
        `);
    }

    if (grantList.includes('GM_setClipboard') && permissions['GM_setClipboard'] !== false) {
        apis.push(`
            window.GM_setClipboard = function(text) {
                navigator.clipboard.writeText(text).catch(function(err) {
                    console.warn('GM_setClipboard error:', err);
                });
            };
        `);
    }

    if (grantList.includes('GM_xmlhttpRequest') && permissions['GM_xmlhttpRequest'] !== false) {
        apis.push(`
            window.GM_xmlhttpRequest = function(details) {
                try {
                    var opts = {
                        method: details.method || 'GET',
                        headers: details.headers || {},
                        body: details.data
                    };
                    fetch(details.url, opts).then(function(resp) {
                        return resp.text().then(function(text) {
                            var result = {
                                status: resp.status,
                                statusText: resp.statusText,
                                responseText: text,
                                finalUrl: resp.url
                            };
                            if (details.onload) details.onload(result);
                        });
                    }).catch(function(err) {
                        if (details.onerror) details.onerror({ error: String(err) });
                    });
                } catch (e) {
                    if (details.onerror) details.onerror({ error: String(e) });
                }
            };
        `);
    }

    if (grantList.includes('GM_notification') && permissions['GM_notification'] !== false) {
        apis.push(`
            window.GM_notification = function(details) {
                try {
                    var title = details.title || 'Notification';
                    var body = details.text || details.message || '';
                    if (typeof Notification !== 'undefined') {
                        new Notification(title, { body: body });
                    } else {
                        console.warn('[GM_notification] Notification API unavailable');
                    }
                } catch (e) {
                    console.warn('[GM_notification] error:', e);
                }
            };
        `);
    }

    if (grantList.includes('GM_openInTab') && permissions['GM_openInTab'] !== false) {
        apis.push(`
            window.GM_openInTab = function(url, options) {
                chrome.tabs.create({ url: url, active: options?.active ?? true });
            };
        `);
    }

    return apis.join('\n');
}

/**
 * 完整脚本包裹：GM_* API + GM_info + try/catch
 */
export function wrapWithGM(code, script) {
    const grantList = script.grant || [];
    const gmApis = buildGMApiWrapper(script.id, grantList, {});
    const safeName = JSON.stringify(script.name || script.id || '');

    return (
        gmApis +
        'var GM_info = { script: { name: ' + safeName + ', version: ' + JSON.stringify(script.version || '1.0') + ' } };\n' +
        'var GM_log = console.log.bind(console);\n' +
        'var unsafeWindow = window;\n' +
        'try {\n' +
        '  ' + code + '\n' +
        '} catch(__e) {\n' +
        '  console.error("[ScriptInject] " + ' + safeName + ' + ": ", __e);\n' +
        '}\n'
    );
}

/**
 * @run-at → chrome.userScripts runAt 映射
 */
export const RUN_AT_MAP = {
    'document-start': 'document_start',
    'document-end': 'document_end',
    'document-idle': 'document_idle',
};