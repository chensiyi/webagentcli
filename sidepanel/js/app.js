/**
 * App - 应用主入口
 * 
 * 使用 Bootloader 启动内核，然后渲染壳层 UI。
 * 
 * 向后兼容：当 Kernel.js 未加载时，回退到原始启动流程。
 */

(function() {
  let currentPage = 'chat';
  let serviceCenter = null;
  let kernel = null;
  let bootloader = null;

  const pages = [
    { id: 'chat', icon: '\u{1F4AC}', label: '\u{5BF9}\u{8BDD}' },
    { id: 'history', icon: '\u{1F4CB}', label: '\u{5386}\u{53F2}' },
    { id: 'storage', icon: '\u{1F4BE}', label: '\u{5B58}\u{50A8}' },
    { id: 'scripts', icon: '\u{1F4DC}', label: '\u{811A}\u{672C}' },
    { id: 'settings', icon: '\u{2699}\u{FE0F}', label: '\u{8BBE}\u{7F6E}' }
  ];

  async function init() {
    console.log('[App] Initializing...');

    if (!window.DOM || !window.Pages) {
      console.error('[App] DOM or Pages not loaded');
      document.getElementById('root').textContent = 'Error: Dependencies not loaded';
      return;
    }

    const root = document.getElementById('root');

    try {
      // ========== Phase 1: 使用 Bootloader 启动 Kernel ==========
      await bootWithKernel();

      // ========== Phase 2: 渲染 UI ==========
      renderPage(root, serviceCenter);

    } catch (err) {
      console.error('[App] Initialization failed:', err);
      root.textContent = 'Error: Initialization failed';
    }
  }

  /**
   * 使用 Kernel + Bootloader 启动
   */
  async function bootWithKernel() {
    console.log('[App] Booting with Kernel...');

    // 1. 创建内核子系统
    const log = new window.KernelLog({ minLevel: window.KernelLog.LEVELS.INFO });
    const ipc = new window.IPC({ origin: 'sidepanel', maxHistory: 200 });

    // 2. 创建 ToolRegistry 和 CapabilityManager
    const toolRegistry = new window.ToolRegistry();
    const capabilities = new window.CapabilityManager();

    // 3. 注册 IPC 日志中间件
    ipc.use((message, next) => {
      log.debug('IPC', `Event: ${message.event} (priority: ${message.priorityName}, origin: ${message.origin})`);
      return next();
    });

    // 4. 创建 Kernel 实例
    kernel = new window.Kernel({
      ipc,
      log,
      origin: 'webagentcli'
    });
    kernel.toolRegistry = toolRegistry;
    kernel.capabilities = capabilities;

    // 5. 提前创建 ServiceCenter（工厂函数需要它而不要传 null）
    serviceCenter = new window.ServiceCenter(ipc, kernel);

    // 6. 创建 Bootloader
    bootloader = new window.Bootloader(kernel);

    // 7. 注册启动阶段钩子
    bootloader.on(
      window.Bootloader.PHASES.CORE_INIT,
      async (bl) => {
        // IPC 已创建，无需额外操作
        log.info('BOOT', 'IPC ready');
      }
    );

      bootloader.on(
        window.Bootloader.PHASES.SERVICES_REGISTER,
        async (bl) => {
          // 1. 创建存储适配器（IStorageManager 的 Chrome 环境实现）
          const chromeStorageAdapter = new window.ChromeStorageAdapter(serviceCenter);
          const scriptsModel = new window.ScriptsModel(chromeStorageAdapter);
          
          window.ScriptsModel = scriptsModel;
          
          // 2. 注册核心服务
          // ChromeStorageAdapter 同时作为 storageAdapter（底层存储）和 storageManager（管理行为）
          kernel.register('storageAdapter', async (k) => chromeStorageAdapter);
          kernel.register('storageManager', async (k) => chromeStorageAdapter);
          kernel.register('scriptsModel', async (k) => scriptsModel);
          
          kernel.register('sessionManager', async (k) => {
            const sm = new window.SessionManager(ipc);
            // 注入存储适配器给 SessionManager
            sm.storage = chromeStorageAdapter;
            await sm.initialize();
            return sm;
          }, { dependsOn: ['storageAdapter'] });
          
          kernel.register('settingsManager', async (k) => {
            const settingsManager = new window.SettingsManager(serviceCenter, chromeStorageAdapter);
            return settingsManager;
          }, { dependsOn: ['storageAdapter'] });
          
          kernel.register('scriptsManager', async (k) => {
            return new window.ScriptsManager(serviceCenter, scriptsModel);
          }, { dependsOn: ['scriptsModel'] });
          
          kernel.register('modelManager', async (k) => {
            return new window.ModelManager(serviceCenter);
          });

        }
      );

    bootloader.on(
      window.Bootloader.PHASES.SERVICES_INIT,
      async (bl) => {
        // 初始化 Kernel 中所有已注册的服务（按依赖顺序）
        await kernel.boot();
        
        // 从 Kernel 中获取已初始化的服务实例，挂到 ServiceCenter
        serviceCenter.sessionManager = kernel.get('sessionManager');
        serviceCenter.settingsManager = kernel.get('settingsManager');
        serviceCenter.storageManager = kernel.get('storageManager');
        serviceCenter.scriptsManager = kernel.get('scriptsManager');
        serviceCenter.modelManager = kernel.get('modelManager');
        
        console.log('[App] Services initialized from Kernel');
      }
    );

    bootloader.on(
      window.Bootloader.PHASES.TOOLS_REGISTER,
      async (bl) => {
        // 注册内置工具
        const builtInClasses = [
          window.RunUserScriptTool,
          window.ManageUserScriptsTool
        ];
        builtInClasses.forEach(ToolClass => {
          if (typeof ToolClass !== 'function') return;
          try {
            const tool = new ToolClass();
            if (tool.definition && tool.definition.name) {
              toolRegistry.register(tool);
              log.info('TOOL', `Registered: ${tool.definition.name}`);
            }
          } catch (e) {
            log.warn('TOOL', 'Failed to register tool', e);
          }
        });
      }
    );

    bootloader.on(
      window.Bootloader.PHASES.HANDLERS_INIT,
      async (bl) => {
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
      }
    );

    bootloader.on(
      window.Bootloader.PHASES.CONFIG_LOAD,
      async (bl) => {
        const settingsManager = serviceCenter.getSettingsManager();
        await settingsManager.loadSettings();
        log.info('BOOT', 'Settings loaded');
      }
    );

    // 执行启动
    await bootloader.boot();

    // 注册全局事件监听
    const eventBus = serviceCenter.getEventBus();
    if (eventBus && !window.App._globalListenersRegistered) {
      window.App._globalListenersRegistered = true;
      eventBus.on(window.Events.CHAT.SESSION_SWITCHED, (data) => {
        console.log('[App] Session switched event received');
      });
    }

    console.log('[App] Kernel boot complete. Boot timings:', bootloader.getTimings());
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

      let tooltipElement = null;

      btn.addEventListener('mouseenter', (e) => {
        if (tooltipElement) { tooltipElement.remove(); }
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
    const tooltips = document.querySelectorAll('.sidebar-tooltip');
    tooltips.forEach(tooltip => tooltip.remove());

    currentPage = pageId;
    renderPage(document.getElementById('root'), serviceCenter);
  }

  window.App = {
    navigateTo: switchPage,
    getKernel: () => kernel,
    getBootloader: () => bootloader,
    getServiceCenter: () => serviceCenter
  };

  window.addEventListener('load', init);
})();