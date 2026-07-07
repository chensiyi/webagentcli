/**
 * background/main.ts — Service Worker 入口
 *
 * 启动完整 Kernel，注册工具，连接 sidepanel Shell
 *
 * 构建：Vite + rollup → dist/background.bundle.js
 * manifest.json 中 service_worker 指向此构建产物
 */

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from 'kernel/IPCTransport.js';
import { Kernel } from 'kernel/Kernel.js';
import { Bootloader } from 'kernel/Bootloader.js';
import { ToolsManager } from 'kernel/ToolsManager.js';
import { CapabilityManager } from 'kernel/CapabilityManager.js';
import { ConsoleLogger } from 'kernel/services/ConsoleLogger.js';
import { SessionManager } from 'kernel/services/SessionManager.js';
import { SettingsManager } from 'kernel/services/SettingsManager.js';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { ProcessManager } from 'kernel/services/ProcessManager.js';
import { ProviderFactory } from 'kernel/services/ProviderFactory.js';
import { ChatProgram } from 'kernel/programs/ChatProgram.js';
import { ChromeStorageAdapter } from './services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from './tools/ManageUserScriptsTool.js';

async function bootKernel() {
    const log = new ConsoleLogger();
    const ipc = new IPC({ origin: 'background-kernel' });
    const toolsManager = new ToolsManager();
    const capabilities = new CapabilityManager();

    // IPC 远程传输：连接 sidepanel Shell
    const transport = new IPCTransport(ipc, 'kernel');
    transport.init();

    const kernel = new Kernel({
        ipc,
        origin: 'webagentcli-bg',
        toolsManager,
        capabilities,
    });

    const bootloader = new Bootloader(kernel);

    // ─── Phase 1: INIT ───
    bootloader.on(Bootloader.PHASES.INIT, async () => {
        log.info('BACKGROUND', 'IPC ready');
    });

    // ─── Phase 2: REGISTER ───
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

    // ─── Phase 3: START ───
    bootloader.on(Bootloader.PHASES.START, async () => {
        await kernel.boot();
        log.info('BACKGROUND', 'Services initialized');

        // 注册内置工具
        const builtInClasses = [RunUserScriptTool, ManageUserScriptsTool];
        builtInClasses.forEach((ToolClass) => {
            if (typeof ToolClass !== 'function') return;
            try {
                const tool = new (ToolClass as any)();
                if (tool.name) {
                    toolsManager.register(tool);
                    log.info('BACKGROUND', `Tool registered: ${tool.name}`);
                }
            } catch (e) {
                log.warn('BACKGROUND', 'Failed to register tool', e);
            }
        });

        // 创建 ChatProgram
        const chatProgram = new ChatProgram({ kernel, name: 'main' });
        (kernel as any).chatProgram = chatProgram;
        log.info('BACKGROUND', 'ChatProgram initialized');

        // 加载配置
        const settingsManager = kernel.getSettingsManager();
        await settingsManager.loadSettings();
        log.info('BACKGROUND', 'Settings loaded');

        // 通知 sidepanel Kernel 已就绪
        ipc.emit('kernel:bootComplete', { timestamp: Date.now() });
    });

    await bootloader.boot();
    log.info('BACKGROUND', `Kernel boot complete. Timings: ${JSON.stringify(bootloader.getTimings())}`);

    return kernel;
}

// 扩展安装/更新/启动时启动 Kernel
chrome.runtime.onInstalled.addListener(() => {
    bootKernel();
});

// 如果 Service Worker 被唤醒（例如 sidepanel 发来消息），确保 Kernel 已启动
let kernelPromise: Promise<any> | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 如果收到 IPC 消息但 Kernel 还未启动，先启动
    if (message._ipc && !kernelPromise) {
        kernelPromise = bootKernel();
    }
    // 让 IPCTransport 处理实际的消息路由
    // 这里不拦截，IPCTransport 的 onMessage 监听器会处理
});

console.log('[Background] Service worker loaded');