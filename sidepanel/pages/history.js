// 历史页面（简化版）
window.Pages = window.Pages || {};

window.Pages.history = function(container) {
  const { create, clear } = window.DOM;
  
  clear(container);
  container.appendChild(create('div', { className: 'page' }, [
    create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '历史' })
    ]),
    create('div', { className: 'page-content empty-state' }, [
      create('div', { className: 'empty-state-icon', text: '📋' }),
      create('div', { className: 'empty-state-title', text: '历史功能开发中' })
    ])
  ]));
};
