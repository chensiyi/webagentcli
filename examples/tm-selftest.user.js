// ==UserScript==
// @name         油猴对齐自测
// @namespace    webagentcli.selftest
// @version      1.0.0
// @description  一键验证本批油猴对齐：include/exclude 注册映射、require 内联、resource 拉取、GM_* API、菜单命令回传
// @author       webagentcli
// @match        https://example.com/*
// @include      https://*.wikipedia.org/*
// @exclude      https://*.wikipedia.org/wiki/Special:*
// @icon         https://www.google.com/s2/favicons?domain=example.com
// @require      https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js
// @resource     PKG https://cdn.jsdelivr.net/npm/dayjs@1.11.13/package.json
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(async function () {
  'use strict';

  // 1) 验证 @require：dayjs 应已由安装期内联注入，全局可用
  const now =
    typeof dayjs === 'function'
      ? dayjs().format('YYYY-MM-DD HH:mm:ss')
      : new Date().toLocaleString() + '（dayjs 未注入，@require 可能失败）';

  // 2) 验证 GM_getValue / GM_setValue：访问计数持久化
  let count = 0;
  try {
    count = (await GM_getValue('visitCount', 0)) + 1;
    GM_setValue('visitCount', count);
  } catch (e) {
    count = -1;
  }

  // 3) 验证 GM_addStyle + DOM 注入：右上角浮层横幅
  GM_addStyle(`
    #wac-selftest {
      position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      max-width: 320px; padding: 12px 14px; border-radius: 10px;
      font: 13px/1.5 system-ui, sans-serif; color: #fff;
      background: #16a34a; box-shadow: 0 4px 16px rgba(0,0,0,.25);
    }
    #wac-selftest b { display: block; margin-bottom: 4px; font-size: 14px; }
    #wac-selftest code { color: #dcfce7; }
  `);

  // Trusted Types 兼容：扩展已为 USER_SCRIPT 世界配置 csp "trusted-types *"，
  // 此处自建一个命名策略用于 HTML sink，避免在严格 TT 站点赋值 innerHTML 被拦截。
  var __ttPolicy = null;
  try {
    if (window.trustedTypes && typeof trustedTypes.createPolicy === 'function') {
      __ttPolicy =
        (trustedTypes.getDefaultPolicy && trustedTypes.getDefaultPolicy()) ||
        trustedTypes.createPolicy('wac-selftest', {
          createHTML: function (s) { return s; },
          createScript: function (s) { return s; },
          createScriptURL: function (s) { return s; },
        });
    }
  } catch (e) { __ttPolicy = null; }
  var __tt = function (h) {
    return __ttPolicy && __ttPolicy.createHTML ? __ttPolicy.createHTML(h) : h;
  };

  const banner = document.createElement('div');
  banner.id = 'wac-selftest';
  var bhtml =
    '<b>油猴对齐自测 ✓</b>' +
    '注入成功 @ <code>' + now + '</code><br>' +
    '本页访问计数（GM_setValue）: <code>' + count + '</code>';
  document.body.appendChild(banner);

  // 4) 验证 @resource + GM_getResourceText：读取拉取到的 package.json
  try {
    const pkgText = GM_getResourceText('PKG');
    const ver = JSON.parse(pkgText).version;
    bhtml += '<br>@resource 读取 dayjs 版本: <code>' + ver + '</code>';
  } catch (e) {
    bhtml += '<br><code>@resource 读取失败: ' + e.message + '</code>';
  }
  banner.innerHTML = __tt(bhtml);

  // 5) 验证 GM_notification
  try {
    GM_notification({ title: '油猴自测', text: '注入完成，访问计数 ' + count });
  } catch (e) {}

  // 6) 验证 GM_registerMenuCommand：命令应回传内核并出现在脚本菜单 UI
  try {
    GM_registerMenuCommand('显示访问计数', function () {
      alert('当前页面访问计数：' + count);
    });
    GM_registerMenuCommand('重置计数', function () {
      GM_setValue('visitCount', 0);
      alert('已重置，刷新页面生效');
    });
  } catch (e) {}

  console.log('[油猴对齐自测] OK', { now, count });
})();
