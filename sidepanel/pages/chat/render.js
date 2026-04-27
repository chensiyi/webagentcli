// 聊天渲染引擎
// 负责消息渲染、工具卡片渲染、页面主渲染

window.ChatRender = {
  /**
   * 渲染多模态消息内容
   */
  renderMessageContent(content, container) {
    const { create } = window.DOM;
    const messageRegistry = window.MessageTypes?.MessageHandlerRegistry;
    
    // 处理数组格式的多模态内容
    if (Array.isArray(content)) {
      content.forEach(item => {
        // 尝试使用注册的处理器
        if (messageRegistry && item.type !== 'text' && item.type !== 'image_url') {
          const handler = messageRegistry.getHandler(item.type);
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
        
        // 默认处理
        if (item.type === 'text') {
          const contentDiv = create('div', { 
            className: 'message-content',
            style: { lineHeight: '1.6', wordWrap: 'break-word' }
          });
          contentDiv.innerHTML = window.renderMarkdown(item.text);
          container.appendChild(contentDiv);
        } else if (item.type === 'image_url') {
          const imgContainer = create('div', {
            style: { margin: '8px 0' }
          });
          const img = create('img', {
            attrs: { src: item.image_url.url },
            style: { maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }
          });
          img.onclick = () => window.open(item.image_url.url, '_blank');
          imgContainer.appendChild(img);
          container.appendChild(imgContainer);
        } else if (item.type === 'input_audio') {
          // 渲染音频
          const audioContainer = create('div', {
            style: { margin: '8px 0' }
          });
          const audio = create('audio', {
            attrs: { 
              src: item.input_audio.data,
              controls: true
            },
            style: { maxWidth: '100%', borderRadius: '8px' }
          });
          audioContainer.appendChild(audio);
          container.appendChild(audioContainer);
        } else if (item.type === 'file') {
          // 渲染文件（视频等）
          const fileContainer = create('div', {
            style: { margin: '8px 0' }
          });
          
          // 根据MIME类型判断
          if (item.file.mimeType?.startsWith('video/')) {
            const video = create('video', {
              attrs: { 
                src: item.file.data,
                controls: true
              },
              style: { maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }
            });
            fileContainer.appendChild(video);
          } else {
            // 其他文件显示为链接
            const link = create('a', {
              attrs: {
                href: item.file.data,
                download: item.file.filename,
                target: '_blank'
              },
              text: `📎 ${item.file.filename}`,
              style: {
                display: 'inline-block',
                padding: '8px 12px',
                background: 'var(--color-surface)',
                borderRadius: '6px',
                textDecoration: 'none',
                color: 'var(--color-primary)'
              }
            });
            fileContainer.appendChild(link);
          }
          
          container.appendChild(fileContainer);
        }
      });
    } else {
      // 普通文本消息
      const contentDiv = create('div', { 
        className: 'message-content',
        style: { 
          lineHeight: '1.6', 
          wordWrap: 'break-word'
        }
      });
      
      contentDiv.innerHTML = window.renderMarkdown(content || '');
      container.appendChild(contentDiv);
    }
  },
  
  /**
   * 渲染完整的工具调用卡片
   */
  renderToolCallCard(toolCall, index, resultData, isLoading) {
    const { create } = window.DOM;
    // 优先从 function.name 获取工具名称（新格式），兼容旧格式 type
    // 注意：toolCall.id 是调用ID（如 call_xxx_0），不是工具名称
    let toolName = toolCall.function?.name || toolCall.type || '未知工具';
    
    // 如果获取到的是类似 call_xxx 的ID格式，尝试从 name 字段获取（tool消息中的name字段）
    if (toolName.startsWith('call_') && resultData?.tool_result?.name) {
      toolName = resultData.tool_result.name;
    }
    
    // 工具名称映射为友好的中文显示
    const toolIcon = toolName === 'web_search' ? '🔍 网络搜索' : 
                     toolName === 'js_code' ? '⚡ JavaScript 执行' : 
                     toolName === 'web_fetch' ? '🌐 网页访问' :
                     toolName === 'terminal' ? '💻 终端执行' :
                     toolName;
    
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
      header.appendChild(loadingBadge);
    }
    
    card.appendChild(header);
    
    // 参数区域（直接显示源码）
    const params = toolCall.query || toolCall.code || toolCall.function?.arguments;
    if (params) {
      const paramsContent = create('div', {
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
      
      card.appendChild(paramsContent);
    }
    
    // 结果区域
    if (hasResult) {
      const resultSection = create('details', {
        style: { marginBottom: '0' }
      });
      // 默认折叠，不自动展开
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
        // 成功：显示结构化结果
        const result = resultData.tool_result;
        
        if (result.results && Array.isArray(result.results) && result.results.length > 0) {
          // 分页显示：默认显示前10条
          const PAGE_SIZE = 10;
          let currentPage = 0;
          const totalPages = Math.ceil(result.results.length / PAGE_SIZE);
          
          // 创建结果容器
          const resultsContainer = create('div', {});
          
          // 渲染当前页的结果
          function renderPage(page) {
            resultsContainer.innerHTML = '';
            const start = page * PAGE_SIZE;
            const end = Math.min(start + PAGE_SIZE, result.results.length);
            
            for (let ridx = start; ridx < end; ridx++) {
              const item = result.results[ridx];
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
            
            resultsContainer.appendChild(resultItem);
          }
          
          resultContent.appendChild(resultsContainer);
        }
        
        // 添加分页控制按钮
        if (totalPages > 1) {
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
          
          // 上一页按钮
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
          
          prevBtn.onclick = () => {
            if (currentPage > 0) {
              currentPage--;
              renderPage(currentPage);
              updateButtons();
            }
          };
          
          // 页码显示
          const pageInfo = create('span', {
            style: {
              fontSize: '12px',
              color: '#6b7280'
            },
            text: `第 ${currentPage + 1}/${totalPages} 页`
          });
          
          // 下一页按钮
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
          
          nextBtn.onclick = () => {
            if (currentPage < totalPages - 1) {
              currentPage++;
              renderPage(currentPage);
              updateButtons();
            }
          };
          
          // 更新按钮状态
          function updateButtons() {
            prevBtn.style.cursor = currentPage > 0 ? 'pointer' : 'not-allowed';
            prevBtn.style.opacity = currentPage > 0 ? '1' : '0.5';
            nextBtn.style.cursor = currentPage < totalPages - 1 ? 'pointer' : 'not-allowed';
            nextBtn.style.opacity = currentPage < totalPages - 1 ? '1' : '0.5';
            pageInfo.textContent = `第 ${currentPage + 1}/${totalPages} 页`;
          }
          
          paginationDiv.appendChild(prevBtn);
          paginationDiv.appendChild(pageInfo);
          paginationDiv.appendChild(nextBtn);
          
          resultContent.appendChild(paginationDiv);
        }
          
          // 初始渲染第一页
          renderPage(0);
        } else {
          // 其他类型的结果
          resultContent.textContent = result.output || JSON.stringify(result, null, 2);
        }
      } else {
        // 失败：显示错误信息
        const errorInfo = resultData.tool_result;
        const errorMessage = errorInfo.error || errorInfo.message || '未知错误';
        const errorType = errorInfo.type || toolCall.type || 'unknown';
        
        const errorContent = `工具类型: ${errorType}
错误信息: ${errorMessage}`;
        
        resultContent.style.color = '#dc2626';
        resultContent.style.fontFamily = 'Consolas, Monaco, monospace';
        resultContent.textContent = errorContent;
      }
      
      resultSection.appendChild(resultContent);
      card.appendChild(resultSection);
    }
    
    return card;
  }
};
