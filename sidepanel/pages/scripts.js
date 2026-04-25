// 脚本管理页面
window.Pages = window.Pages || {};

window.Pages.scripts = function(container) {
  const { create, clear } = window.DOM;
  let scripts = [];
  let showForm = false;
  let editingScriptId = null;
  let editCode = '';
  
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    // 头部
    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '用户脚本' }),
      create('button', {
        className: 'btn btn-primary',
        text: showForm ? '取消' : '安装脚本',
        onClick: () => { showForm = !showForm; render(); }
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
        content.appendChild(create('div', { className: 'card' }, [
          create('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } }, [
            create('div', {}, [
              create('h3', { style: { fontSize: '16px', marginBottom: '4px' }, text: script.name }),
              create('span', { className: `badge badge-${script.enabled ? 'success' : 'error'}`, text: script.enabled ? '已启用' : '已禁用' })
            ]),
            create('div', { style: { display: 'flex', gap: '8px' } }, [
              create('button', { 
                className: 'btn btn-small btn-text', 
                text: '编辑',
                onClick: () => startEdit(script.id)
              }),
              create('button', { 
                className: 'btn btn-small btn-warning', 
                text: script.enabled ? '禁用' : '启用',
                onClick: () => toggleScript(script.id)
              }),
              create('button', { 
                className: 'btn btn-small btn-error', 
                text: '删除',
                onClick: () => deleteScript(script.id)
              })
            ])
          ])
        ]));
      });
    }
    
    page.appendChild(content);
    container.appendChild(page);
  }
  
  function createInstallForm() {
    let code = '';
    
    const form = create('div', { style: { padding: '20px' } }, [
      create('textarea', {
        className: 'textarea textarea-monospace',
        attrs: { placeholder: '粘贴 Tampermonkey 用户脚本...' },
        style: { minHeight: '300px', marginBottom: '16px' },
        onInput: (e) => { code = e.target.value; }
      }),
      create('button', {
        className: 'btn btn-success',
        text: '安装',
        style: { width: '100%' },
        onClick: async () => {
          if (!code.trim()) return;
          try {
            await window.userScriptManager.installFromCode(code);
            showForm = false;
            loadScripts();
          } catch (err) {
            alert('安装失败: ' + err.message);
          }
        }
      })
    ]);
    
    return form;
  }
  
  async function loadScripts() {
    if (!window.userScriptManager) return;
    scripts = window.userScriptManager.getScripts();
    render();
  }
  
  async function toggleScript(id) {
    const script = scripts.find(s => s.id === id);
    if (script) {
      await window.userScriptManager.toggleScript(id, !script.enabled);
      loadScripts();
    }
  }
  
  async function deleteScript(id) {
    if (confirm('确定删除？')) {
      await window.userScriptManager.deleteScript(id);
      loadScripts();
    }
  }
  
  async function startEdit(id) {
    const script = scripts.find(s => s.id === id);
    if (!script) return;
    
    editingScriptId = id;
    const code = await window.userScriptManager.getScriptCode(id);
    editCode = code || '';
    render();
  }
  
  function createEditForm() {
    const form = create('div', { style: { padding: '20px' } }, [
      create('h3', { style: { marginBottom: '16px' }, text: '编辑脚本' }),
      create('textarea', {
        className: 'textarea textarea-monospace',
        style: { minHeight: '300px', marginBottom: '16px' },
        onInput: (e) => { editCode = e.target.value; }
      }, [editCode]),
      create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', {
          className: 'btn btn-success',
          text: '保存',
          style: { flex: 1 },
          onClick: async () => {
            if (!editCode.trim()) return;
            try {
              await window.userScriptManager.updateScriptCode(editingScriptId, editCode);
              editingScriptId = null;
              editCode = '';
              loadScripts();
            } catch (err) {
              alert('保存失败: ' + err.message);
            }
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
  
  // 初始化
  loadScripts();
};
