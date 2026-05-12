// 确认对话框组件
window.ConfirmDialog = {
  show(options = {}) {
    const {
      title = '确认',
      message = '确定要执行此操作吗？',
      confirmText = '确定',
      cancelText = '取消',
      onConfirm = () => {},
      onCancel = () => {}
    } = options;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.style.cssText = `
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.2s ease;
    `;

    // 标题
    const titleEl = document.createElement('div');
    titleEl.className = 'confirm-dialog-title';
    titleEl.textContent = title;
    titleEl.style.cssText = `
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--color-text);
    `;

    // 消息
    const messageEl = document.createElement('div');
    messageEl.className = 'confirm-dialog-message';
    messageEl.textContent = message;
    messageEl.style.cssText = `
      font-size: 14px;
      color: var(--color-text-secondary);
      margin-bottom: 24px;
      line-height: 1.5;
    `;

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'confirm-dialog-buttons';
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = cancelText;
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    `;

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.textContent = confirmText;
    confirmBtn.style.cssText = `
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      background: var(--color-danger);
      color: white;
      border: none;
    `;

    // 关闭对话框
    const close = () => {
      overlay.remove();
      document.body.style.overflow = '';
    };

    // 事件处理
    cancelBtn.onclick = () => {
      close();
      onCancel();
    };

    confirmBtn.onclick = () => {
      close();
      onConfirm();
    };

    // 点击遮罩层关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        close();
        onCancel();
      }
    };

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        close();
        onCancel();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 组装
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 防止背景滚动
    document.body.style.overflow = 'hidden';

    // 聚焦确认按钮
    setTimeout(() => confirmBtn.focus(), 100);

    return { close };
  }
};
