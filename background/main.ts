/**
 * background/main.ts — Service Worker 入口
 *
 * 启动完整 Kernel，注册工具，连接 sidepanel Shell
 *
 * 构建：Vite + rollup → dist/background.bundle.js
 * manifest.json 中 service_worker 指向此构建产物
 *
 * 稳健性（最小必要）：
 * - 全局异常兜底：任何逃逸的 unhandledrejection / error 都标记内核崩溃并触发一次
 *   chrome.runtime.reload()，避免「未知崩溃后服务静默死掉」。
 * - 健康门控 ensureBoot：内核已启动但被标记崩溃时，下次调用直接触发一次性 reload，
 *   而不是把死内核返回给调用方。
 * - 所有 chrome 级监听器（onConnect / 全局异常）只在模块加载时安装一次，杜绝重启动
 *   导致的监听器累积泄漏。
 */

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from 'bridge/IPCTransport.js';
import { RPCServer } from 'bridge/RPC.js';
import { createSessionFacade, createToolsFacade, createStorageFacade, createScriptsFacade } from './rpc-facades.js';
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
import { ChatProgram, CMD } from 'kernel/programs/ChatProgram.js';
import { ChromeStorageAdapter } from './services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from './tools/ManageUserScriptsTool.js';
import { KernelEvents } from 'kernel/Events.js';
import { Log } from 'kernel/services/Log.js';

/**
 * 内核启动编排（只启动一次，跨 SW 唤醒保持单例）。
 * 用模块级 Promise 保证并发触发只会 boot 一次；并返回该 Promise 以在
 * 异步启动期间保持 Service Worker 存活（MV3 关键）。
 */
let bootPromise: Promise<any> | null = null;

/** 内核是否已因未知异常崩溃（全局兜底置位）。 */
let kernelCrashed = false;
/** 一次性重启守卫：避免崩溃风暴下反复 reload。 */
let reloading = false;

/** 模块级 IPC：SW 加载时创建一次，确保 chrome 监听器只安装一次。 */
const ipc: IPC = new IPC({ origin: 'background-kernel' });
/** 供全局兜底与 boot 失败回传使用。 */
let activeIpc: IPC = ipc;

const transport = new IPCTransport(ipc, 'kernel', {
    // 每当 Shell 通过端口连接（含重连）时：确保内核已启动（保持 SW 存活），
    // 并主动推送就绪信号，使 Shell 无需依赖竞态/超时即可可靠拿到 bootComplete。
    onShellConnect: () => {
        ensureBoot()
            .then(() => ipc.emit('kernel:bootComplete', { timestamp: Date.now() }))
            .catch(() => { /* 启动失败已通过 kernel:bootError 暴露 */ });
    },
});
transport.init(); // 仅此处安装 chrome.runtime.onConnect，生命周期内只一次

function triggerReload(reason: string): void {
    if (reloading) return;
    reloading = true;
    Log.error('BACKGROUND', `Triggering SW reload (reason: ${reason})`);
    try {
        chrome.runtime.reload();
    } catch {
        /* 极端情况下 reload 不可用，放弃 */
    }
}

// ── 全局异常兜底（模块加载时安装一次）──
function onUnhandledRejection(e: PromiseRejectionEvent) {
    const detail = e?.reason?.message || String(e?.reason) || 'unknown';
    Log.error('BACKGROUND', 'Unhandled promise rejection', e?.reason);
    kernelCrashed = true;
    activeIpc?.emit('kernel:crashed', { reason: 'unhandledrejection: ' + detail, ts: Date.now() });
    triggerReload('unhandledrejection: ' + detail);
}
function onUncaughtError(e: ErrorEvent) {
    const detail = e?.message || 'unknown';
    Log.error('BACKGROUND', 'Uncaught error', e);
    kernelCrashed = true;
    activeIpc?.emit('kernel:crashed', { reason: 'error: ' + detail, ts: Date.now() });
    triggerReload('error: ' + detail);
}
(self as unknown as WorkerGlobalScope).addEventListener('unhandledrejection', onUnhandledRejection as EventListener);
(self as unknown as WorkerGlobalScope).addEventListener('error', onUncaughtError as EventListener);

