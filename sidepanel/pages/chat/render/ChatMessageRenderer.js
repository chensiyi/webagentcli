// 聊天消息渲染引擎
// 整合各种渲染器，负责多模态消息的统一渲染

class ChatMessageRenderer {
  constructor() {
    // 初始化各种渲染器
    this.textRenderer = new window.TextRenderer();
    this.imageRenderer = new window.ImageRenderer();
    this.audioRenderer = new window.AudioRenderer();
    this.videoRenderer = new window.VideoRenderer();
    this.fileRenderer = new window.FileRenderer();
    
    // 注册表（用于扩展）
    this.messageRegistry = window.MessageTypes?.MessageHandlerRegistry;
  }
  
  /**
   * 渲染多模态消息内容
   * @param {string|array} content - 消息内容
   * @param {HTMLElement} container - 容器元素
   * @param {boolean} appendOnly - 是否只追加（流式更新时使用）
   */
  renderMessageContent(content, container, appendOnly = false) {
    const { create } = window.DOM;
    
    // 如果不是追加模式，先清空容器（除了 loading-content）
    if (!appendOnly) {
      const loadingContent = container.querySelector('.loading-content');
      container.innerHTML = '';
      if (loadingContent) {
        container.appendChild(loadingContent);
      }
    }
    
    // 处理数组格式的多模态内容
    if (Array.isArray(content)) {
      content.forEach(item => {
        // 尝试使用注册的处理器
        if (this.messageRegistry && item.type !== 'text' && item.type !== 'image_url') {
          const handler = this.messageRegistry.getHandler(item.type);
          if (handler) {
            try {
              const element = handler(item);
              if (element) {
                container.appendChild(element);
                return;
              }
            } catch (error) {
              console.warn('[Chat] Handler error for type:', item.type, error);
            }
          }
        }
        
        // 使用内置渲染器
        this.renderContentItem(item, container);
      });
    } else {
      // 普通文本消息
      this.textRenderer.update(content, container);
    }
  }
  
  /**
   * 渲染单个内容项
   * @param {Object} item - 内容项
   * @param {HTMLElement} container - 容器元素
   */
  renderContentItem(item, container) {
    let element = null;
    
    switch (item.type) {
      case 'text':
        element = this.textRenderer.render(item.text);
        break;
      case 'image_url':
        element = this.imageRenderer.render(item);
        break;
      case 'input_audio':
        element = this.audioRenderer.render(item);
        break;
      case 'file':
        // 根据 MIME 类型判断是视频还是其他文件
        if (item.file.mimeType?.startsWith('video/')) {
          element = this.videoRenderer.render(item);
        } else {
          element = this.fileRenderer.render(item);
        }
        break;
      default:
        console.warn('[ChatMessageRenderer] Unknown content type:', item.type);
    }
    
    if (element) {
      container.appendChild(element);
    }
  }
  
  /**
   * 渲染完整的工具调用卡片
   * @param {Object} toolCall - 工具调用数据
   * @param {number} index - 工具调用序号
   * @param {Object} resultData - 执行结果数据
   * @param {boolean} isLoading - 是否正在加载
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  renderToolCallCard(toolCall, index, resultData, isLoading) {
    const { create } = window.DOM;
    
    // 获取工具名称
    let toolName = toolCall.function?.name || toolCall.type || '未知工具';
    
    // 如果获取到的是类似 call_xxx 的ID格式，尝试从 name 字段获取
    if (toolName.startsWith('call_') && resultData?.tool_result?.name) {
      toolName = resultData.tool_result.name;
    }
    
    // 工具名称映射为友好的中文显示
    const toolIcon = this.getToolIcon(toolName);
    const isSuccess = resultData?.tool_result?.success;
    const hasResult = resultData && resultData.tool_result;
    
    // 创建主卡片容器
    const card = create('div', {
      className: 'tool-call-card'
    });
    
    // 头部：编号 + 工具名称 + 状态
    const header = this.createToolCardHeader(index, toolIcon, hasResult, isSuccess, isLoading);
    card.appendChild(header);
    
    // 参数区域
    const params = toolCall.query || toolCall.code || toolCall.function?.arguments;
    if (params) {
      const paramsContent = this.createToolCardParams(params);
      card.appendChild(paramsContent);
    }
    
    // 结果区域
    if (hasResult) {
      const resultSection = this.createToolCardResult(resultData, isSuccess, toolCall);
      card.appendChild(resultSection);
    }
    
    return card;
  }
  
  /**
   * 获取工具图标
   */
  getToolIcon(toolName) {
    const iconMap = {
      'web_search': '🔍 网络搜索',
      'js_code': '⚡ JavaScript 执行',
      'web_fetch': '🌐 网页访问',
      'terminal': '💻 终端执行'
    };
    return iconMap[toolName] || toolName;
  }
  
