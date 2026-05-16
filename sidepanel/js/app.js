// 主应用
(function() {
  let currentPage = 'chat';
  
  const pages = [
    { id: 'chat', icon: '💬', label: '对话' },
    { id: 'history', icon: '📋', label: '历史' },
    { id: 'storage', icon: '💾', label: '存储' },
    { id: 'scripts', icon: '📜', label: '脚本' },
    { id: 'settings', icon: '⚙️', label: '设置' }
  ];
  
  function init() {
    console.log('[App] Initializing...');
    console.log('[App] window.DOM:', typeof window.DOM);
    console.log('[App] window.Pages:', window.Pages);
    console.log('[App] Available pages:', Object.keys(window.Pages || {}));
    
    if (!window.DOM || !window.Pages) {
      console.error('[App] DOM or Pages not loaded');
      document.getElementById('root').textContent = 'Error: Dependencies not loaded';
      return;
    }
    
    const { create } = window.DOM;
    const root = document.getElementById('root');
    
    // 初始化 ServiceManager
    if (window.ServiceManager) {
      window.serviceManager = new window.ServiceManager();
      console.log('[App] ServiceManager initialized');
    }
    
    // 初始化会话管理器
    if (window.SessionManager && window.EventBus) {
      window.sessionManagerInstance = new window.SessionManager(window.EventBus);
      
      // 初始化 SessionController
      if (window.SessionController && window.SessionController.init) {
        window.SessionController.init();
      }
    }
    
    // 初始化聊天服务（从设置中读取配置）
    if (window.ChatController && window.serviceManager && window.SettingsController) {
      // 等待设置加载完成后初始化服务
      window.SettingsController.loadSettings().then((settings) => {
        if (settings && settings.apiStandard) {
          const service = window.serviceManager.getService(settings.apiStandard);
          if (service) {
            // 配置服务
            service.configure({
              endpoint: settings.apiEndpoint,
              apiKey: settings.apiKey,
              defaultModel: settings.model || 'default'
            });
            
            window.ChatController.setService(service);
            // 将服务挂载到全局，供 UI 层调用标准交互方法
            window.ChatService = service;
            console.log('[App] Chat service initialized:', settings.apiStandard);
          } else {
            console.warn('[App] Failed to create chat service for:', settings.apiStandard);
          }
        } else {
          console.warn('[App] No API standard configured, please set it in Settings');
        }
      }).catch(err => {
        console.error('[App] Failed to initialize chat service:', err);
      });
    }
    
    function render(root) {
      const contentAreaEl = create('div', { className: 'content-area', id: 'content-area' });
      
      const app = create('div', { className: 'app-container' }, [
        create('div', { className: 'main-content' }, [
          contentAreaEl,
          createSidebar()
        ])
      ]);
      
      root.innerHTML = '';
      root.appendChild(app);
      
      // 渲染当前页面
      if (window.Pages && window.Pages[currentPage]) {
        console.log('[App] Rendering page:', currentPage, 'to container:', contentAreaEl);
        window.Pages[currentPage](contentAreaEl);
      } else {
        console.warn('[App] Page not found:', currentPage, 'Available:', Object.keys(window.Pages || {}));
      }
    }
    
    function createSidebar() {
      const sidebar = create('div', { className: 'sidebar' });
      
      pages.forEach(page => {
        const btn = create('button', {
          className: `sidebar-btn ${currentPage === page.id ? 'active' : ''}`,
          'data-tooltip': page.label,
          onClick: () => switchPage(page.id)
        }, [
          create('span', { className: 'sidebar-btn-icon', text: page.icon })
        ]);
        
        // 添加鼠标事件监听器来动态创建tooltip
        let tooltipElement = null;
        
        btn.addEventListener('mouseenter', (e) => {
          // 移除已存在的tooltip
          if (tooltipElement) {
            tooltipElement.remove();
          }
          
          // 创建tooltip元素
          tooltipElement = document.createElement('div');
          tooltipElement.className = 'sidebar-tooltip';
          tooltipElement.textContent = page.label;
          tooltipElement.style.cssText = `
            position: fixed;
            right: 45px;
            top: ${e.target.getBoundingClientRect().top + e.target.getBoundingClientRect().height / 2}px;
            transform: translateY(-50%);
            padding: 6px 10px;
            background: var(--color-surface);
            color: var(--color-text);
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 1px solid var(--color-border);
            z-index: 999999;
            pointer-events: none;
            animation: tooltipFadeIn 0.15s ease;
          `;
          
          document.body.appendChild(tooltipElement);
        });
        
        btn.addEventListener('mouseleave', () => {
          if (tooltipElement) {
            tooltipElement.remove();
            tooltipElement = null;
          }
        });
        
        sidebar.appendChild(btn);
      });
      
      return sidebar;
    }
    
    function switchPage(pageId) {
      console.log('[App] Switching to page:', pageId);
      console.log('[App] Page function:', window.Pages[pageId]);
      
      // 清除所有tooltip
      const tooltips = document.querySelectorAll('.sidebar-tooltip');
      tooltips.forEach(tooltip => tooltip.remove());
      
      currentPage = pageId;
      render(document.getElementById('root'));
    }
    
    // 暴露 navigateTo 方法
    window.App = {
      navigateTo: switchPage
    };
    
    render(root);
  }
  
  window.addEventListener('load', init);
})();
