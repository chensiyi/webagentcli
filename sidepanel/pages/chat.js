// 聊天页面（简化版）
window.Pages = window.Pages || {};

window.Pages.chat = function(container) {
  const { create, clear } = window.DOM;
  
  clear(container);
  container.appendChild(create('div', { className: 'page' }, [
    create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '对话' })
    ]),
    create('div', { className: 'page-content empty-state' }, [
      create('div', { className: 'empty-state-icon', text: '💬' }),
      create('div', { className: 'empty-state-title', text: '聊天功能开发中' })
    ])
  ]));
};