  /**
   * 创建工具卡片头部
   */
  createToolCardHeader(index, toolIcon, hasResult, isSuccess, isLoading) {
    const { create } = window.DOM;
    
    const header = create('div', {
      className: 'tool-call-header'
    });
    
    // 编号徽章
    const badge = create('div', {
      className: 'tool-call-badge',
      text: String(index + 1)
    });
    header.appendChild(badge);
    
    // 工具名称
    const nameText = create('div', {
      className: 'tool-call-name',
      text: toolIcon
    });
    header.appendChild(nameText);
    
    // 状态标记
    if (hasResult) {
      const statusBadge = create('div', {
        className: `tool-call-status ${isSuccess ? 'success' : 'error'}`,
        text: isSuccess ? '成功' : '失败'
      });
      header.appendChild(statusBadge);
    } else if (isLoading) {
      const loadingBadge = this.createLoadingBadge();
      header.appendChild(loadingBadge);
    }
    
    return header;
  }
  
  /**
   * 创建加载中徽章
   */
  createLoadingBadge() {
    const { create } = window.DOM;
    
    const loadingBadge = create('div', {
      className: 'tool-call-status loading'
    });
    
    const spinner = create('span', {
      className: 'tool-call-spinner'
    });
    
    loadingBadge.appendChild(spinner);
    loadingBadge.appendChild(document.createTextNode('执行中'));
    
    return loadingBadge;
  }
  
  /**
   * 创建工具卡片参数区域
   */
  createToolCardParams(params) {
    const { create } = window.DOM;
    
    return create('div', {
      className: 'tool-call-params',
      text: params
    });
  }
  
  /**
   * 创建工具卡片结果区域
   */
  createToolCardResult(resultData, isSuccess, toolCall) {
    const { create } = window.DOM;
    
    const resultSection = create('details', {
      className: 'tool-call-result'
    });
    resultSection.removeAttribute('open');
    
    const summary = create('summary', {
      className: `tool-call-result summary ${isSuccess ? 'success' : 'error'}`,
      text: isSuccess ? ' 执行结果' : ' 错误信息'
    });
    
    // 移除内联 hover 事件，改用 CSS
    
    resultSection.appendChild(summary);
    
    const resultContent = create('div', {
      className: `tool-call-result-content ${!isSuccess ? 'error' : ''}`
    });
    
    if (isSuccess) {
      this.renderSuccessResult(resultData, resultContent);
    } else {
      this.renderErrorResult(resultData, toolCall, resultContent);
    }
    
    resultSection.appendChild(resultContent);
    return resultSection;
  }
  
  /**
   * 渲染成功结果
   */
  renderSuccessResult(resultData, resultContent) {
    const result = resultData.tool_result;
    
    if (result.results && Array.isArray(result.results) && result.results.length > 0) {
      this.renderPaginatedResults(result.results, resultContent);
    } else {
      resultContent.textContent = result.output || JSON.stringify(result, null, 2);
    }
  }
  
