/**
 * Svelte 5 UI 入口
 * 
 * 独立启动入口——自行 Boot Kernel，然后挂载 Svelte App。
 */

import { mount } from 'svelte';
import Sidepanel from './Sidepanel.svelte';
import './styles/tokens.css';
import './styles/utilities.css';
import './styles/components.css';
import './styles/pages.css';

import { ConsoleLogger } from 'kernel/services/ConsoleLogger.js';
import { IPC } from 'kernel/IPC.js';
import { ToolsManager } from 'kernel/ToolsManager.js';
import { CapabilityManager } from 'kernel/CapabilityManager.js';
import { Kernel } from 'kernel/Kernel.js';
import { Bootloader } from 'kernel/Bootloader.js';
import { SessionManager } from 'kernel/services/SessionManager.js';
import { SettingsManager } from 'kernel/services/SettingsManager.js';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { ProcessManager } from 'kernel/services/ProcessManager.js';
import { ProviderFactory } from 'kernel/services/ProviderFactory.js';
import { ChatProgram } from 'kernel/programs/ChatProgram.js';
import { ChromeStorageAdapter } from './services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from './tools/ManageUserScriptsTool.js';
import { ChatEventHandler } from './pages/chat/ChatEventHandler.js';

async function bootKernel() {
  console.log('[SvelteApp] Booting Kernel...');

  const log = new ConsoleLogger();
  const ipc = new IPC({ origin: 'svelte-app' });

  const toolsManager = new ToolsManager();
  const capabilities = new CapabilityManager();

  ipc.use((message, next) => {
    log.debug('IPC', `Event: ${message.event} (origin: ${message.origin})`);
    return next();
  });

    const kernel = new Kernel({
      ipc,
      origin: 'webagentcli-svelte',
      toolsManager,
      capabilities,
    });

  const bootloader = new Bootloader(kernel);

  // ---- Phase 1: INIT ----
  bootloader.on(Bootloader.PHASES.INIT, async () => {
    log.info('BOOT', 'IPC ready');
  });

  // ---- Phase 2: REGISTER ----
  bootloader.on(Bootloader.PHASES.REGISTER, async () => {
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

  // ---- Phase 3: START ----
  bootloader.on(Bootloader.PHASES.START, async () => {
    // 1. 初始化所有服务（ProcessManager.init 在此自动调用，注册 IPC 监听）
    await kernel.boot();
    log.info('APP', 'Services initialized from Kernel');

    // 2. 注册内置工具
    const builtInClasses = [RunUserScriptTool, ManageUserScriptsTool];
    builtInClasses.forEach((ToolClass) => {
      if (typeof ToolClass !== 'function') return;
      try {
        const tool = new (ToolClass as any)();
        if (tool.name) {
          toolsManager.register(tool);
          log.info('TOOL', `Registered: ${tool.name}`);
        }
      } catch (e) {
        log.warn('TOOL', 'Failed to register tool', e);
      }
    });

    // 3. 创建 ChatProgram + 事件转译层
    const chatProgram = new ChatProgram({ kernel, name: 'main' });
    (kernel as any).chatProgram = chatProgram;
    log.info('APP', 'ChatProgram initialized');

    // ChatEventHandler：USER_APPLY_* → ChatProgram（鉴权/校验预留）
    const chatEventHandler = new ChatEventHandler(kernel, chatProgram);
    (kernel as any).chatEventHandler = chatEventHandler;
    log.info('APP', 'ChatEventHandler initialized');

    // 4. 加载配置
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

    // 挂载侧边栏 Shell
    mount(Sidepanel, {
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