// ==UserScript==
// @name                高亮关键词
// @namespace           webagentcli.tool
// @version             1.0.0
// @description         在页面中高亮指定关键词（会修改页面 DOM，验证 @tool.danger 气泡确认 + enum 参数）
// @match               *://*/*
// @grant               none
// @run-at              document-idle
//
// ---- @tool 自动注册（P2）----
// @tool
// @tool.name           highlight_keyword
// @tool.description    在当前页面高亮所有匹配的关键词，返回高亮命中数量。
// @tool.danger
// @tool.param.keyword  string  要高亮的关键词
// @tool.param.color    string  高亮底色
// @tool.enum.color     yellow|red|green
// ==/UserScript==

// 说明：因带 @tool.danger，模型调用时会触发聊天气泡内的「允许 / 取消 / 始终允许」确认。
// 参数经 window.__toolArgs 注入；return 高亮数量作为工具结果。
(function () {
  'use strict';

  const args = (typeof __toolArgs !== 'undefined' && __toolArgs) || {};
  const keyword = (args.keyword || '').trim();
  const colorMap = { yellow: '#fde047', red: '#fca5a5', green: '#86efac' };
  const bg = colorMap[args.color] || colorMap.yellow;

  if (!keyword) return { error: '缺少 keyword 参数', hits: 0 };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(keyword.toLowerCase())) {
        return NodeFilter.FILTER_REJECT;
      }
      const p = node.parentNode;
      if (!p || ['SCRIPT', 'STYLE', 'MARK'].includes(p.nodeName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);

  let hits = 0;
  const re = new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  for (const node of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = node.nodeValue;
    text.replace(re, (m, _g, idx) => {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const mark = document.createElement('mark');
      mark.style.background = bg;
      mark.textContent = m;
      frag.appendChild(mark);
      last = idx + m.length;
      hits++;
      return m;
    });
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  return { keyword, color: args.color || 'yellow', hits };
})();