  /**
   * 渲染分页结果
   */
  renderPaginatedResults(results, resultContent) {
    const PAGE_SIZE = 10;
    let currentPage = 0;
    const totalPages = Math.ceil(results.length / PAGE_SIZE);
    
    const resultsContainer = document.createElement('div');
    
    const renderPage = (page) => {
      resultsContainer.innerHTML = '';
      const start = page * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, results.length);
      
      for (let ridx = start; ridx < end; ridx++) {
        const item = results[ridx];
        const resultItem = this.createResultItem(item, ridx, end);
        resultsContainer.appendChild(resultItem);
      }
    };
    
    resultContent.appendChild(resultsContainer);
    
    // 添加分页控制
    if (totalPages > 1) {
      const paginationDiv = this.createPaginationControls(currentPage, totalPages, renderPage);
      resultContent.appendChild(paginationDiv);
    }
    
    // 初始渲染第一页
    renderPage(0);
  }
  
  /**
   * 创建结果项
   */
  createResultItem(item, ridx, end) {
    const { create } = window.DOM;
    
    const resultItem = create('div', {
      className: 'search-result-item'
    });
    
    // CSS hover 效果已自动应用
    
    if (item.url) {
      resultItem.onclick = () => window.open(item.url, '_blank');
    }
    
    const rankBadge = create('span', {
      className: 'search-result-rank',
      text: String(item.rank || (ridx + 1))
    });
    
    const titleText = create('span', {
      className: 'search-result-title',
      text: item.title
    });
    
    const titleRow = create('div', {
      className: 'search-result-title-row'
    });
    titleRow.appendChild(rankBadge);
    titleRow.appendChild(titleText);
    resultItem.appendChild(titleRow);
    
    if (item.snippet) {
      const snippet = create('div', {
        className: 'search-result-snippet',
        text: item.snippet
      });
      resultItem.appendChild(snippet);
    }
    
    return resultItem;
  }
  
  /**
   * 创建分页控件
   */
  createPaginationControls(currentPage, totalPages, onPageChange) {
    const { create } = window.DOM;
    
    const paginationDiv = create('div', {
      className: 'pagination-controls'
    });
    
    const prevBtn = create('button', {
      className: 'pagination-btn',
      text: '上一页'
    });
    
    // 动态更新按钮状态
    if (currentPage === 0) {
      prevBtn.disabled = true;
    }
    
    const pageInfo = create('span', {
      className: 'pagination-info',
      text: `第 ${currentPage + 1}/${totalPages} 页`
    });
    
    const nextBtn = create('button', {
      className: 'pagination-btn',
      text: '下一页'
    });
    
    if (currentPage >= totalPages - 1) {
      nextBtn.disabled = true;
    }
    
    const updateButtons = () => {
      prevBtn.disabled = currentPage === 0;
      nextBtn.disabled = currentPage >= totalPages - 1;
      pageInfo.textContent = `第 ${currentPage + 1}/${totalPages} 页`;
    };
    
    prevBtn.onclick = () => {
      if (currentPage > 0) {
        currentPage--;
        onPageChange(currentPage);
        updateButtons();
      }
    };
    
    nextBtn.onclick = () => {
      if (currentPage < totalPages - 1) {
        currentPage++;
        onPageChange(currentPage);
        updateButtons();
      }
    };
    
    paginationDiv.appendChild(prevBtn);
    paginationDiv.appendChild(pageInfo);
    paginationDiv.appendChild(nextBtn);
    
    return paginationDiv;
  }
  
  /**
   * 渲染错误结果
   */
  renderErrorResult(resultData, toolCall, resultContent) {
    const errorInfo = resultData.tool_result;
    const errorMessage = errorInfo.error || errorInfo.message || '未知错误';
    const errorType = errorInfo.type || toolCall.type || 'unknown';
    
    const errorContent = `工具类型: ${errorType}\n错误信息: ${errorMessage}`;
    
    resultContent.style.color = '#dc2626';
    resultContent.style.fontFamily = 'Consolas, Monaco, monospace';
    resultContent.textContent = errorContent;
  }
}

window.ChatMessageRenderer = ChatMessageRenderer;
