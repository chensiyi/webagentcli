// Markdown 渲染工具
// 简单的 Markdown 解析器，避免外部依赖

(function() {
  'use strict';
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  window.renderMarkdown = function(text) {
    if (!text) return '';
    
    // 先提取代码块，避免内部内容被处理
    const codeBlocks = [];
    let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`);
      return `%%CODEBLOCK_${index}%%`;
    });
    
    // 处理其他 Markdown 语法
    html = html
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 标题
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // 换行
      .replace(/\n/g, '<br>');
    
    // 恢复代码块
    codeBlocks.forEach((block, index) => {
      html = html.replace(`%%CODEBLOCK_${index}%%`, block);
    });
    
    return html;
  };
})();
