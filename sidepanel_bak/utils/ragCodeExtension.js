// RAG 和代码执行能力扩展
// 展示如何添加新的消息处理能力

(function() {
  'use strict';

  const { ContentType, MessageHandlerRegistry } = window.MessageTypes;

  /**
   * RAG 引用来源渲染器
   */
  class RagSourceRenderer {
    render(sources) {
      if (!sources || sources.length === 0) return null;

      const container = document.createElement('div');
      container.className = 'rag-sources-container';

      const header = document.createElement('div');
      header.className = 'rag-sources-header';
      header.innerHTML = '<span class="icon">📚</span> 参考来源';
      container.appendChild(header);

      const list = document.createElement('div');
      list.className = 'rag-sources-list';

      sources.forEach((source, index) => {
        const item = document.createElement('a');
        item.className = 'rag-source-item';
        item.href = source.url || '#';
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        
        const relevance = source.relevance ? Math.round(source.relevance * 100) : 0;
        
        item.innerHTML = `
          <span class="source-number">${index + 1}</span>
          <div class="source-info">
            <div class="source-title">${this.escapeHtml(source.title)}</div>
            <div class="source-meta">
              <span class="source-relevance">相关度: ${relevance}%</span>
              ${source.domain ? `<span class="source-domain">${source.domain}</span>` : ''}
            </div>
          </div>
        `;
        
        list.appendChild(item);
      });

      container.appendChild(list);
      return container;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  /**
   * RAG 上下文渲染器
   */
  class RagContextRenderer {
    render(context) {
      if (!context) return null;

      const container = document.createElement('div');
      container.className = 'rag-context-container';

      const header = document.createElement('div');
      header.className = 'rag-context-header';
      header.innerHTML = '<span class="icon">🔍</span> 检索到的上下文';
      
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-btn';
      toggleBtn.textContent = '展开';
      
      header.appendChild(toggleBtn);
      container.appendChild(header);

      const content = document.createElement('div');
      content.className = 'rag-context-content';
      content.style.display = 'none';
      content.textContent = context;
      
      let isExpanded = false;
      toggleBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        content.style.display = isExpanded ? 'block' : 'none';
        toggleBtn.textContent = isExpanded ? '收起' : '展开';
      });

      container.appendChild(content);
      return container;
    }
  }

  /**
   * JavaScript 代码执行结果渲染器
   */
  class JsCodeResultRenderer {
    render(codeResult) {
      if (!codeResult) return null;

      const container = document.createElement('div');
      container.className = 'js-code-result-container';

      // 代码部分
      if (codeResult.code) {
        const codeBlock = document.createElement('pre');
        codeBlock.className = 'code-block';
        
        const codeEl = document.createElement('code');
        codeEl.className = 'language-javascript';
        codeEl.textContent = codeResult.code;
        
        codeBlock.appendChild(codeEl);
        container.appendChild(codeBlock);
      }

      // 执行结果
      if (codeResult.result !== undefined) {
        const resultSection = document.createElement('div');
        resultSection.className = 'result-section';
        
        const resultHeader = document.createElement('div');
        resultHeader.className = 'result-header';
        resultHeader.innerHTML = '<span class="icon">▶️</span> 执行结果';
        
        const resultContent = document.createElement('div');
        resultContent.className = 'result-content';
        
        try {
          // 格式化输出结果
          if (typeof codeResult.result === 'object') {
            resultContent.textContent = JSON.stringify(codeResult.result, null, 2);
          } else {
            resultContent.textContent = String(codeResult.result);
          }
        } catch (e) {
          resultContent.textContent = '[无法序列化结果]';
        }
        
        resultSection.appendChild(resultHeader);
        resultSection.appendChild(resultContent);
        container.appendChild(resultSection);
      }

      // 错误信息
      if (codeResult.error) {
        const errorSection = document.createElement('div');
        errorSection.className = 'error-section';
        
        const errorHeader = document.createElement('div');
        errorHeader.className = 'error-header';
        errorHeader.innerHTML = '<span class="icon">❌</span> 执行错误';
        
        const errorContent = document.createElement('div');
        errorContent.className = 'error-content';
        errorContent.textContent = codeResult.error;
        
        errorSection.appendChild(errorHeader);
        errorSection.appendChild(errorContent);
        container.appendChild(errorSection);
      }

      return container;
    }
  }

  /**
   * 引用标注渲染器
   */
  class CitationRenderer {
    render(citations) {
      if (!citations || citations.length === 0) return null;

      const container = document.createElement('div');
      container.className = 'citations-container';

      const header = document.createElement('div');
      header.className = 'citations-header';
      header.innerHTML = '<span class="icon">📝</span> 引用';
      container.appendChild(header);

      const list = document.createElement('ul');
      list.className = 'citations-list';

      citations.forEach((citation, index) => {
        const item = document.createElement('li');
        item.className = 'citation-item';
        item.innerHTML = `
          <span class="citation-number">[${index + 1}]</span>
          <span class="citation-text">${this.escapeHtml(citation.text)}</span>
          ${citation.source ? `<span class="citation-source"> - ${this.escapeHtml(citation.source)}</span>` : ''}
        `;
        list.appendChild(item);
      });

      container.appendChild(list);
      return container;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  /**
   * 注册消息处理器
   */
  function registerMessageHandlers() {
    const registry = MessageHandlerRegistry;

    // RAG 引用来源
    registry.register(ContentType.RAG_SOURCE, (contentItem) => {
      const renderer = new RagSourceRenderer();
      return renderer.render(contentItem.sources);
    });

    // RAG 上下文
    registry.register(ContentType.RAG_CONTEXT, (contentItem) => {
      const renderer = new RagContextRenderer();
      return renderer.render(contentItem.context);
    });

    // JavaScript 代码执行结果
    registry.register(ContentType.CODE_RESULT, (contentItem) => {
      const renderer = new JsCodeResultRenderer();
      return renderer.render(contentItem);
    });

    // JavaScript 代码
    registry.register(ContentType.JS_CODE, (contentItem) => {
      const renderer = new JsCodeResultRenderer();
      return renderer.render({ code: contentItem.code });
    });

    // 引用标注
    registry.register(ContentType.CITATION, (contentItem) => {
      const renderer = new CitationRenderer();
      return renderer.render(contentItem.citations);
    });
  }

  /**
   * 初始化
   */
  function init() {
    registerMessageHandlers();
    console.log('[RagCodeExtension] Registered message handlers');
  }

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
