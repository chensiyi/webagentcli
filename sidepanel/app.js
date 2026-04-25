// 主应用
(function() {
  let currentPage = 'chat';
  
  const pages = [
    { id: 'chat', icon: '💬', label: '对话' },
    { id: 'scripts', icon: '📜', label: '脚本' },
    { id: 'history', icon: '📋', label: '历史' },
    { id: 'settings', icon: '⚙️', label: '设置' }
  ];
  
  function init() {
    console.log('[App] Initializing...');
    console.log('[App] window.DOM:', typeof window.DOM);
    console.log('[App] window.Pages:', typeof window.Pages);
    
    if (!window.DOM || !window.Pages) {
      console.error('[App] DOM or Pages not loaded');
      document.getElementById('root').textContent = 'Error: Dependencies not loaded';
      return;
    }
    
    const { create } = window.DOM;
    const root = document.getElementById('root');
    
    // 初始化 UserScriptManager
    if (window.UserScriptManager) {
      window.userScriptManager = new window.UserScriptManager();
    }
    
    // 加载主题
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings && result.settings.theme) {
        window.DOM.setTheme(result.settings.theme);
      }
    });
    
    function render(root) {
      const app = create('div', { className: 'app-container' }, [
        create('div', { className: 'main-content' }, [
          create('div', { className: 'content-area', id: 'content-area' }),
          createSidebar()
        ])
      ]);
      
      root.innerHTML = '';
      root.appendChild(app);
      
      // 渲染当前页面
      const contentArea = document.getElementById('content-area');
      if (contentArea && window.Pages && window.Pages[currentPage]) {
        window.Pages[currentPage](contentArea);
      }
    }
    
    function createSidebar() {
      const sidebar = create('div', { className: 'sidebar' });
      
      pages.forEach(page => {
        const btn = create('button', {
          className: `sidebar-btn ${currentPage === page.id ? 'active' : ''}`,
          onClick: () => switchPage(page.id)
        }, [
          create('span', { className: 'sidebar-btn-icon', text: page.icon }),
          create('span', { className: 'sidebar-btn-label', text: page.label })
        ]);
        
        sidebar.appendChild(btn);
      });
      
      return sidebar;
    }
    
    function switchPage(pageId) {
      currentPage = pageId;
      render(document.getElementById('root'));
    }
    
    render(root);
  }
  
  window.addEventListener('load', init);
})();
