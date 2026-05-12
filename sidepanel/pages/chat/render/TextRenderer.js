// 文本消息渲染器
// 负责普通文本和 Markdown 渲染

class TextRenderer {
  /**
   * 渲染文本内容
   * @param {string} text - 文本内容
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  render(text) {
    const { create } = window.DOM;
    
    const contentDiv = create('div', { 
      className: 'message-content',
      style: { 
        lineHeight: '1.6', 
        wordWrap: 'break-word'
      }
    });
    
    contentDiv.innerHTML = window.renderMarkdown(text || '');
    return contentDiv;
  }
  
  /**
   * 更新现有文本内容（增量更新）
   * @param {string} text - 新的文本内容
   * @param {HTMLElement} container - 容器元素
   */
  update(text, container) {
    let contentDiv = container.querySelector('.message-content:not(.loading-content)');
    
    if (!contentDiv) {
      contentDiv = this.render(text);
      container.appendChild(contentDiv);
    } else {
      contentDiv.innerHTML = window.renderMarkdown(text || '');
    }
  }
}

window.TextRenderer = TextRenderer;
