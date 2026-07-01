/**
 * App - 应用主入口
 *
 * 使用 Bootloader 启动内核，然后渲染壳层 UI。
 *
 * Shell 已全量 Vite 化，所有依赖通过 ES module import。
 */

import { KernelLog } from '../../kernel/KernelLog.js';
import { IPC } from '../../kernel/IPC.js';
import { ToolRegistry } from '../../kernel/ToolRegistry.js';
import { CapabilityManager } from '../../kernel/CapabilityManager.js';
import { Kernel } from '../../kernel/Kernel.js';
import { Bootloader } from '../../kernel/Bootloader.js';
import { SessionManager } from '../../kernel/services/SessionManager.js';
import { SettingsManager } from '../../kernel/services/SettingsManager.js';
import { ScriptsManager } from '../../kernel/services/ScriptsManager.js';
import { ProcessManager } from '../../kernel/services/ProcessManager.js';
import { ProviderFactory } from '../../kernel/services/ProviderFactory.js';
import { ChatProgram } from '../../kernel/programs/ChatProgram.js';
import { ChromeStorageAdapter } from './services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from './tools/ManageUserScriptsTool.js';
import { ChatEventHandler } from './event-handlers/ChatEventHandler.js';
import { SettingsEventHandler } from './event-handlers/SettingsEventHandler.js';
import { StorageEventHandler } from './event-handlers/StorageEventHandler.js';
import { ScriptsEventHandler } from './event-handlers/ScriptsEventHandler.js';
import { DOM, Pages } from './utils/dom.js';
import { Events } from './events.js';
import { appState } from './state.js';

// 导入所有页面（通过副作用注册到 Pages 对象）
import './pages/ChatPage.js';
import './pages/HistoryPage.js';
import './pages/StoragePage.js';
import './pages/ScriptsPage.js';
import './pages/SettingsPage.js';

let currentPage = 'chat';
let kernel = null;
let bootloader = null;

const pages = [
  { id: 'chat', icon: '\u{1F4AC}', label: '\u5BF9\u8BDD' },
  { id: 'history', icon: '\u{1F4CB}', label: '\u5386\u53F2' },
  { id: 'storage', icon: '\u{1F4BE}', label: '\u5B58\u50A8' },
  { id: 'scripts', icon: '\u{1F4DC}', label: '\u811A\u672C' },
  { id: 'settings', icon: '\u2699\uFE0F', label: '\u8BBE\u7F6E' }
];

async function init() {
  console.log('[App] Initializing...');

  if (!DOM || !Pages) {
    console.error('[App] DOM or Pages not loaded');
    document.getElementById('root').textContent = 'Error: Dependencies not loaded';
    return;
  }

  const root = document.getElementById('root');

  try {
    await bootWithKernel();
    renderPage(root, kernel);
  } catch (err) {
    console.error('[App] Initialization failed:', err);
    root.textContent = 'Error: Initialization failed';
  }
}

