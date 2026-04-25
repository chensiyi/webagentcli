// Toast 通知系统
window.Toast = {
  container: null,
  
  // 初始化容器
  init() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  },
  
  // 显示 Toast
  show(options = {}) {
    const {
      message = '',
      type = 'info', // info, success, warning, error
      duration = 3000,
      action = null // { text, onClick }
    } = options;
    
    this.init();
    
    // 创建 Toast 元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 4px solid ${this.getTypeColor(type)};
      border-radius: 8px;
      padding: 12px 16px;
      min-width: 280px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      pointer-events: auto;
      animation: slideInRight 0.3s ease;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    
    // 图标
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = this.getTypeIcon(type);
    icon.style.cssText = `
      font-size: 20px;
      flex-shrink: 0;
    `;
    
    // 消息内容
    const content = document.createElement('div');
    content.className = 'toast-content';
    content.textContent = message;
    content.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: var(--color-text);
      line-height: 1.4;
    `;
    
    // 组装
    toast.appendChild(icon);
    toast.appendChild(content);
    
    // 可选的操作按钮
    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.textContent = action.text;
      actionBtn.style.cssText = `
        background: transparent;
        border: none;
        color: var(--color-primary);
        cursor: pointer;
        font-size: 13px;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
      `;
      actionBtn.onmouseover = () => actionBtn.style.background = 'rgba(0,0,0,0.05)';
      actionBtn.onmouseout = () => actionBtn.style.background = 'transparent';
      actionBtn.onclick = () => {
        action.onClick();
        this.remove(toast);
      };
      toast.appendChild(actionBtn);
    }
    
    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 20px;
      height: 20px;
      line-height: 1;
      flex-shrink: 0;
    `;
    closeBtn.onmouseover = () => closeBtn.style.color = 'var(--color-text)';
    closeBtn.onmouseout = () => closeBtn.style.color = 'var(--color-text-secondary)';
    closeBtn.onclick = () => this.remove(toast);
    toast.appendChild(closeBtn);
    
    this.container.appendChild(toast);
    
    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        this.remove(toast);
      }, duration);
    }
    
    return toast;
  },
  
  // 移除 Toast
  remove(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  },
  
  // 便捷方法
  info(message, duration) {
    return this.show({ message, type: 'info', duration });
  },
  
  success(message, duration) {
    return this.show({ message, type: 'success', duration });
  },
  
  warning(message, duration) {
    return this.show({ message, type: 'warning', duration });
  },
  
  error(message, duration) {
    return this.show({ message, type: 'error', duration });
  },
  
  // 确认对话框（基于 Toast）
  confirm(options = {}) {
    const {
      message = '确定要执行此操作吗？',
      title = '确认',
      onConfirm = () => {},
      onCancel = () => {}
    } = options;
    
    return new Promise((resolve) => {
      const toast = this.show({
        message: `${title}\n${message}`,
        type: 'warning',
        duration: 0, // 不自动关闭
        action: {
          text: '确认',
          onClick: () => {
            resolve(true);
            onConfirm();
          }
        }
      });
      
      // 添加取消按钮
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = `
        background: transparent;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: 13px;
        padding: 4px 8px;
        border-radius: 4px;
        margin-right: 8px;
      `;
      cancelBtn.onmouseover = () => cancelBtn.style.background = 'rgba(0,0,0,0.05)';
      cancelBtn.onmouseout = () => cancelBtn.style.background = 'transparent';
      cancelBtn.onclick = () => {
        resolve(false);
        onCancel();
        this.remove(toast);
      };
      
      // 插入到 action 按钮前面
      const actionBtn = toast.querySelector('.toast-action');
      if (actionBtn) {
        toast.insertBefore(cancelBtn, actionBtn);
      }
    });
  },
  
  // 获取类型颜色
  getTypeColor(type) {
    const colors = {
      info: '#2196F3',
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#f44336'
    };
    return colors[type] || colors.info;
  },
  
  // 获取类型图标
  getTypeIcon(type) {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type] || icons.info;
  }
};
