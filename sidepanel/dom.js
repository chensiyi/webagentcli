// ==================== 简单 DOM 组件库 ====================

window.DOM = {
  // 创建元素
  create(tag, options = {}, children = []) {
    const el = document.createElement(tag);
    
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    
    Object.entries(options.attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    });
    
    Object.entries(options.style || {}).forEach(([k, v]) => {
      el.style[k] = v;
    });
    
    // 处理 children
    const kids = Array.isArray(children) ? children : [children];
    kids.filter(Boolean).forEach(child => {
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    
    // 如果 options 中也有 children，合并处理
    if (options.children) {
      const optChildren = Array.isArray(options.children) ? options.children : [options.children];
      optChildren.filter(Boolean).forEach(child => {
        el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    }
    
    ['click', 'input', 'change', 'keydown', 'keyup'].forEach(event => {
      const handler = options['on' + event.charAt(0).toUpperCase() + event.slice(1)];
      if (handler) el.addEventListener(event, handler);
    });
    
    return el;
  },
  
  // 清空元素
  clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  },
  
  // 主题切换
  setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || {};
      settings.theme = theme;
      chrome.storage.local.set({ settings });
    });
  },
  
  getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
};
