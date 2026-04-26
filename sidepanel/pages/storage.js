// 存储管理页面
// 用于查看、编辑和删除插件缓存

window.Pages.storage = function(container) {
  'use strict';

  console.log('[Storage] Page initialized, container:', container);

  const { create, clear } = window.DOM;

  // 状态管理
  let storageItems = [];
  let filteredItems = [];
  let searchKeyword = '';
  let searchTimer = null;
  let currentPage = 1;
  const pageSize = 20;

  // 渲染页面
  function render() {
    clear(container);

    // 页面容器
    const page = create('div', { className: 'page' });

    // 页面头部
    const header = create('div', {
      className: 'page-header',
      children: [
        create('h1', {
          className: 'page-title',
          text: '存储管理'
        }),
        create('button', {
          className: 'btn btn-primary btn-small',
          text: '刷新'
        })
      ]
    });
    
    // 添加刷新按钮事件
    header.querySelector('button').addEventListener('click', loadStorageItems);

    // 页面内容
    const content = create('div', {
      className: 'page-content'
    });

    // 搜索框
    const searchBox = create('input', {
      className: 'input mb-12',
      attrs: { type: 'text', placeholder: '搜索存储项...' },
      onInput: (e) => {
        if (searchTimer) {
          clearTimeout(searchTimer);
        }
        
        searchTimer = setTimeout(() => {
          searchKeyword = e.target.value.trim().toLowerCase();
          currentPage = 1; // 重置到第一页
          updateSearchResults();
        }, 500);
      }
    });
    content.appendChild(searchBox);

    // 统计信息和操作按钮
    const statsCard = create('div', {
      className: 'card',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    });

    const statsText = create('div', {
      className: 'text-sm text-secondary',
      style: { lineHeight: '32px' },
      text: `共 ${filteredItems.length} 项` + (searchKeyword ? ` (搜索: "${searchKeyword}")` : '')
    });

    const clearAllBtn = create('button', {
      className: 'btn btn-error btn-small',
      text: '清除所有'
    });
    clearAllBtn.addEventListener('click', clearAllStorage);

    statsCard.appendChild(statsText);
    statsCard.appendChild(clearAllBtn);
    content.appendChild(statsCard);

    // 分页渲染
    renderStorageList(content);
    
    // 分页控件
    renderPagination(content);

    page.appendChild(header);
    page.appendChild(content);
    container.appendChild(page);
  }

  // 更新搜索结果
  function updateSearchResults() {
    if (searchKeyword) {
      filteredItems = storageItems.filter(([key, value]) => {
        const keyStr = key.toLowerCase();
        const valueStr = JSON.stringify(value).toLowerCase();
        return keyStr.includes(searchKeyword) || valueStr.includes(searchKeyword);
      });
    } else {
      filteredItems = [...storageItems];
    }
    
    currentPage = 1;
    render();
  }

  // 加载存储数据
  async function loadStorageItems() {
    try {
      const result = await chrome.storage.local.get(null);
      storageItems = Object.entries(result).sort((a, b) => {
        const sizeA = JSON.stringify(a[1]).length;
        const sizeB = JSON.stringify(b[1]).length;
        return sizeB - sizeA;
      });
      
      // 初始化 filteredItems（全量展示）
      updateSearchResults();
    } catch (error) {
      console.error('Failed to load storage items:', error);
      window.Toast.error('加载失败: ' + error.message);
    }
  }

  // 清除所有存储
  async function clearAllStorage() {
    const confirmed = await window.Toast.confirm({
      title: '清除所有数据',
      message: '确定要清除所有存储数据吗？此操作不可恢复！'
    });
    
    if (!confirmed) return;

    try {
      await chrome.storage.local.clear();
      await loadStorageItems();
      window.Toast.success('已清除所有存储数据');
    } catch (error) {
      console.error('Failed to clear storage:', error);
      window.Toast.error('清除失败: ' + error.message);
    }
  }

  // 删除单个存储项
  async function deleteStorageItem(key) {
    const confirmed = await window.Toast.confirm({
      title: '删除存储项',
      message: `确定要删除 "${key}" 吗？`
    });
    
    if (!confirmed) return;

    try {
      await chrome.storage.local.remove(key);
      await loadStorageItems();
    } catch (error) {
      console.error('Failed to delete item:', error);
      window.Toast.error('删除失败: ' + error.message);
    }
  }

  // 打开编辑对话框
  function openEditDialog(key, value) {
    console.log('[Storage] Opening edit dialog for:', key);
    
    const dialog = create('div', {
      className: 'dialog-overlay'
    });

    const dialogContent = create('div', {
      className: 'dialog-content'
    });

    // 标题
    const title = create('h3', {
      className: 'text-lg font-semibold',
      text: `编辑: ${key}`
    });

    // 编辑器
    const valueEditor = create('textarea', {
      className: 'textarea textarea-monospace',
      style: {
        minHeight: '50vh',
        height: '50vh',
        resize: 'vertical'
      },
      text: JSON.stringify(value, null, 2)
    });

    // 错误提示
    const errorText = create('div', {
      className: 'text-error text-sm',
      style: { minHeight: '20px' }
    });

    // 按钮组
    const buttonGroup = create('div', {
      className: 'btn-group'
    });

    const cancelBtn = create('button', {
      className: 'btn btn-secondary',
      text: '取消'
    });
    cancelBtn.addEventListener('click', () => container.ownerDocument.body.removeChild(dialog));

    const saveBtn = create('button', {
      className: 'btn btn-primary',
      text: '保存'
    });
    saveBtn.addEventListener('click', async () => {
      try {
        const newValue = JSON.parse(valueEditor.value);
        await chrome.storage.local.set({ [key]: newValue });
        container.ownerDocument.body.removeChild(dialog);
        await loadStorageItems();
      } catch (error) {
        errorText.textContent = 'JSON 格式错误: ' + error.message;
      }
    });

    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(saveBtn);

    dialogContent.appendChild(title);
    dialogContent.appendChild(valueEditor);
    dialogContent.appendChild(errorText);
    dialogContent.appendChild(buttonGroup);
    dialog.appendChild(dialogContent);

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        container.ownerDocument.body.removeChild(dialog);
      }
    });

    container.ownerDocument.body.appendChild(dialog);
    valueEditor.focus();
  }

  // 渲染存储列表
  function renderStorageList(parentContainer) {
    const totalPages = Math.ceil(filteredItems.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = filteredItems.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
      const emptyState = create('div', {
        className: 'empty-state p-16'
      });
      emptyState.textContent = searchKeyword ? '未找到匹配的存储项' : '暂无存储数据';
      parentContainer.appendChild(emptyState);
      return;
    }

    pageItems.forEach(([key, value]) => {
      const itemCard = createStorageItem(key, value);
      parentContainer.appendChild(itemCard);
    });
  }

  // 创建存储项卡片
  function createStorageItem(key, value) {
    const card = create('div', {
      className: 'card'
    });

    // 单行布局：Key | Size | 按钮
    const header = create('div', {
      style: { 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        gap: '12px'
      }
    });

    // 左侧：Key 和 Size
    const leftSection = create('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
        minWidth: 0
      }
    });

    const keyText = create('div', {
      className: 'font-medium text-base',
      style: { 
        wordBreak: 'break-all',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      },
      text: key
    });

    const sizeText = create('div', {
      className: 'text-xs text-secondary',
      style: { 
        whiteSpace: 'nowrap',
        flexShrink: 0
      },
      text: formatSize(value)
    });

    leftSection.appendChild(keyText);
    leftSection.appendChild(sizeText);

    // 右侧：按钮组
    const buttonGroup = create('div', {
      className: 'flex gap-8',
      style: { flexShrink: 0 }
    });

    // 编辑按钮
    const editBtn = create('button', {
      className: 'btn btn-secondary btn-small',
      text: '编辑'
    });
    editBtn.addEventListener('click', () => {
      console.log('[Storage] Edit button clicked for:', key);
      openEditDialog(key, value);
    });

    // 删除按钮
    const deleteBtn = create('button', {
      className: 'btn btn-error btn-small',
      text: '删除'
    });
    deleteBtn.addEventListener('click', () => {
      console.log('[Storage] Delete button clicked for:', key);
      deleteStorageItem(key);
    });

    buttonGroup.appendChild(editBtn);
    buttonGroup.appendChild(deleteBtn);

    header.appendChild(leftSection);
    header.appendChild(buttonGroup);
    card.appendChild(header);

    // 值预览
    const valuePreview = create('pre', {
      className: 'text-xs overflow-auto bg-surface rounded-sm',
      style: { 
        maxHeight: '100px',
        maxWidth: '100%',
        padding: '8px',
        margin: 0,
        overflowX: 'auto'
      },
      text: truncateValue(value)
    });
    card.appendChild(valuePreview);

    return card;
  }

  // 格式化大小
  function formatSize(value) {
    const size = JSON.stringify(value).length;
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else {
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }
  }

  // 截断值显示
  function truncateValue(value) {
    const str = JSON.stringify(value, null, 2);
    if (str.length > 500) {
      return str.substring(0, 500) + '\n...';
    }
    return str;
  }

  // 渲染分页控件
  function renderPagination(parentContainer) {
    const totalPages = Math.ceil(filteredItems.length / pageSize);
    if (totalPages <= 1) return;

    const pagination = create('div', {
      className: 'pagination'
    });

    // 上一页按钮
    const prevBtn = create('button', {
      className: 'btn btn-secondary btn-small',
      text: '上一页',
      disabled: currentPage === 1
    });
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        render();
      }
    });

    // 页码信息
    const pageInfo = create('div', {
      className: 'pagination-info',
      text: `${currentPage} / ${totalPages}`
    });

    // 下一页按钮
    const nextBtn = create('button', {
      className: 'btn btn-secondary btn-small',
      text: '下一页',
      disabled: currentPage === totalPages
    });
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        render();
      }
    });

    pagination.appendChild(prevBtn);
    pagination.appendChild(pageInfo);
    pagination.appendChild(nextBtn);
    parentContainer.appendChild(pagination);
  }

  // 初始化
  loadStorageItems();
};
