/**
 * Storage Page UI - 存储管理页面
 */

window.Pages = window.Pages || {};

window.Pages.storage = function(container, serviceCenter) {
  const { create, clear } = window.DOM;
  
  if (!serviceCenter) {
    console.error('[StoragePage] ServiceCenter not available');
    return;
  }
  
  // 确保使用传入的 serviceCenter 创建或获取 EventHandler
  if (!window.storageEventHandler) {
    window.storageEventHandler = new window.StorageEventHandler(serviceCenter);
  }
  const eventHandler = window.storageEventHandler;
  
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
      window.UI.Button({
        className: 'btn-primary btn-small',
        text: '刷新',
        onClick: () => eventHandler.handleRefresh()
      })
    ]);

    // 页面内容
    const content = create('div', { className: 'page-content' });

    // 搜索框
    const searchBox = window.UI.Input({
      className: 'mb-12',
      placeholder: '搜索存储项...',
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
  }

  /**
   * 创建统计卡片
   */
  function createStatsCard() {
    return window.UI.Card({
      className: 'flex justify-between items-center'
    }, [
      create('div', {
        className: 'text-sm text-secondary',
        text: `共 ${filteredItems.length} 项 · 总计 ${stats.totalSizeKB || 0} KB`
      }),
      window.UI.Button({
        className: 'btn-error btn-small',
        text: '清除所有',
        onClick: async () => {
          const confirmed = await window.Toast.confirm({
            title: '清除所有存储',
            message: '确定要清除所有存储数据吗？此操作不可撤销。',
            confirmText: '确定清除',
            type: 'danger'
          });
          if (confirmed) {
            await eventHandler.storageManager.clearAll();
            window.Toast.success('已清空');
            eventHandler.handleRefresh();
          }
        }
      })
    ]);
  }

  /**
   * 渲染存储列表
   */
  function renderStorageList(content) {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = filteredItems.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
      content.appendChild(window.UI.EmptyState({
        icon: '💾',
        title: '暂无存储数据',
        desc: searchKeyword ? '未找到匹配的存储项' : '存储为空'
      }));
      return;
    }

    pageItems.forEach(([key, value]) => {
      const headerRow = create('div', {
        className: 'flex justify-between items-start gap-12'
      }, [
        create('div', { className: 'flex-1 min-w-0' }, [
          create('div', {
            className: 'text-sm font-semibold text-break',
            text: key
          }),
          create('div', {
            className: 'text-xs text-secondary mt-4',
            text: `${JSON.stringify(value).length} bytes`
          })
        ]),
        create('div', { className: 'flex flex-col gap-8 flex-shrink-0' }, [
          window.UI.Button({
            className: 'btn-small btn-text whitespace-nowrap',
            text: '编辑',
            onClick: (e) => {
              e.stopPropagation();
              openEditDialog(key, value);
            }
          }),
          window.UI.Button({
            className: 'btn-small btn-error whitespace-nowrap',
            text: '删除',
            onClick: async (e) => {
              e.stopPropagation();
              await eventHandler.handleDelete(key);
            }
          })
        ])
      ]);

      content.appendChild(window.UI.Card({}, [headerRow]));
    });
  }

  /**
   * 渲染分页控件
   */
  function renderPagination(content) {
    const totalPages = Math.ceil(filteredItems.length / pageSize);
    if (totalPages <= 1) return;

    const pagination = create('div', {
      className: 'flex justify-center items-center mt-12 gap-8'
    });

    // 上一页
    pagination.appendChild(window.UI.Button({
      className: 'btn-small',
      text: '上一页',
      disabled: currentPage === 1,
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
    pagination.appendChild(window.UI.Button({
      className: 'btn-small',
      text: '下一页',
      disabled: currentPage === totalPages,
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
    const textarea = create('textarea', {
      className: 'textarea textarea-monospace flex-1',
      style: { minHeight: '200px' },
      text: JSON.stringify(value, null, 2)
    });

    const dialog = window.UI.Dialog({
      title: `编辑: ${key}`,
      content: textarea,
      actions: [
        { 
          text: '取消', 
          className: 'btn-secondary' 
        },
        { 
          text: '保存', 
          className: 'btn-primary',
          autoClose: false,
          onClick: async () => {
            try {
              const newValue = JSON.parse(textarea.value);
              await eventHandler.storageManager.updateItem(key, newValue);
              window.Toast.success('已更新');
              dialog.close();
              eventHandler.handleRefresh();
            } catch (e) {
              window.Toast.error(`JSON 格式错误: ${e.message}`);
            }
          }
        }
      ]
    });

    dialog.open();
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