async function bootWithKernel() {
  console.log('[App] Booting with Kernel...');
  const app = {};

  app.log = new KernelLog({ minLevel: KernelLog.LEVELS.DEBUG });
  app.ipc = new IPC({ origin: 'sidepanel', maxHistory: 200 });

  const toolRegistry = new ToolRegistry();
  const capabilities = new CapabilityManager();

  app.ipc.use((message, next) => {
    app.log.debug('IPC', `Event: ${message.event} (priority: ${message.priorityName}, origin: ${message.origin})`);
    return next();
  });

  kernel = new Kernel({
    ipc: app.ipc,
    log: app.log,
    origin: 'webagentcli',
    toolRegistry: toolRegistry,
    capabilities: capabilities
  });

  bootloader = new Bootloader(kernel);

  bootloader.on(
    Bootloader.PHASES.CORE_INIT,
    async (bl) => {
      app.log.info('BOOT', 'IPC ready');
    }
  );

  bootloader.on(
    Bootloader.PHASES.SERVICES_REGISTER,
    async (bl) => {
      const chromeStorageAdapter = new ChromeStorageAdapter(kernel);

      kernel.register('storageAdapter', async (k) => chromeStorageAdapter);
      kernel.register('storageManager', async (k) => chromeStorageAdapter);

      kernel.register('sessionManager', async (k) => {
        const sm = new SessionManager({ ipc: app.ipc, storage: chromeStorageAdapter, log: app.log });
        await sm.initialize();
        return sm;
      }, { dependsOn: ['storageAdapter'] });

      kernel.register('settingsManager', async (k) => {
        const settingsManager = new SettingsManager({ ipc: app.ipc, storage: chromeStorageAdapter, log: app.log });
        return settingsManager;
      }, { dependsOn: ['storageAdapter'] });

      kernel.register('scriptsManager', async (k) => {
        return new ScriptsManager(kernel);
      });

      kernel.register('processManager', async (k) => {
        return new ProcessManager(kernel);
      });

      kernel.register('providerFactory', async (k) => {
        return new ProviderFactory(k);
      }, { dependsOn: ['settingsManager'] });
    }
  );

  bootloader.on(
    Bootloader.PHASES.SERVICES_INIT,
    async (bl) => {
      await kernel.boot();
      app.log.info('APP', 'Services initialized from Kernel');
    }
  );

  bootloader.on(
    Bootloader.PHASES.TOOLS_REGISTER,
    async (bl) => {
      const builtInClasses = [RunUserScriptTool, ManageUserScriptsTool];
      builtInClasses.forEach(ToolClass => {
        if (typeof ToolClass !== 'function') return;
        try {
          const tool = new ToolClass();
          if (tool.definition && tool.definition.name) {
            toolRegistry.register(tool);
            app.log.info('TOOL', `Registered: ${tool.definition.name}`);
          }
        } catch (e) {
          app.log.warn('TOOL', 'Failed to register tool', e);
        }
      });
    }
  );

  bootloader.on(
    Bootloader.PHASES.HANDLERS_INIT,
    async (bl) => {
      app.chatProgram = new ChatProgram({ kernel: kernel, name: 'main' });
      kernel.chatProgram = app.chatProgram; // 使 ChatPage 等可通过 kernel 访问
      app.log.info('APP', 'ChatProgram initialized');

      appState.chatEventHandler = new ChatEventHandler(kernel);
      appState.settingsEventHandler = new SettingsEventHandler(kernel);
      appState.storageEventHandler = new StorageEventHandler(kernel);
      appState.scriptsEventHandler = new ScriptsEventHandler(kernel);
    }
  );

  bootloader.on(
    Bootloader.PHASES.CONFIG_LOAD,
    async (bl) => {
      const settingsManager = kernel.getSettingsManager();
      await settingsManager.loadSettings();
      app.providerFactory = kernel.getProviderFactory();
      app.log.info('APP', 'ProviderFactory accessed via kernel');
    }
  );

  await bootloader.boot();

  const sm = kernel.getSessionManager();
  if (sm) {
    const allSessions = sm.getAllSessions();
    const current = sm.getCurrentSession();
    app.log?.info('SESSION', `After init: ${allSessions.length} sessions, current: ${current ? current.id : 'null'}`);
  } else {
    app.log?.warn('APP', 'sessionManager not available after boot');
  }

  if (app.ipc && !appState._globalListenersRegistered) {
    appState._globalListenersRegistered = true;
    app.ipc.on(Events.CHAT.SESSION_SWITCHED, (data) => {
      app.log.info('APP', 'Session switched event received');
    });
  }

  console.log('[App] Kernel boot complete. Boot timings:', bootloader.getTimings());
}

function renderPage(root, kernel) {
  const { create } = DOM;
  const contentAreaEl = create('div', { className: 'content-area', id: 'content-area' });

  const app = create('div', { className: 'app-container' }, [
    create('div', { className: 'main-content' }, [
      contentAreaEl,
      createSidebar()
    ])
  ]);

  root.innerHTML = '';
  root.appendChild(app);

  if (Pages && Pages[currentPage]) {
    console.log('[App] Rendering page:', currentPage);
    Pages[currentPage](contentAreaEl, kernel);
  } else {
    console.warn('[App] Page not found:', currentPage, 'available:', Object.keys(Pages || {}).join(', '));
  }
}

function createSidebar() {
  const { create } = DOM;
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

// 对外暴露 App 接口（供 HistoryPage 等导航使用）
appState.App = {
  navigateTo: switchPage,
  getKernel: () => kernel,
  getBootloader: () => bootloader
};

window.addEventListener('load', init);
