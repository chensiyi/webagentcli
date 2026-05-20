/**
 * Scripts Page UI - 用户脚本管理页面
 */

window.Pages = window.Pages || {};

window.Pages.scripts = function(container, serviceCenter) {
  const { create, clear } = window.DOM;
  
  if (!serviceCenter) {
    console.error('[ScriptsPage] ServiceCenter not available');
    return;
  }
  
  // ScriptsEventHandler 已在 app.js 中创建，通过 window.scriptsEventHandler 访问
  const eventHandler = window.scriptsEventHandler;
  
  if (!eventHandler) {
    console.error('[ScriptsPage] ScriptsEventHandler not available');
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
      create('button', {
        className: 'btn btn-primary',
        style: { padding: '6px 16px', fontSize: '13px' },
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
      content.appendChild(create('div', { className: 'empty-state' }, [
        create('div', { className: 'empty-state-icon', text: '📜' }),
        create('div', { className: 'empty-state-title', text: '暂无脚本' }),
        create('div', { className: 'empty-state-desc', text: '点击右上角"安装脚本"开始添加' })
      ]));
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
    return create('div', { className: 'card mb-8' }, [
      create('div', {
        style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }
      }, [
        create('div', {}, [
          create('h3', {
            style: { fontSize: '16px', marginBottom: '4px' },
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
          create('div', {
            style: { marginTop: '4px' }
          }, [
            create('span', {
              className: `badge badge-${script.enabled ? 'success' : 'error'}`,
              text: script.enabled ? '已启用' : '已禁用'
            }),
            script.match && script.match.length > 0 && create('span', {
              className: 'badge badge-info ml-4',
              text: `${script.match.length} 匹配规则`
            })
          ])
        ]),
        create('div', { style: { display: 'flex', gap: '8px' } }, [
          create('button', {
            className: 'btn btn-small btn-text',
            text: '编辑',
            onClick: () => startEdit(script.id)
          }),
          create('button', {
            className: `btn btn-small ${script.enabled ? 'btn-warning' : 'btn-success'}`,
            text: script.enabled ? '禁用' : '启用',
            onClick: () => eventHandler.handleToggle(script.id, !script.enabled)
          }),
          create('button', {
            className: 'btn btn-small btn-error',
            text: '删除',
            onClick: async () => {
              await eventHandler.handleDelete(script.id);
            }
          })
        ])
      ])
    ]);
  }

  /**
   * 创建安装表单
   */
  function createInstallForm() {
    let code = '';

    const form = create('div', { style: { padding: '20px' } }, [
      create('div', {
        className: 'text-sm text-secondary mb-8',
        text: '粘贴 Tampermonkey 用户脚本代码：'
      }),
      create('textarea', {
        className: 'textarea textarea-monospace',
        attrs: { placeholder: '// ==UserScript==\n// @name         My Script\n// ...' },
        style: { minHeight: '300px', marginBottom: '16px' },
        onInput: (e) => { code = e.target.value; }
      }),
      create('button', {
        className: 'btn btn-success',
        text: '安装',
        style: { width: '100%' },
        onClick: async () => {
          if (!code.trim()) {
            window.Toast?.warning('请输入脚本代码');
            return;
          }
          await eventHandler.handleInstall(code);
          showForm = false;
        }
      })
    ]);

    return form;
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
   * 创建编辑表单
   */
  function createEditForm() {
    const script = scripts.find(s => s.id === editingScriptId);
    if (!script) return create('div');

    const form = create('div', { style: { padding: '20px' } }, [
      create('h3', {
        style: { marginBottom: '16px' },
        text: `编辑脚本: ${script.name}`
      }),
      create('textarea', {
        className: 'textarea textarea-monospace',
        style: { minHeight: '300px', marginBottom: '16px' },
        text: editCode,
        onInput: (e) => { editCode = e.target.value; }
      }),
      create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', {
          className: 'btn btn-success',
          text: '保存',
          style: { flex: 1 },
          onClick: async () => {
            if (!editCode.trim()) {
              window.Toast?.warning('脚本代码不能为空');
              return;
            }
            eventHandler.handleEdit(editingScriptId, editCode);
            editingScriptId = null;
            editCode = '';
          }
        }),
        create('button', {
          className: 'btn btn-text',
          text: '取消',
          style: { flex: 1 },
          onClick: () => {
            editingScriptId = null;
            editCode = '';
            render();
          }
        })
      ])
    ]);

    return form;
  }

  /**
   * 更新脚本列表（由 EventHandler 调用）
   */
  function updateScripts(newScripts) {
    scripts = newScripts;
    render();
  }

  // 暴露方法供 EventHandler 调用
  window.Pages.scripts.updateScripts = updateScripts;

  // 初始加载
  eventHandler.scriptsController.loadAll();
};
