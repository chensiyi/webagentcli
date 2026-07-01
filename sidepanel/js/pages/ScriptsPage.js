/**
 * Scripts Page UI - 用户脚本管理页面
 */

import { Log } from '../../../kernel/services/Log.js';
import { Pages, DOM } from '../utils/dom.js';
import { UI } from '../components/UI.js';
import { Toast } from '../utils/toast.js';
import { appState } from '../state.js';

Pages.scripts = function(container, kernel) {
  const { create, clear } = DOM;

  if (!kernel) {
    Log.error('ScriptsPage', 'Kernel not available');
    return;
  }
  
  const eventHandler = appState.scriptsEventHandler;
  
  if (!eventHandler) {
    Log.error('ScriptsPage', 'ScriptsEventHandler not available');
    container.innerHTML = '<div class="empty-state">事件处理器未初始化，请刷新页面重试</div>';
    return;
  }
  
  let scripts = [];
  let showForm = false;
  let editingScriptId = null;
  let editCode = '';

  /**
   * 渲染页面
   */
  function render() {
    clear(container);

    const page = create('div', { className: 'page' });

    // 头部
    const header = create('div', { className: 'page-header' }, [
      create('h1', { className: 'page-title', text: '用户脚本' }),
      UI.Button({
        className: 'btn-primary btn-small',
        text: showForm ? '取消' : '安装脚本',
        onClick: () => {
          showForm = !showForm;
          editingScriptId = null;
          editCode = '';
          render();
        }
      })
    ]);
    page.appendChild(header);

    // 内容
    const content = create('div', { className: 'page-content' });

    if (showForm) {
      content.appendChild(createInstallForm());
    } else if (editingScriptId) {
      content.appendChild(createEditForm());
    } else if (scripts.length === 0) {
      content.appendChild(UI.EmptyState({
        icon: '📜',
        title: '暂无脚本',
        desc: '点击右上角"安装脚本"开始添加'
      }));
    } else {
      scripts.forEach(script => {
        content.appendChild(createScriptCard(script));
      });
    }

    page.appendChild(content);
    container.appendChild(page);
  }

  /**
   * 创建脚本卡片
   */
  function createScriptCard(script) {
    const badges = [
      UI.Badge({
        type: script.enabled ? 'success' : 'error',
        text: script.enabled ? '已启用' : '已禁用'
      })
    ];

    if (script.match && script.match.length > 0) {
      badges.push(UI.Badge({
        type: 'info',
        text: `${script.match.length} 匹配规则`
      }));
    }

    const headerRow = create('div', {
      className: 'flex justify-between items-start mb-8'
    }, [
      create('div', { className: 'flex-1 min-w-0' }, [
        create('h3', {
          className: 'text-base font-semibold mb-4',
          text: script.name
        }),
        script.version && create('div', {
          className: 'text-xs text-secondary',
          text: `v${script.version}`
        }),
        script.description && create('div', {
          className: 'text-xs text-secondary',
          text: script.description
        }),
        create('div', { className: 'mt-4 flex gap-4' }, badges)
      ]),
      create('div', { className: 'flex gap-8 flex-shrink-0' }, [
        UI.Button({
          className: 'btn-small btn-text',
          text: '编辑',
          onClick: () => startEdit(script.id)
        }),
        UI.Button({
          className: `btn-small ${script.enabled ? 'btn-warning' : 'btn-success'}`,
          text: script.enabled ? '禁用' : '启用',
          onClick: () => eventHandler.handleToggle(script.id, !script.enabled)
        }),
        UI.Button({
          className: 'btn-small btn-error',
          text: '删除',
          onClick: async () => {
            await eventHandler.handleDelete(script.id);
          }
        })
      ])
    ]);

    return UI.Card({}, [headerRow]);
  }

  /**
   * 创建安装表单（使用 CodeMirror 编辑 JS）
   */
  function createInstallForm() {
    let editorInstance = null;
    const editorContainer = create('div', {
      style: { border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }
    });

    const installBtn = UI.Button({
      className: 'btn-success w-full',
      text: '安装',
      onClick: async () => {
        const code = editorInstance ? editorInstance.getValue() : '';
        if (!code.trim()) {
          Toast?.warning('请输入脚本代码');
          return;
        }
        await eventHandler.handleInstall(code);
        showForm = false;
        render();
      }
    });

    // DOM 渲染后初始化 CodeMirror
    setTimeout(() => {
      editorInstance = UI.CodeEditor(editorContainer, {
        value: '',
        mode: 'javascript',
        height: 300
      });
    }, 50);

    return create('div', { className: 'p-20' }, [
      create('div', {
        className: 'text-sm text-secondary mb-8',
        text: '粘贴 Tampermonkey 用户脚本代码：'
      }),
      editorContainer,
      installBtn
    ]);
  }

  /**
   * 开始编辑脚本
   */
  async function startEdit(id) {
    const script = scripts.find(s => s.id === id);
    if (!script) return;

    editingScriptId = id;
    editCode = script.code || '';
    showForm = false;
    render();
  }

  /**
   * 创建编辑表单（使用 CodeMirror 编辑 JS）
   */
  function createEditForm() {
    const script = scripts.find(s => s.id === editingScriptId);
    if (!script) return create('div');

    let editorInstance = null;
    const editorContainer = create('div', {
      style: { border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }
    });

    const saveBtn = UI.Button({
      className: 'btn-success flex-1',
      text: '保存',
      onClick: async () => {
        const code = editorInstance ? editorInstance.getValue() : '';
        if (!code.trim()) {
          Toast?.warning('脚本代码不能为空');
          return;
        }
        eventHandler.handleEdit(editingScriptId, code);
        editingScriptId = null;
        render();
      }
    });

    const cancelBtn = UI.Button({
      className: 'btn-text flex-1',
      text: '取消',
      onClick: () => {
        editingScriptId = null;
        render();
      }
    });

    // DOM 渲染后初始化 CodeMirror
    setTimeout(() => {
      editorInstance = UI.CodeEditor(editorContainer, {
        value: editCode,
        mode: 'javascript',
        height: 300
      });
    }, 50);

    return create('div', { className: 'p-20' }, [
      create('h3', {
        className: 'mb-16 font-semibold text-lg',
        text: `编辑脚本: ${script.name}`
      }),
      editorContainer,
      create('div', { className: 'flex gap-8' }, [
        saveBtn,
        cancelBtn
      ])
    ]);
  }

  /**
   * 更新脚本列表（由 EventHandler 调用）
   */
  function updateScripts(newScripts) {
    scripts = newScripts;
    render();
  }

  // 暴露方法供 EventHandler 调用
  Pages.scripts.updateScripts = updateScripts;

  // 初始加载
  eventHandler.scriptsManager.loadAll();
};
