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
      style: {
        padding: '8px 10px',
        background: 'var(--color-surface)',
        borderRadius: '6px',
        marginBottom: '6px',
        border: '1px solid var(--color-border)'
      }
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
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '6px'
      }
    });
    
    // 编号徽章
    const badge = create('div', {
      style: {
        width: '22px',
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-primary)',
        color: 'white',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
        flexShrink: 0
      },
      text: String(index + 1)
    });
    header.appendChild(badge);
    
    // 工具名称
    const nameText = create('div', {
      style: {
        flex: 1,
        fontSize: '12px',
        fontWeight: '500',
        color: 'var(--color-text)'
      },
      text: toolIcon
    });
    header.appendChild(nameText);
    
    // 状态标记
    if (hasResult) {
      const statusBadge = create('div', {
        style: {
          padding: '2px 6px',
          borderRadius: '8px',
          fontSize: '10px',
          fontWeight: '500',
          background: isSuccess ? 'var(--color-success-light)' : 'var(--color-danger-light)',
          color: isSuccess ? 'var(--color-success)' : 'var(--color-danger)'
        },
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
      style: {
        padding: '2px 6px',
        borderRadius: '8px',
        fontSize: '10px',
        fontWeight: '500',
        background: 'var(--color-primary-light)',
        color: 'var(--color-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }
    });
    
    const spinner = create('span', {
      style: {
        display: 'inline-block',
        width: '10px',
        height: '10px',
        border: '2px solid #3b82f6',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }
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
      style: {
        marginBottom: '6px',
        padding: '6px 8px',
        background: 'var(--color-bg)',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'Consolas, Monaco, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: '1.5',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)'
      },
      text: params
    });
  }
  
  /**
   * 创建工具卡片结果区域
   */
  createToolCardResult(resultData, isSuccess, toolCall) {
    const { create } = window.DOM;
    
    const resultSection = create('details', {
      style: { marginBottom: '0' }
    });
    resultSection.removeAttribute('open');
    
    const summary = create('summary', {
      style: {
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: '500',
        color: isSuccess ? 'var(--color-success)' : 'var(--color-danger)',
        padding: '4px 6px',
        background: isSuccess ? 'var(--color-success-light)' : 'var(--color-danger-light)',
        borderRadius: '4px',
        transition: 'background 0.2s',
        outline: 'none',
        listStyle: 'none'
      },
      text: isSuccess ? ' 执行结果' : ' 错误信息'
    });
    
    summary.onmouseenter = () => summary.style.background = isSuccess ? 'rgba(var(--color-success-rgb), 0.15)' : 'rgba(var(--color-danger-rgb), 0.15)';
    summary.onmouseleave = () => summary.style.background = isSuccess ? 'var(--color-success-light)' : 'var(--color-danger-light)';
    
    resultSection.appendChild(summary);
    
    const resultContent = create('div', {
      style: {
        marginTop: '4px',
        padding: '6px 8px',
        background: 'var(--color-bg)',
        borderRadius: '4px',
        fontSize: '10px',
        lineHeight: '1.5',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
        maxHeight: '200px',
        overflow: 'auto'
      }
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
      style: {
        padding: '10px',
        marginBottom: ridx < end - 1 ? '8px' : '0',
        background: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
      }
    });
    
    resultItem.onmouseenter = () => {
      resultItem.style.background = '#f3f4f6';
      resultItem.style.borderColor = '#3b82f6';
    };
    resultItem.onmouseleave = () => {
      resultItem.style.background = '#f9fafb';
      resultItem.style.borderColor = '#e5e7eb';
    };
    
    if (item.url) {
      resultItem.onclick = () => window.open(item.url, '_blank');
    }
    
    const rankBadge = create('span', {
      style: {
        display: 'inline-block',
        width: '20px',
        height: '20px',
        lineHeight: '20px',
        textAlign: 'center',
        background: '#3b82f6',
        color: 'white',
        borderRadius: '50%',
        fontSize: '11px',
        fontWeight: 'bold',
        marginRight: '8px',
        flexShrink: 0
      },
      text: String(item.rank || (ridx + 1))
    });
    
    const titleText = create('span', {
      style: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#1f2937'
      },
      text: item.title
    });
    
    const titleRow = create('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        marginBottom: '4px'
      }
    });
    titleRow.appendChild(rankBadge);
    titleRow.appendChild(titleText);
    resultItem.appendChild(titleRow);
    
    if (item.snippet) {
      const snippet = create('div', {
        style: {
          fontSize: '11px',
          color: '#6b7280',
          lineHeight: '1.5',
          marginLeft: '28px'
        },
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
      style: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '8px',
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #e5e7eb'
      }
    });
    
    const prevBtn = create('button', {
      style: {
        padding: '6px 12px',
        fontSize: '12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        background: 'white',
        cursor: currentPage > 0 ? 'pointer' : 'not-allowed',
        opacity: currentPage > 0 ? '1' : '0.5',
        color: '#374151'
      },
      text: '上一页'
    });
    
    const pageInfo = create('span', {
      style: {
        fontSize: '12px',
        color: '#6b7280'
      },
      text: `第 ${currentPage + 1}/${totalPages} 页`
    });
    
    const nextBtn = create('button', {
      style: {
        padding: '6px 12px',
        fontSize: '12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        background: 'white',
        cursor: currentPage < totalPages - 1 ? 'pointer' : 'not-allowed',
        opacity: currentPage < totalPages - 1 ? '1' : '0.5',
        color: '#374151'
      },
      text: '下一页'
    });
    
    const updateButtons = () => {
      prevBtn.style.cursor = currentPage > 0 ? 'pointer' : 'not-allowed';
      prevBtn.style.opacity = currentPage > 0 ? '1' : '0.5';
      nextBtn.style.cursor = currentPage < totalPages - 1 ? 'pointer' : 'not-allowed';
      nextBtn.style.opacity = currentPage < totalPages - 1 ? '1' : '0.5';
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
