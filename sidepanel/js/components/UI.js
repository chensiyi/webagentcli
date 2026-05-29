/**
 * UI Components - 基础 UI 组件库
 * 提供可复用的通用 UI 元素封装
 */

window.UI = {
  /**
   * 创建标准按钮
   */
  Button(options = {}) {
    const { 
      text = '', 
      className = 'btn-primary', 
      onClick, 
      id, 
      style = {}, 
      disabled = false,
      title = ''
    } = options;
    
    return window.DOM.create('button', {
      className: `btn ${className}`,
      id,
      text,
      onClick,
      style,
      attrs: { 
        disabled: disabled ? 'disabled' : null,
        title: title || null
      }
    });
  },

  /**
   * 创建输入框/文本框
   */
  Input(options = {}) {
    const { 
      type = 'text', 
      placeholder = '', 
      value = '', 
      className = '', 
      onInput,
      onChange,
      onClick,
      onFocus,
      onBlur,
      onKeyDown,
      id
    } = options;
    
    return window.DOM.create('input', {
      className: `input ${className}`,
      id,
      attrs: { type, placeholder },
      value,
      onInput,
      onChange,
      onClick,
      onFocus,
      onBlur,
      onKeyDown
    });
  },

  /**
   * 创建卡片容器
   */
  Card(options = {}, children = []) {
    return window.DOM.create('div', {
      className: `card ${options.className || ''}`,
      id: options.id,
      style: options.style
    }, children);
  },

  /**
   * 创建对话框/弹窗组件
   */
  Dialog(options = {}) {
    const { 
      title = '', 
      content = null, 
      actions = [], 
      onClose,
      maxWidth = '500px'
    } = options;
    
    const { create } = window.DOM;
    
    const overlay = create('div', { className: 'dialog-overlay' });
    const dialogContent = create('div', { 
      className: 'dialog-content flex flex-col',
      style: { maxWidth, width: '90%', maxHeight: '80vh' }
    });

    // 头部
    if (title) {
      dialogContent.appendChild(create('h3', {
        className: 'text-lg font-semibold mb-12',
        text: title
      }));
    }

    // 主体
    if (content) {
      const body = create('div', { className: 'dialog-body flex-1 overflow-auto mb-16' });
      body.appendChild(typeof content === 'string' ? create('div', { text: content }) : content);
      dialogContent.appendChild(body);
    }

    // 按钮组
    if (actions && actions.length > 0) {
      const footer = create('div', { className: 'flex gap-8 justify-end mt-12' });
      actions.forEach(action => {
        footer.appendChild(this.Button({
          text: action.text,
          className: action.className || 'btn-secondary',
          onClick: () => {
            if (action.onClick) action.onClick();
            if (action.autoClose !== false) overlay.remove();
          }
        }));
      });
      dialogContent.appendChild(footer);
    }

    overlay.appendChild(dialogContent);
    
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        if (onClose) onClose();
      }
    });

    return {
      element: overlay,
      open: () => document.body.appendChild(overlay),
      close: () => overlay.remove()
    };
  },

  /**
   * 创建空状态提示
   */
  EmptyState(options = {}) {
    const { icon = 'ℹ️', title = '暂无数据', desc = '' } = options;
    const { create } = window.DOM;
    
    return create('div', { className: 'empty-state' }, [
      create('div', { className: 'empty-state-icon', text: icon }),
      create('div', { className: 'empty-state-title', text: title }),
      create('div', { className: 'empty-state-desc', text: desc })
    ]);
  },

  /**
   * 创建徽章 (Badge)
   */
  Badge(options = {}) {
    const { text = '', type = 'info', className = '' } = options;
    return window.DOM.create('span', {
      className: `badge badge-${type} ${className}`,
      text
    });
  },

  /**
   * 创建多行文本框 (Textarea)
   */
  Textarea(options = {}) {
    const { 
      placeholder = '', 
      value = '', 
      className = '', 
      onInput, 
      id,
      rows = 3,
      style = {}
    } = options;
    
    return window.DOM.create('textarea', {
      className: `textarea ${className}`,
      id,
      attrs: { placeholder, rows },
      text: value,
      style,
      onInput
    });
  },

  /**
   * 创建复选框 (Checkbox)
   */
  Checkbox(options = {}) {
    const { 
      label = '', 
      checked = false, 
      onChange, 
      id,
      className = ''
    } = options;
    
    const { create } = window.DOM;
    const input = create('input', {
      className: `setting-checkbox ${className}`,
      id,
      attrs: { type: 'checkbox' },
      onChange: (e) => onChange && onChange(e.target.checked)
    });
    input.checked = checked;

    return create('label', { className: 'setting-label-inline' }, [
      input,
      create('span', { text: label })
    ]);
  },

  /**
   * 创建选择器 (Select)
   */
  Select(options = {}) {
    const { 
      options: items = [], 
      value = '', 
      onChange, 
      id,
      className = ''
    } = options;
    
    const { create } = window.DOM;
    const select = create('select', {
      className: `input select ${className}`,
      id,
      onChange: (e) => onChange && onChange(e.target.value)
    }, items.map(opt => create('option', {
      attrs: { value: opt.value, selected: opt.value === value ? 'selected' : null },
      text: opt.label
    })));

    return select;
  },

  /**
   * 创建代码编辑器 (基于 CodeMirror 5)
   * @param {HTMLElement} container - 挂载容器
   * @param {Object} options
   * @param {string} options.value - 初始代码
   * @param {'javascript'|'application/json'} options.mode - 语言模式
   * @param {boolean} [options.readOnly=false] - 只读模式
   * @param {Function} [options.onChange] - 内容变更回调 (value) => void
   * @param {number} [options.height] - 编辑器高度（px），默认自适应
   * @returns {Object} { editor: CodeMirror, setValue, getValue, destroy }
   */
  CodeEditor(container, options = {}) {
    const { 
      value = '', 
      mode = 'javascript', 
      readOnly = false, 
      onChange,
      height,
      viewportMargin = 500
    } = options;

    // CodeMirror 在 UI.js 加载后才会存在，这里延迟引用
    if (typeof CodeMirror === 'undefined') {
      console.error('[UI.CodeEditor] CodeMirror not loaded');
      container.textContent = 'Error: CodeMirror not loaded';
      return null;
    }

    const cm = CodeMirror(container, {
      value,
      mode: mode === 'application/json' ? { name: 'javascript', json: true } : 'javascript',
      theme: 'default',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      matchBrackets: true,
      styleActiveLine: true,
      readOnly: readOnly ? 'nocursor' : false,
      viewportMargin  // 避免大文件一次性渲染全部行导致卡顿
    });

    if (height) {
      cm.setSize(null, height);
    }

    if (onChange) {
      cm.on('change', () => {
        onChange(cm.getDoc().getValue());
      });
    }

    return {
      editor: cm,
      getValue: () => cm.getDoc().getValue(),
      setValue: (val) => cm.getDoc().setValue(val),
      destroy: () => {
        cm.toTextArea();
        container.innerHTML = '';
      }
    };
  },

  /**
   * 创建表单组 (FormGroup)
   */
  FormGroup(options = {}, children = []) {
    const { label = '', desc = '', className = '' } = options;
    const { create } = window.DOM;
    
    const group = create('div', { className: `setting-group ${className}` });
    
    if (label) {
      group.appendChild(create('label', { className: 'setting-label', text: label }));
    }
    
    const content = create('div', { className: 'setting-content' }, children);
    group.appendChild(content);
    
    if (desc) {
      group.appendChild(create('div', { className: 'setting-hint', text: desc }));
    }
    
    return group;
  }
};
