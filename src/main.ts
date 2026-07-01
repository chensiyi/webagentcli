/**
 * Svelte 5 UI 入口
 * 
 * 独立启动入口——自行 Boot Kernel，然后挂载 Svelte App。
 * 与旧 UI (sidepanel/js/app.js) 并行运行，互不干扰。
 */

import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

import { ConsoleLogger } from '../kernel/services/ConsoleLogger.js';
import { IPC } from '../kernel/IPC.js';
import { ToolRegistry } from '../kernel/ToolRegistry.js';
import { CapabilityManager } from '../kernel/CapabilityManager.js';
import { Kernel } from '../kernel/Kernel.js';
import { Bootloader } from '../kernel/Bootloader.js';
import { SessionManager } from '../kernel/services/SessionManager.js';
import { SettingsManager } from '../kernel/services/SettingsManager.js';
import { ScriptsManager } from '../kernel/services/ScriptsManager.js';
import { ProcessManager } from '../kernel/services/ProcessManager.js';
import { ProviderFactory } from '../kernel/services/ProviderFactory.js';
import { ChatProgram } from '../kernel/programs/ChatProgram.js';
import { ChromeStorageAdapter } from '../sidepanel/js/services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from '../sidepanel/js/tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from '../sidepanel/js/tools/ManageUserScriptsTool.js';

async function bootKernel() {
  console.log('[SvelteApp] Booting Kernel...');

  const log = new ConsoleLogger();
  const ipc = new IPC({ origin: 'svelte-app', maxHistory: 200 });

  const toolRegistry = new ToolRegistry();
  const capabilities = new CapabilityManager();

  ipc.use((message, next) => {
    log.debug('IPC', `Event: ${message.event} (priority: ${message.priorityName}, origin: ${message.origin})`);
    return next();
  });

  const kernel = new Kernel({
    ipc,
    log,
    origin: 'webagentcli-svelte',
    toolRegistry,
    capabilities,
  });

  const bootloader = new Bootloader(kernel);

  // ---- Phase 1: CORE_INIT ----
  bootloader.on(Bootloader.PHASES.CORE_INIT, async () => {
    log.info('BOOT', 'IPC ready');
  });

  // ---- Phase 2: SERVICES_REGISTER ----
  bootloader.on(Bootloader.PHASES.SERVICES_REGISTER, async () => {
    const chromeStorageAdapter = new ChromeStorageAdapter(kernel);

    kernel.register('storageAdapter', async () => chromeStorageAdapter);
    kernel.register('storageManager', async () => chromeStorageAdapter);

    kernel.register('sessionManager', async () => {
      const sm = new SessionManager({ ipc, storage: chromeStorageAdapter, log });
      await sm.initialize();
      return sm;
    }, { dependsOn: ['storageAdapter'] });

    kernel.register('settingsManager', async () => {
      return new SettingsManager({ ipc, storage: chromeStorageAdapter, log });
    }, { dependsOn: ['storageAdapter'] });

    kernel.register('scriptsManager', async () => {
      return new ScriptsManager(kernel);
    });

    kernel.register('processManager', async () => {
      return new ProcessManager(kernel);
    });

    kernel.register('providerFactory', async () => {
      return new ProviderFactory(kernel);
    }, { dependsOn: ['settingsManager'] });
  });

  // ---- Phase 3: SERVICES_INIT ----
  bootloader.on(Bootloader.PHASES.SERVICES_INIT, async () => {
    await kernel.boot();
    log.info('APP', 'Services initialized from Kernel');
  });

  // ---- Phase 4: TOOLS_REGISTER ----
  bootloader.on(Bootloader.PHASES.TOOLS_REGISTER, async () => {
    const builtInClasses = [RunUserScriptTool, ManageUserScriptsTool];
    builtInClasses.forEach((ToolClass) => {
      if (typeof ToolClass !== 'function') return;
      try {
        const tool = new (ToolClass as any)();
        if (tool.definition?.name) {
          toolRegistry.register(tool);
          log.info('TOOL', `Registered: ${tool.definition.name}`);
        }
      } catch (e) {
        log.warn('TOOL', 'Failed to register tool', e);
      }
    });
  });

  // ---- Phase 5: HANDLERS_INIT ----
  bootloader.on(Bootloader.PHASES.HANDLERS_INIT, async () => {
    const chatProgram = new ChatProgram({ kernel, name: 'main' });
    (kernel as any).chatProgram = chatProgram;
    log.info('APP', 'ChatProgram initialized');
  });

  // ---- Phase 6: CONFIG_LOAD ----
  bootloader.on(Bootloader.PHASES.CONFIG_LOAD, async () => {
    const settingsManager = kernel.getSettingsManager();
    await settingsManager.loadSettings();
    log.info('APP', 'ProviderFactory ready');
  });

  await bootloader.boot();
  log.info('APP', `Kernel boot complete. Timings: ${JSON.stringify(bootloader.getTimings())}`);

  return kernel;
}

async function init() {
  console.log('[SvelteApp] Initializing...');

  const root = document.getElementById('root');
  if (!root) {
    console.error('[SvelteApp] #root element not found');
    return;
  }

  try {
    const kernel = await bootKernel();

    // 挂载 Svelte 5 App
    mount(App, {
      target: root,
      props: { kernel },
    });

    console.log('[SvelteApp] Mounted successfully');
  } catch (err) {
    console.error('[SvelteApp] Initialization failed:', err);
    root.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

window.addEventListener('load', init);
