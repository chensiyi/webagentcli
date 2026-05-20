// 主应用
(function() {
  let currentPage = 'chat';
  let serviceCenter = null; // ServiceCenter 实例（在 init 中创建）
  
  const pages = [
    { id: 'chat', icon: '💬', label: '对话' },
    { id: 'history', icon: '📋', label: '历史' },
    { id: 'storage', icon: '💾', label: '存储' },
    { id: 'scripts', icon: '📜', label: '脚本' },
    { id: 'settings', icon: '⚙️', label: '设置' }
  ];
  
  async function init() {
    console.log('[App] Initializing...');
    
    if (!window.DOM || !window.Pages) {
      console.error('[App] DOM or Pages not loaded');
      document.getElementById('root').textContent = 'Error: Dependencies not loaded';
      return;
    }
    
    // 创建 ServiceCenter 实例（管理所有服务）
    serviceCenter = new window.ServiceCenter(window.EventBus);
    
    const root = document.getElementById('root');
    
    try {
      // 1. 通过 ServiceCenter 初始化并加载设置
      const settingsController = serviceCenter.getSettingsController();
      await settingsController.loadSettings();
      console.log('[App] Settings loaded via ServiceCenter');
      
      // 2. 通过 ServiceCenter 初始化会话管理器并同步加载数据
      const sessionManager = serviceCenter.getSessionManager();
      
      // 关键：显式等待会话从存储加载完成
      await sessionManager.loadSessionsFromStorage();
      
      console.log('[App] SessionManager initialized via ServiceCenter');
      
      // 3. 通过 ServiceCenter 初始化聊天服务
      const settings = settingsController.getSettings();
      
      if (settings && settings.apiStandard) {
        try {
          const chatService = serviceCenter.createChatService(settings.apiStandard, {
            endpoint: settings.apiEndpoint,
            apiKey: settings.apiKey,
            defaultModel: settings.model || 'default'
          });
          
          // 通过 ServiceCenter 获取 ChatController 并设置服务
          const chatController = serviceCenter.getChatController(chatService);
          
          console.log('[App] Chat service initialized via ServiceCenter:', settings.apiStandard);
        } catch (error) {
          console.error('[App] Failed to initialize chat service:', error);
        }
      }
      
      // 注册全局事件监听（只注册一次）
      if (window.EventBus && window.Events && !window.App._globalListenersRegistered) {
        window.App._globalListenersRegistered = true;
        
        // 监听会话切换事件，更新 ChatPage 的内部引用
        window.EventBus.on(window.Events.CHAT.SESSION_SWITCHED, (data) => {
          // ChatPage 会在下次渲染时自动获取最新会话
          console.log('[App] Session switched event received');
        });
      }
      
      // 4. 创建 EventHandlers（传入 serviceCenter）
      if (typeof ChatEventHandler !== 'undefined') {
        window.chatEventHandler = new ChatEventHandler(serviceCenter);
      }
      if (typeof SettingsEventHandler !== 'undefined') {
        window.settingsEventHandler = new SettingsEventHandler(serviceCenter);
      }
      if (typeof StorageEventHandler !== 'undefined') {
        window.storageEventHandler = new StorageEventHandler(serviceCenter);
      }
      if (typeof ScriptsEventHandler !== 'undefined') {
        window.scriptsEventHandler = new ScriptsEventHandler(serviceCenter);
      }
      
      // 5. 所有数据就绪后，渲染页面
      renderPage(root, serviceCenter);
      
    } catch (err) {
      console.error('[App] Initialization failed:', err);
      document.getElementById('root').textContent = 'Error: Initialization failed';
    }
  }

  function renderPage(root, serviceCenter) {
    const { create } = window.DOM;
    const contentAreaEl = create('div', { className: 'content-area', id: 'content-area' });
    
    const app = create('div', { className: 'app-container' }, [
      create('div', { className: 'main-content' }, [
        contentAreaEl,
        createSidebar()
      ])
    ]);
    
    root.innerHTML = '';
    root.appendChild(app);
    
    // 渲染当前页面（传入 serviceCenter）
    if (window.Pages && window.Pages[currentPage]) {
      console.log('[App] Rendering page:', currentPage, 'to container:', contentAreaEl);
      window.Pages[currentPage](contentAreaEl, serviceCenter);
    } else {
      console.warn('[App] Page not found:', currentPage, 'Available:', Object.keys(window.Pages || {}));
    }
  }
  
  function createSidebar() {
    const { create } = window.DOM;
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
    renderPage(document.getElementById('root'), serviceCenter);
  }
  
  // 暴露 navigateTo 方法
  window.App = {
    navigateTo: switchPage
  };
  
  window.addEventListener('load', init);
})();
