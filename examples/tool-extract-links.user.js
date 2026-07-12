// ==UserScript==
// @name              提取页面链接
// @namespace         webagentcli.tool
// @version           1.0.0
// @description       提取当前页面所有链接的文本与地址（只读工具，验证 @tool 自动注册）
// @match             *://*/*
// @grant             none
// @run-at            document-idle
//
// ---- @tool 自动注册（P2）----
// @tool
// @tool.name         extract_links
// @tool.description  提取当前页面所有 <a> 链接的文本与 URL，返回结构化 JSON。用于让模型读取页面导航结构。
// @tool.param.limit  string  最多返回多少条链接（数字字符串，默认 30）
// ==/UserScript==

// 说明：模型调用时传入的参数以 window.__toolArgs 注入；脚本的 return 值作为工具结果。
// 本脚本无 @grant，运行在 MAIN 世界，纯页面操作。
(function () {
  'use strict';

  const args = (typeof __toolArgs !== 'undefined' && __toolArgs) || {};
  const limit = Math.max(1, parseInt(args.limit, 10) || 30);

  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const links = anchors
    .map((a) => ({
      text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      href: a.href,
    }))
    .filter((l) => l.href && !l.href.startsWith('javascript:'))
    .slice(0, limit);

  // return 值即工具结果，回传给模型
  return {
    title: document.title,
    url: location.href,
    total: anchors.length,
    returned: links.length,
    links,
  };
})();
