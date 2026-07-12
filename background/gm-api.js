/**
 * gm-api.js — GM_* API 包裹函数
 *
 * 生成用户脚本注入时需要的 GM_* API 代码。
 * 运行在 Service Worker 中，被 ManageUserScriptsTool 调用。
 *
 * 本批次对齐补齐（见 docs/TAMPERMONKEY_ALIGN.md「本批补」）：
 *   - GM_getResourceText / GM_getResourceURL（依赖 @resource，安装期已拉取存于 script.resources）
 *   - GM_addElement（注入 DOM 元素）
 *   - GM_download（blob + a[download]）
 *   - GM_info 补全 metadata 字段
 *   - GM_registerMenuCommand / GM_unregisterMenuCommand（页面侧收集命令 → runtime 消息回传内核 → Shell 菜单 UI）
 */
import { GM_VALUE_PREFIX } from './keys.js';

/**
 * 根据 @grant 列表与 script 对象，生成 GM_* API 注入代码。
 * @param script 用户脚本对象（含 id / version / namespace / description / author / resources）
 * @param grantList @grant 列表
 * @param permissions 细粒度开关（当前恒为 {}，预留）
 */
export function buildGMApiWrapper(script, grantList, permissions = {}) {
    const apis = [];
    const scriptId = script?.id || '';
    // 生成时已固化 scriptId 的 key 前缀，作为字面量注入到生成的代码里
    const p = JSON.stringify(GM_VALUE_PREFIX + scriptId + '_');

    // 注意：用户脚本世界（USER_SCRIPT）只能访问 chrome.runtime / chrome.userScripts，
    // chrome.storage 在该世界为 undefined。故 GM 值存储改用同源 localStorage（同步、可用，
    // 与 Tampermonkey 同步语义一致），按 scriptId 前缀隔离，不污染页面 localStorage 键空间。
    if (grantList.includes('GM_setValue') && permissions['GM_setValue'] !== false) {
        apis.push(`
            window.GM_setValue = function(key, value) {
                try { localStorage.setItem(${p} + key, JSON.stringify(value)); }
                catch (e) { console.warn('[GM_setValue]', e); }
            };
        `);
    }

    if (grantList.includes('GM_getValue') && permissions['GM_getValue'] !== false) {
        apis.push(`
            window.GM_getValue = function(key, defaultValue) {
                try {
                    var raw = localStorage.getItem(${p} + key);
                    return raw !== null ? JSON.parse(raw) : defaultValue;
                } catch (e) { return defaultValue; }
            };
        `);
    }

    if (grantList.includes('GM_deleteValue') && permissions['GM_deleteValue'] !== false) {
        apis.push(`
            window.GM_deleteValue = function(key) {
                try { localStorage.removeItem(${p} + key); } catch (e) {}
            };
        `);
    }

    if (grantList.includes('GM_listValues') && permissions['GM_listValues'] !== false) {
        apis.push(`
            window.GM_listValues = function() {
                try {
                    var prefix = ${p};
                    var out = [];
                    for (var i = 0; i < localStorage.length; i++) {
                        var k = localStorage.key(i);
                        if (k && k.indexOf(prefix) === 0) out.push(k.substring(prefix.length));
                    }
                    return out;
                } catch (e) { return []; }
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
            // user script 世界无 chrome.tabs，经 sendMessage 由 background 代理打开标签
            window.GM_openInTab = function(url, options) {
                try {
                    var p = chrome.runtime.sendMessage({ __gmOpenTab: true, url: url, active: options?.active ?? true });
                    if (p && typeof p.catch === 'function') p.catch(function(){});
                } catch (e) {}
            };
        `);
    }

    // ── 本批次补齐：GM_getResourceText / GM_getResourceURL ──
    if (grantList.some(g => g === 'GM_getResourceText' || g === 'GM_getResourceURL') && permissions['GM_getResourceText'] !== false) {
        const resources = script?.resources || {};
        apis.push(`
            var __gmResources = ${JSON.stringify(resources)};
            window.GM_getResourceText = function(name) {
                return __gmResources[name] != null ? __gmResources[name] : '';
            };
            window.GM_getResourceURL = function(name) {
                var t = __gmResources[name];
                if (t == null) return '';
                try { return URL.createObjectURL(new Blob([t], { type: 'text/plain' })); } catch (e) { return ''; }
            };
        `);
    }

    // ── 本批次补齐：GM_addElement（注入 DOM 元素） ──
    if (grantList.includes('GM_addElement') && permissions['GM_addElement'] !== false) {
        apis.push(`
            window.GM_addElement = function(arg1, arg2) {
                try {
                    var __ttHTML = function(html) {
                        try {
                            if (window.trustedTypes && trustedTypes.getDefaultPolicy) {
                                var __p = trustedTypes.getDefaultPolicy();
                                if (__p && __p.createHTML) return __p.createHTML(html);
                            }
                        } catch (e) {}
                        return html;
                    };
                    var el;
                    if (typeof arg1 === 'string') {
                        el = document.createElement(arg1);
                        if (arg2 != null) el.textContent = String(arg2);
                    } else if (arg1 && typeof arg1 === 'object') {
                        var tag = arg1.tag || 'div';
                        el = document.createElement(tag);
                        var attrs = arg1.attributes || arg1;
                        for (var k in attrs) {
                            if (k === 'textContent' || k === 'innerHTML' || k === 'html' || k === 'tag' || k === 'attributes') continue;
                            try { el.setAttribute(k, attrs[k]); } catch (e) {}
                        }
                        if (arg1.textContent != null) el.textContent = arg1.textContent;
                        else if (arg1.innerHTML != null) el.innerHTML = __ttHTML(arg1.innerHTML);
                        else if (arg1.html != null) el.innerHTML = __ttHTML(arg1.html);
                        if (arg1.appendChild) { try { el.appendChild(arg1.appendChild); } catch (e) {} }
                    } else {
                        return null;
                    }
                    var parent = (arg2 && arg2.nodeType) ? arg2 : (document.body || document.documentElement);
                    parent.appendChild(el);
                    return el;
                } catch (e) {
                    console.warn('[GM_addElement] error:', e);
                    return null;
                }
            };
        `);
    }

    // ── 本批次补齐：GM_download（fetch → blob → a[download]） ──
    if (grantList.includes('GM_download') && permissions['GM_download'] !== false) {
        apis.push(`
            window.GM_download = function(a, b) {
                try {
                    var url, name, onload, onerror;
                    if (typeof a === 'string') { url = a; name = b; }
                    else if (a && typeof a === 'object') { url = a.url; name = a.name; onload = a.onload; onerror = a.onerror; }
                    if (!url) return;
                    fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
                        var u = URL.createObjectURL(blob);
                        var aEl = document.createElement('a');
                        aEl.href = u; aEl.download = name || 'download';
                        (document.body || document.documentElement).appendChild(aEl);
                        aEl.click(); aEl.remove();
                        setTimeout(function() { URL.revokeObjectURL(u); }, 10000);
                        if (onload) onload({});
                    }).catch(function(e) { if (onerror) onerror({ error: String(e) }); });
                } catch (e) { console.warn('[GM_download] error:', e); }
            };
        `);
    }

    // ── 本批次补齐：GM_registerMenuCommand / GM_unregisterMenuCommand ──
    // 页面侧把命令收集进 Map，并经 chrome.runtime.sendMessage 回传内核（scriptId + 命令列表）；
    // 内核收集后广播 Shell 菜单 UI；Shell 点击时经 scripts.invokeMenu 回发 __gmMenuInvoke，
    // 页面侧 onMessage 监听取出对应回调执行。
    if (grantList.includes('GM_registerMenuCommand') && permissions['GM_registerMenuCommand'] !== false) {
        const sid = JSON.stringify(scriptId);
        apis.push(`
            (function() {
                var __gmMenuCommands = new Map();
                window.__gmMenuCommands = __gmMenuCommands;
                function __gmMenuNotify() {
                    try {
                        var cmds = Array.from(__gmMenuCommands.values()).map(function(c) { return { id: c.id, name: c.name }; });
                        // 用户脚本世界可用 chrome.runtime.sendMessage（会唤醒休眠的 SW）；
                        // background 经专用通道 chrome.runtime.onUserScriptMessage 接收后，持久化到其自身的
                        // chrome.storage.local，scripts.getMenu 再拉取。
                        // 注意 sendMessage 返回 Promise：SW 冷启动竞态下可能暂时无接收端而 reject，
                        // 必须 .catch 吞掉，否则控制台抛未捕获 Promise 拒绝（"Receiving end does not exist"）。
                        // 失败兜底 300ms 重试一次（此时 SW 应已唤醒并注册监听）。
                        var payload = { __gmMenu: true, scriptId: ${sid}, commands: cmds };
                        var p = chrome.runtime.sendMessage(payload);
                        if (p && typeof p.catch === 'function') p.catch(function() {
                            setTimeout(function() { try { var q = chrome.runtime.sendMessage(payload); if (q && q.catch) q.catch(function(){}); } catch (e) {} }, 300);
                        });
                    } catch (e) { console.warn('[GM_menu] notify failed', e); }
                }
                window.GM_registerMenuCommand = function(name, fn, id) {
                    var cmdId = id || ('cmd_' + Math.random().toString(36).slice(2));
                    __gmMenuCommands.set(cmdId, { id: cmdId, name: String(name), fn: fn });
                    __gmMenuNotify();
                };
                window.GM_unregisterMenuCommand = function(id) {
                    __gmMenuCommands.delete(id);
                    __gmMenuNotify();
                };
                // 用户脚本世界收消息走专用通道 onUserScriptMessage（需 configureWorld({messaging:true}) 开启）。
                // 该世界 chrome.runtime.onMessage 为 undefined，直接 .addListener 会抛错；故做防御 + try/catch。
                var __gmMsg = chrome.runtime.onUserScriptMessage || chrome.runtime.onMessage;
                if (__gmMsg && typeof __gmMsg.addListener === 'function') {
                    try {
                        __gmMsg.addListener(function(msg, sender, sendResponse) {
                            if (msg && msg.__gmMenuInvoke) {
                                var c = __gmMenuCommands.get(msg.__gmMenuInvoke);
                                if (c && c.fn) { try { c.fn(); } catch (e) { console.warn('[GM_menu] invoke error', e); } }
                            }
                            return false;
                        });
                    } catch (e) { console.warn('[GM_menu] listener setup failed', e); }
                }
            })();
        `);
    }

    return apis.join('\n');
}

