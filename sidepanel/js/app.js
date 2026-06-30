/**
 * App - 应用主入口
 * 
 * 使用 Bootloader 启动内核，然后渲染壳层 UI。
 * 
 * 向后兼容：当 Kernel.js 未加载时，回退到原始启动流程。
 */

(function() {
  let currentPage = 'chat';
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
      renderPage(root, kernel);

    } catch (err) {
      console.error('[App] Initialization failed:', err);
      root.textContent = 'Error: Initialization failed';
    }
  }

  /**
   * 使用 Kernel + Bootloader 启动
   */
  async function bootWithKernel() {
    console.log('[App] Booting with Kernel...'); //全app理论上唯一的控制台直接访问，后面通过kernel访问

    // 1. 创建内核子系统
    this.log = new window.KernelLog({ minLevel: window.KernelLog.LEVELS.DEBUG });
    this.ipc = new window.IPC({ origin: 'sidepanel', maxHistory: 200 });

    // 2. 创建 ToolRegistry 和 CapabilityManager
    const toolRegistry = new window.ToolRegistry();
    const capabilities = new window.CapabilityManager();

    // 3. 注册 IPC 日志中间件
    this.ipc.use((message, next) => {
      this.log.debug('IPC', `Event: ${message.event} (priority: ${message.priorityName}, origin: ${message.origin})`);
      return next();
    });

    // 4. 创建 Kernel 实例
    kernel = new window.Kernel({
      ipc: this.ipc,
      log: this.log,
      origin: 'webagentcli',
      toolRegistry: toolRegistry,
      capabilities: capabilities
    });


    // 6. 创建 Bootloader
    bootloader = new window.Bootloader(kernel);

    // 7. 注册启动阶段钩子
    bootloader.on(
      window.Bootloader.PHASES.CORE_INIT,
      async (bl) => {
        // IPC 已创建，无需额外操作
        this.log.info('BOOT', 'IPC ready');
      }
    );

      bootloader.on(
        window.Bootloader.PHASES.SERVICES_REGISTER,
        async (bl) => {
          // 1. 创建存储适配器（IStorageManager 的 Chrome 环境实现）
          const chromeStorageAdapter = new window.ChromeStorageAdapter(kernel);
          const scriptsModel = new window.ScriptsModel(chromeStorageAdapter);
          
          window.ScriptsModel = scriptsModel;
          
          // 2. 注册核心服务
          // ChromeStorageAdapter 同时作为 storageAdapter（底层存储）和 storageManager（管理行为）
          kernel.register('storageAdapter', async (k) => chromeStorageAdapter);
          kernel.register('storageManager', async (k) => chromeStorageAdapter);
          kernel.register('scriptsModel', async (k) => scriptsModel);
          
          kernel.register('sessionManager', async (k) => {
            const sm = new window.SessionManager({ ipc: this.ipc, storage: chromeStorageAdapter, log: this.log });
            await sm.initialize();
            return sm;
          }, { dependsOn: ['storageAdapter'] });
          
          kernel.register('settingsManager', async (k) => {
            const settingsManager = new window.SettingsManager({ipc:this.ipc,storage:chromeStorageAdapter,log:this.log});
            return settingsManager;
          }, { dependsOn: ['storageAdapter'] });
          
          kernel.register('scriptsManager', async (k) => {
            return new window.ScriptsManager(kernel, scriptsModel);
          }, { dependsOn: ['scriptsModel'] });
          
          
          kernel.register('processManager', async (k) => {
            return new window.ProcessManager(kernel);
          });

          kernel.register('providerFactory', async (k) => {
            return new window.ProviderFactory(k);
          }, { dependsOn: ['settingsManager'] });

        }
      );

    bootloader.on(
      window.Bootloader.PHASES.SERVICES_INIT,
      async (bl) => {
        // 初始化 Kernel 中所有已注册的服务（按依赖顺序）
        await kernel.boot();

        this.log.info('APP', 'Services initialized from Kernel');
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
              this.log.info('TOOL', `Registered: ${tool.definition.name}`);
            }
          } catch (e) {
            this.log.warn('TOOL', 'Failed to register tool', e);
          }
        });
      }
    );

      bootloader.on(
        window.Bootloader.PHASES.HANDLERS_INIT,
        async (bl) => {
          // ★ 聊天服务：生成一个服务实例，可脱离页面在后台工作
          if (window.ChatProgram) {
            this.chatProgram = new window.ChatProgram({kernel: kernel, name: 'main'});
            this.log.info('APP', 'ChatProgram initialized');
          }
          if (typeof ChatEventHandler !== 'undefined') {
            window.chatEventHandler = new ChatEventHandler(kernel);
          }
        if (typeof SettingsEventHandler !== 'undefined') {
          window.settingsEventHandler = new SettingsEventHandler(kernel);
        }
        if (typeof StorageEventHandler !== 'undefined') {
          window.storageEventHandler = new StorageEventHandler(kernel);
        }
        if (typeof ScriptsEventHandler !== 'undefined') {
          window.scriptsEventHandler = new ScriptsEventHandler(kernel);
        }
      }
    );

    bootloader.on(
      window.Bootloader.PHASES.CONFIG_LOAD,
      async (bl) => {
        const settingsManager = kernel.getSettingsManager();
        await settingsManager.loadSettings();
        // ProviderFactory 已在 SERVICES_REGISTER 阶段注册并初始化
        this.providerFactory = kernel.getProviderFactory();
        this.log.info('APP', 'ProviderFactory accessed via kernel');
      }
    );

    // 执行启动
    await bootloader.boot();

    // 打印会话状态（初始化后、渲染前）
    const sm = kernel.getSessionManager();
    if (sm) {
      const allSessions = sm.getAllSessions();
      const current = sm.getCurrentSession();
      this.log?.info('SESSION', `After init: ${allSessions.length} sessions, current: ${current ? current.id : 'null'}`);
    } else {
      this.log?.warn('APP', 'sessionManager not available after boot');
    }

    // 注册全局事件监听
    if (this.ipc && !window.App._globalListenersRegistered) {
      window.App._globalListenersRegistered = true;
      this.ipc.on(window.Events.CHAT.SESSION_SWITCHED, (data) => {
        this.log.info('APP', 'Session switched event received');
      });
    }

    console.log('[App] Kernel boot complete. Boot timings:', bootloader.getTimings());
  }

  function renderPage(root, kernel) {
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
      this.log.info('APP', `Rendering page: ${currentPage}`);
      window.Pages[currentPage](contentAreaEl, kernel);
    } else {
      this.log.warn('APP', `Page not found: ${currentPage}, available: ${Object.keys(window.Pages || {}).join(', ')}`);
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
    renderPage(document.getElementById('root'), kernel);
  }

  window.App = {
    navigateTo: switchPage,
    getKernel: () => kernel,
    getBootloader: () => bootloader
  };

  window.addEventListener('load', init);
})();