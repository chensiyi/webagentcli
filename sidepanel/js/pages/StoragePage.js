/**
 * Storage Page UI - 存储管理页面
 */

window.Pages = window.Pages || {};

window.Pages.storage = function(container) {
  const { create, clear } = window.DOM;
  const eventHandler = window.StorageEventHandler;
  
  let storageItems = [];
  let filteredItems = [];
  let stats = {};
  let searchKeyword = '';
  let searchTimer = null;
  let currentPage = 1;
  const pageSize = 20;

  /**
   * 渲染页面
   */
  function render() {
    clear(container);

    const page = create('div', { className: 'page' });

    // 页面头部
    const header = create('div', { className: 'page-header' }, [
      create('h1', { className: 'page-title', text: '存储管理' }),
      create('button', {
        className: 'btn btn-primary btn-small',
        text: '刷新',
        onClick: () => eventHandler.handleRefresh()
      })
    ]);

    // 页面内容
    const content = create('div', { className: 'page-content' });

    // 搜索框
    const searchBox = create('input', {
      className: 'input mb-12',
      attrs: { 
        type: 'text', 
        placeholder: '搜索存储项...' 
      },
      onInput: (e) => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          searchKeyword = e.target.value.trim();
          if (searchKeyword) {
            eventHandler.handleSearch(searchKeyword);
          } else {
            filteredItems = storageItems;
            currentPage = 1;
            render();
          }
        }, 500);
      }
    });
    content.appendChild(searchBox);

    // 统计信息卡片
    content.appendChild(createStatsCard());

    // 存储列表
    renderStorageList(content);

    // 分页控件
    renderPagination(content);

    page.appendChild(header);
    page.appendChild(content);
    container.appendChild(page);
    
    // 绑定清除所有按钮
    bindClearAllButton(content);
  }

  /**
   * 创建统计卡片
   */
  function createStatsCard() {
    return create('div', {
      className: 'card flex justify-between items-center'
    }, [
      create('div', {
        className: 'text-sm text-secondary',
        text: `共 ${filteredItems.length} 项 · 总计 ${stats.totalSizeKB || 0} KB`
      }),
      create('button', {
        className: 'btn btn-error btn-small',
        text: '清除所有'
      })
    ]);
  }

  /**
   * 绑定清除所有按钮
   */
  function bindClearAllButton(content) {
    const statsCard = content.querySelector('.card.flex');
    if (statsCard) {
      const clearBtn = statsCard.querySelector('.btn-error');
      if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
          const confirmed = await window.Toast?.confirm?.({
            title: '清除所有数据',
            message: '确定要清除所有存储数据吗？此操作不可恢复！'
          });
          if (confirmed) {
            await eventHandler.storageController.clearAll();
            eventHandler.handleRefresh();
          }
        });
      }
    }
  }

  /**
   * 渲染存储列表
   */
  function renderStorageList(content) {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = filteredItems.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
      content.appendChild(create('div', {
        className: 'empty-state'
      }, [
        create('div', { className: 'empty-state-icon', text: '💾' }),
        create('div', { className: 'empty-state-title', text: '暂无存储数据' }),
        create('div', { className: 'empty-state-desc', text: searchKeyword ? '未找到匹配的存储项' : '存储为空' })
      ]));
      return;
    }

    pageItems.forEach(([key, value]) => {
      const card = create('div', { className: 'card' });

      // 标题行
      const headerRow = create('div', {
        className: 'flex justify-between items-start',
        style: { gap: '12px' }
      }, [
        create('div', { 
          className: 'flex-1',
          style: { minWidth: '0' } 
        }, [
          create('div', {
            className: 'text-sm font-semibold',
            style: {
              wordBreak: 'break-all',
              lineHeight: '1.4'
            },
            text: key
          }),
          create('div', {
            className: 'text-xs text-secondary mt-4',
            text: `${JSON.stringify(value).length} bytes`
          })
        ]),
        create('div', { 
          className: 'flex flex-col gap-8',
          style: { flexShrink: '0' } 
        }, [
          create('button', {
            className: 'btn btn-small btn-text',
            style: { whiteSpace: 'nowrap' },
            text: '编辑'
          }),
          create('button', {
            className: 'btn btn-small btn-error',
            style: { whiteSpace: 'nowrap' },
            text: '删除'
          })
        ])
      ]);

      card.appendChild(headerRow);
      content.appendChild(card);
      
      // 绑定事件
      const editBtn = card.querySelector('.btn-text');
      const deleteBtn = card.querySelector('.btn-error');
      
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditDialog(key, value);
        });
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          console.log('[StoragePage] Delete button clicked for key:', key);
          try {
            await eventHandler.handleDelete(key);
            console.log('[StoragePage] Delete completed');
          } catch (error) {
            console.error('[StoragePage] Delete error:', error);
            window.Toast?.error('删除失败: ' + error.message);
          }
        });
      }
    });
  }

  /**
   * 渲染分页控件
   */
  function renderPagination(content) {
    const totalPages = Math.ceil(filteredItems.length / pageSize);
    if (totalPages <= 1) return;

    const pagination = create('div', {
      className: 'flex justify-center items-center mt-12',
      style: { gap: '8px' }
    });

    // 上一页
    pagination.appendChild(create('button', {
      className: 'btn btn-small',
      text: '上一页',
      attrs: { disabled: currentPage === 1 },
      onClick: () => {
        if (currentPage > 1) {
          currentPage--;
          render();
        }
      }
    }));

    // 页码信息
    pagination.appendChild(create('div', {
      className: 'text-sm text-secondary',
      text: `第 ${currentPage} / ${totalPages} 页`
    }));

    // 下一页
    pagination.appendChild(create('button', {
      className: 'btn btn-small',
      text: '下一页',
      attrs: { disabled: currentPage === totalPages },
      onClick: () => {
        if (currentPage < totalPages) {
          currentPage++;
          render();
        }
      }
    }));

    content.appendChild(pagination);
  }

  /**
   * 打开编辑对话框
   */
  function openEditDialog(key, value) {
    const overlay = create('div', { className: 'dialog-overlay' });
    const dialog = create('div', { 
      className: 'dialog-content', 
      style: { 
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column'
      } 
    });

    // 标题
    dialog.appendChild(create('h3', {
      style: {
        fontSize: '16px',
        fontWeight: '600',
        marginBottom: '12px'
      },
      text: `编辑: ${key}`
    }));

    // 编辑器（自适应高度）
    const textarea = create('textarea', {
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '8px',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        resize: 'vertical',
        minHeight: '150px',
        maxHeight: '50vh',
        marginBottom: '12px'
      },
      text: JSON.stringify(value, null, 2)
    });
    dialog.appendChild(textarea);

    // 错误提示
    const errorText = create('div', {
      style: {
        color: 'var(--color-error)',
        fontSize: '12px',
        minHeight: '16px',
        marginBottom: '12px'
      }
    });
    dialog.appendChild(errorText);

    // 按钮组（不拉伸）
    const saveBtn = create('button', {
      style: {
        padding: '8px 16px',
        backgroundColor: 'var(--color-primary)',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      },
      text: '保存'
    });
    
    const cancelBtn = create('button', {
      style: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        cursor: 'pointer'
      },
      text: '取消'
    });

    // 绑定保存事件
    saveBtn.addEventListener('click', async () => {
      try {
        const newValue = JSON.parse(textarea.value);
        await eventHandler.storageController.updateItem(key, newValue);
        overlay.remove();
        window.Toast?.success('保存成功');
        eventHandler.handleRefresh();
      } catch (e) {
        errorText.textContent = `JSON 格式错误: ${e.message}`;
      }
    });

    // 绑定取消事件
    cancelBtn.addEventListener('click', () => overlay.remove());

    const buttonGroup = create('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
      }
    }, [cancelBtn, saveBtn]);
    dialog.appendChild(buttonGroup);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /**
   * 更新数据（由 EventHandler 调用）
   */
  function updateData(items, newStats) {
    storageItems = items;
    stats = newStats;
    filteredItems = storageItems;
    currentPage = 1;
    render();
  }

  /**
   * 更新搜索结果（由 EventHandler 调用）
   */
  function updateSearchResults(items, keyword) {
    filteredItems = items;
    searchKeyword = keyword;
    currentPage = 1;
    render();
  }

  // 暴露方法供 EventHandler 调用
  window.Pages.storage.updateData = updateData;
  window.Pages.storage.updateSearchResults = updateSearchResults;

  // 初始加载
  eventHandler.handleRefresh();
};