/**
 * 完整脚本包裹：GM_* API + GM_info（补全字段）+ @require 前置 + try/catch
 */
export function wrapWithGM(code, script) {
    const grantList = script.grant || [];
    const gmApis = buildGMApiWrapper(script, grantList, {});
    const safeName = JSON.stringify(script.name || script.id || '');
    const gmInfo = JSON.stringify({
        script: {
            name: script.name || '',
            version: script.version || '1.0',
            namespace: script.namespace || '',
            description: script.description || '',
            author: script.author || '',
            downloadURL: script.downloadURL || '',
        },
    });

    const parts = [];
    // GM_* API 注入用独立 IIFE + try/catch 包裹：任一 API 初始化失败（如用户脚本世界
    // 缺消息通道）只告警，不应连累整段脚本（否则用户脚本完全不执行）。
    parts.push('(function(){ try {\n' + gmApis + '\n} catch(__e){ console.warn("[GM_API] init error", __e); } })();');
    parts.push('var GM_info = ' + gmInfo + ';');
    parts.push('var GM_log = console.log.bind(console);');
    parts.push('var unsafeWindow = window;');
    // @require 拉取的库代码前置到用户代码之前（库通常依赖 GM_*，故在 GM_* 注入之后）
    if (script.requireCode) parts.push(script.requireCode);
    parts.push(
        'try {\n' +
        '  ' + code + '\n' +
        '} catch(__e) {\n' +
        '  console.error("[ScriptInject] " + ' + safeName + ' + ": ", __e);\n' +
        '}\n'
    );
    return parts.join('\n');
}

/**
 * @run-at → chrome.userScripts runAt 映射
 */
export const RUN_AT_MAP = {
    'document-start': 'document_start',
    'document-end': 'document_end',
    'document-idle': 'document_idle',
};
