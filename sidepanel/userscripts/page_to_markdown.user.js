// ==UserScript==
// @name              页面转 Markdown（脚本版）
// @namespace         https://github.com/chensiyi/webagentcli
// @version           1.0.0
// @description       把当前页面主要内容转换为 Markdown 文本返回（与内置 page_to_markdown 工具同逻辑，可经 @tool 自动注册为 AI 工具）
// @match             *://*/*
// @grant             none
// @run-at            document-idle
//
// ---- @tool 自动注册（P2）----
// @tool
// @tool.name         page_to_markdown_script
// @tool.description  把当前页面主要内容转换为 Markdown 文本返回。用于让模型以文本形式理解页面结构/正文（标题、段落、链接、列表、表格、代码）。仅支持 http/https 普通网页。
// @tool.param.selector  string  可选的 CSS 选择器，仅转换匹配的元素子树（如 main / #content）；省略则自动选取 article 或 body 全文（所有参数默认可选，脚本自行兜底）
// ==/UserScript==

// 说明：模型调用时传入的参数以 window.__toolArgs 注入；脚本的 return 值作为工具结果。
// 本脚本无 @grant，运行在 MAIN 世界，纯页面 DOM 操作。
(function () {
  'use strict';

  const args = (typeof __toolArgs !== 'undefined' && __toolArgs) || {};
  const INLINE_SKIP = { script: 1, style: 1, noscript: 1, svg: 1, head: 1, nav: 1, footer: 1, header: 1 };

  function clean(t) {
    return (t || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  function inline(node) {
    let out = '';
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const ch = kids[i];
      if (ch.nodeType === 3) { out += ch.textContent; continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName.toLowerCase();
      if (tag === 'br') out += '\n';
      else if (tag === 'strong' || tag === 'b') out += '**' + inline(ch) + '**';
      else if (tag === 'em' || tag === 'i') out += '*' + inline(ch) + '*';
      else if (tag === 'code') out += '`' + ch.textContent + '`';
      else if (tag === 'a') { const href = ch.getAttribute('href') || ''; const t = inline(ch); out += href ? ('[' + t + '](' + href + ')') : t; }
      else if (tag === 'img') { const src = ch.getAttribute('src') || ''; const alt = ch.getAttribute('alt') || ''; out += '![' + alt + '](' + src + ')'; }
      else out += inline(ch);
    }
    return out;
  }

  function block(node, depth) {
    if (depth > 50) return '';
    let out = '';
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const ch = kids[i];
      if (ch.nodeType === 3) { const t = clean(ch.textContent); if (t) out += t + '\n\n'; continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName.toLowerCase();
      if (INLINE_SKIP[tag]) continue;
      if (tag === 'h1') out += '# ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'h2') out += '## ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'h3') out += '### ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'h4') out += '#### ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'h5') out += '##### ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'h6') out += '###### ' + clean(inline(ch)) + '\n\n';
      else if (tag === 'p') out += clean(inline(ch)) + '\n\n';
      else if (tag === 'blockquote') out += '> ' + clean(block(ch, depth + 1)).replace(/\n/g, '\n> ') + '\n\n';
      else if (tag === 'pre') out += '```\n' + clean(ch.textContent) + '\n```\n\n';
      else if (tag === 'ul' || tag === 'ol') {
        const items = ch.children;
        for (let j = 0; j < items.length; j++) {
          const li = items[j];
          if (!li.tagName || li.tagName.toLowerCase() !== 'li') continue;
          const mark = tag === 'ol' ? (j + 1) + '. ' : '- ';
          out += mark + clean(inline(li)) + '\n';
        }
        out += '\n';
      } else if (tag === 'table') {
        const rows = ch.querySelectorAll('tr');
        if (rows.length) {
          const cellsOf = (tr) => Array.from(tr.children).filter(c => { const tn = c.tagName.toLowerCase(); return tn === 'td' || tn === 'th'; }).map(c => clean(inline(c)));
          const head = cellsOf(rows[0]);
          out += '| ' + head.join(' | ') + ' |\n';
          out += '| ' + head.map(() => '---').join(' | ') + ' |\n';
          for (let r = 1; r < rows.length; r++) out += '| ' + cellsOf(rows[r]).join(' | ') + ' |\n';
          out += '\n';
        }
      } else if (tag === 'img') { const src = ch.getAttribute('src') || ''; const alt = ch.getAttribute('alt') || ''; out += '![' + alt + '](' + src + ')\n\n'; }
      else if (tag === 'a') { const href = ch.getAttribute('href') || ''; const t = inline(ch); out += href ? ('[' + t + '](' + href + ')') : t; }
      else if (tag === 'br') out += '\n';
      else if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'figure' || tag === 'fieldset' || tag === 'form') out += block(ch, depth + 1);
      else out += clean(inline(ch)) + '\n\n';
    }
    return out;
  }

  const sel = (args && args.selector) || '';
  const root = sel ? (document.querySelector(sel) || document.querySelector('article') || document.body)
                   : (document.querySelector('article') || document.body);
  let md = '# ' + clean(document.title) + '\n\n';
  if (location && location.href) md += '> 来源：' + location.href + '\n\n';
  md += block(root, 0);
  return clean(md);
})();
