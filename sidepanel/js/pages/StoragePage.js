/**
 * Storage Page UI - 存储管理页面
 */

import { Pages, DOM } from '../utils/dom.js';
import { UI } from '../components/UI.js';
import { Events } from '../events.js';
import { Toast } from '../utils/toast.js';
import { StorageEventHandler } from '../event-handlers/StorageEventHandler.js';
import { appState } from '../state.js';

Pages.storage = function(container, kernel) {
  const { create, clear } = DOM;

  if (!kernel) {
    console.error('[StoragePage] Kernel not available');
    return;
  }
  
  // 确保使用传入的 kernel 创建或获取 EventHandler
  if (!appState.storageEventHandler) {
    appState.storageEventHandler = new StorageEventHandler(kernel);
  }
  const eventHandler = appState.storageEventHandler;
  
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
      UI.Button({
        className: 'btn-primary btn-small',
        text: '刷新',
        onClick: () => eventHandler.handleRefresh()
      })
    ]);

    // 页面内容
    const content = create('div', { className: 'page-content' });

    // 搜索框
    const searchBox = UI.Input({
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
    return UI.Card({
      className: 'flex justify-between items-center'
    }, [
      create('div', {
        className: 'text-sm text-secondary',
        text: `共 ${filteredItems.length} 项 · 总计 ${stats.totalSizeKB || 0} KB`
      }),
      UI.Button({
        className: 'btn-error btn-small',
        text: '清除所有',
        onClick: async () => {
          const confirmed = await Toast.confirm({
            title: '清除所有存储',
            message: '确定要清除所有存储数据吗？此操作不可撤销。',
            confirmText: '确定清除',
            type: 'danger'
          });
          if (confirmed) {
            await eventHandler.storageManager.clearAll();
            Toast.success('已清空');
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
      content.appendChild(UI.EmptyState({
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
          UI.Button({
            className: 'btn-small btn-text whitespace-nowrap',
            text: '编辑',
            onClick: (e) => {
              e.stopPropagation();
              openEditDialog(key, value);
            }
          }),
          UI.Button({
            className: 'btn-small btn-error whitespace-nowrap',
            text: '删除',
            onClick: async (e) => {
              e.stopPropagation();
              await eventHandler.handleDelete(key);
            }
          })
        ])
      ]);

      content.appendChild(UI.Card({}, [headerRow]));
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
    pagination.appendChild(UI.Button({
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
    pagination.appendChild(UI.Button({
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
   * 打开编辑对话框（使用 CodeMirror 编辑 JSON）
   */
  function openEditDialog(key, value) {
    const editorContainer = create('div', {
      style: { border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }
    });

    const dialog = UI.Dialog({
      title: `编辑: ${key}`,
      content: editorContainer,
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
            if (!editorInstance) return;
            try {
              const newValue = JSON.parse(editorInstance.getValue());
              await eventHandler.storageManager.updateItem(key, newValue);
              Toast.success('已更新');
              editorInstance.destroy();
              dialog.close();
              eventHandler.handleRefresh();
            } catch (e) {
              Toast.error(`JSON 格式错误: ${e.message}`);
            }
          }
        }
      ]
    });

    let editorInstance = null;
    dialog.open();
    // CodeMirror 需要 DOM 渲染后才能挂载
    setTimeout(() => {
      editorInstance = UI.CodeEditor(editorContainer, {
        value: JSON.stringify(value, null, 2),
        mode: 'application/json',
        height: 300
      });
    }, 50);
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
Pages.storage.updateData = updateData;
  Pages.storage.updateSearchResults = updateSearchResults;

  // 初始加载
  eventHandler.handleRefresh();
};
