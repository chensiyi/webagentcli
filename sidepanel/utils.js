// ==================== DOM Utils ====================
// 原生 JavaScript DOM 操作工具函数

/**
 * 创建 DOM 元素
 * @param {string} tag - HTML 标签名
 * @param {Object} options - 配置选项
 * @param {Object} options.attrs - 属性对象
 * @param {Object} options.style - 样式对象
 * @param {string|Array} options.children - 子元素（字符串或 DOM 数组）
 * @param {Function} options.onClick - 点击事件
 * @returns {HTMLElement}
 */
function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  
  // 设置属性
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  
  // 设置样式
  if (options.style) {
    Object.assign(el.style, options.style);
  }
  
  // 添加子元素
  if (options.children) {
    const children = Array.isArray(options.children) ? options.children : [options.children];
    children.forEach(child => {
      if (typeof child === 'string') {
        el.textContent = child;
      } else if (child instanceof HTMLElement) {
        el.appendChild(child);
      }
    });
  }
  
  // 绑定事件
  if (options.onClick) {
    el.addEventListener('click', options.onClick);
  }
  
  return el;
}

/**
 * 清空元素内容
 * @param {HTMLElement} el 
 */
function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * 显示/隐藏元素
 * @param {HTMLElement} el 
 * @param {boolean} show 
 */
function toggleVisibility(el, show) {
  el.style.display = show ? '' : 'none';
}

/**
 * 创建带样式的容器
 * @param {Object} style 
 * @param {Array} children 
 * @returns {HTMLElement}
 */
function createContainer(style, children = []) {
  return createElement('div', { style, children });
}

/**
 * 创建按钮
 * @param {string} text - 按钮文本
 * @param {Object} style - 样式
 * @param {Function} onClick - 点击回调
 * @returns {HTMLButtonElement}
 */
function createButton(text, style, onClick) {
  return createElement('button', {
    attrs: { type: 'button' },
    style,
    children: [text],
    onClick
  });
}

/**
 * 创建输入框
 * @param {Object} options
 * @returns {HTMLInputElement}
 */
function createInput(options = {}) {
  const { type = 'text', placeholder = '', value = '', onChange, style } = options;
  const input = createElement('input', {
    attrs: { type, placeholder, value },
    style
  });
  
  if (onChange) {
    input.addEventListener('input', onChange);
  }
  
  return input;
}

/**
 * 创建文本域
 * @param {Object} options
 * @returns {HTMLTextAreaElement}
 */
function createTextarea(options = {}) {
  const { placeholder = '', value = '', rows = 4, onChange, style } = options;
  const textarea = createElement('textarea', {
    attrs: { placeholder, rows },
    style
  });
  textarea.value = value;
  
  if (onChange) {
    textarea.addEventListener('input', onChange);
  }
  
  return textarea;
}

// 导出到全局
window.DOMUtils = {
  createElement,
  clearElement,
  toggleVisibility,
  createContainer,
  createButton,
  createInput,
  createTextarea
};