// ── 兼容旧握手：Shell 初始 ping 仍回 bootComplete（无需健康校验，避免误伤正常状态）──
ipc.on('kernel:ping', () => {
    ipc.emit('kernel:bootComplete', { ts: Date.now() });
});

function ensureBoot(): Promise<any> {
    if (!bootPromise) {
        bootPromise = bootKernel()
            .then((k: any) => k)
            .catch((err) => {
                bootPromise = null; // 允许下次唤醒时重试
                Log.error('BACKGROUND', 'Kernel boot failed', err);
                activeIpc?.emit('kernel:bootError', { message: String((err as Error)?.message || err) });
                throw err;
            });
        return bootPromise;
    }
    if (kernelCrashed) {
        // 内核已崩溃但 SW 仍存活（端口仍开着）：触发一次性安全重启，强制干净状态。
        // 返回永不 resolve 的 Promise 挂起调用方，等待 SW 被 chrome.runtime.reload() 回收。
        Log.warn('BACKGROUND', 'ensureBoot: kernel crashed while SW alive, forcing reload');
        triggerReload('ensureBoot: kernelCrashed');
        return new Promise(() => {});
    }
    return bootPromise;
}

async function bootKernel() {
    const log = new ConsoleLogger();
    const toolsManager = new ToolsManager();
    const capabilities = new CapabilityManager();

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

    // ─── Phase 4: Shell 事件转义 + RPC ───
    bootloader.on(Bootloader.PHASES.READY, async () => {
        const chatChannel = ipc.getOrCreateChannel('chat');
        const toolChannel = ipc.getOrCreateChannel('tool');

        // ── Shell 用户意图 → 内核授权命令 ──
        chatChannel.on(KernelEvents.CHAT.USER_APPLY_SEND, (data: any) => {
            chatChannel.emit(CMD.SEND, data);
        });
        chatChannel.on(KernelEvents.CHAT.USER_APPLY_STOP, () => {
            chatChannel.emit(CMD.STOP);
        });
        chatChannel.on(KernelEvents.CHAT.USER_APPLY_DELETE_MESSAGE, (data: any) => {
            chatChannel.emit(CMD.DELETE_MESSAGE, data);
        });

        // ── RPC 分发（统一请求 ID 关联，错误回传，边界 sanitize） ──
        const rpcServer = new RPCServer(ipc);

        rpcServer.expose('session', createSessionFacade(kernel, chatChannel), {
            methods: ['getCurrent', 'create', 'update', 'deleteMessage', 'list', 'switch', 'delete', 'clearMessages'],
            capabilities: kernel.capabilities as any,
        });
        rpcServer.expose('tools', createToolsFacade(kernel), {
            methods: ['list', 'toggle'],
            capabilities: kernel.capabilities as any,
        });
        rpcServer.expose('settings', kernel.getSettingsManager(), {
            methods: ['getSettings', 'saveSettings', 'getSetting', 'saveSetting', 'resetSettings'],
            capabilities: kernel.capabilities as any,
        });
        rpcServer.expose('storage', createStorageFacade(kernel), {
            methods: ['getAll', 'set', 'remove', 'clear'],
            capabilities: kernel.capabilities as any,
        });
        rpcServer.expose('scripts', createScriptsFacade(kernel), {
            methods: ['list', 'install', 'edit', 'toggle', 'uninstall'],
            capabilities: kernel.capabilities as any,
        });
    });

    await bootloader.boot();
    log.info('BACKGROUND', `Kernel boot complete. Timings: ${JSON.stringify(bootloader.getTimings())}`);

    return kernel;
}

// 扩展安装/更新时启动 Kernel（仅一次）
chrome.runtime.onInstalled.addListener(() => {
    ensureBoot();
    // 点击工具栏图标即打开侧边栏（MV3 默认行为兜底）
    chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

console.log('[Background] Service worker loaded');
