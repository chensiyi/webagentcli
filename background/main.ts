/**
 * background/main.ts — Service Worker 入口
 *
 * 启动完整 Kernel，注册工具，连接 sidepanel Shell
 *
 * 构建：Vite + rollup → dist/background.bundle.js
 * manifest.json 中 service_worker 指向此构建产物
 */

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from '../bridge/IPCTransport.js';
import { RPCServer } from '../bridge/RPC.js';
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
import {KernelEvents} from 'kernel/Events.js';
import { Log } from 'kernel/services/Log.js';

/**
 * 内核启动编排（只启动一次，跨 SW 唤醒保持单例）。
 * 用模块级 Promise 保证并发触发只会 boot 一次；并返回该 Promise 以在
 * 异步启动期间保持 Service Worker 存活（MV3 关键）。
 */
let bootPromise: Promise<any> | null = null;
let activeIpc: IPC | null = null;

function ensureBoot(): Promise<any> {
    if (!bootPromise) {
        bootPromise = bootKernel()
            .catch((err) => {
                bootPromise = null; // 允许下次唤醒时重试
                Log.error('BACKGROUND', 'Kernel boot failed', err);
                activeIpc?.emit('kernel:bootError', { message: String((err as Error)?.message || err) });
                throw err;
            });
    }
    return bootPromise;
}

async function bootKernel() {
    const log = new ConsoleLogger();
    const ipc = new IPC({ origin: 'background-kernel' });
    activeIpc = ipc;
    const toolsManager = new ToolsManager();
    const capabilities = new CapabilityManager();

    // IPC 远程传输：连接 sidepanel Shell（Port 长连接，SW 保活）
    const transport = new IPCTransport(ipc, 'kernel', {
        // 每当 Shell 通过端口连接（含重连）时：确保内核已启动（保持 SW 存活），
        // 并主动推送就绪信号，使 Shell 无需依赖竞态/超时即可可靠拿到 bootComplete。
        onShellConnect: () => {
            ensureBoot()
                .then(() => activeIpc?.emit('kernel:bootComplete', { timestamp: Date.now() }))
                .catch(() => { /* 启动失败已通过 kernel:bootError 暴露 */ });
        },
    });
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

        // 响应 Shell 的 ping：SW 唤醒后 Shell 可能错过 bootComplete，ping 一下立即回包
        ipc.on('kernel:ping', () => {
            ipc.emit('kernel:bootComplete', { timestamp: Date.now() });
        });
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

        // ── RPC 分发（重设计：统一请求 ID 关联，错误回传，边界 sanitize） ──
        const rpcServer = new RPCServer(ipc);

        // ── 标准外部访问接口：session / tools / settings / storage / scripts 统一用 expose 注册 ──
        // expose 把 Manager（或其 facade）的公共方法注册为 `<service>.<method>` 形式的远程方法，
        // 客户端通过 createApiClient 出的代理 api.<service>.<method>(...) 调用，类型与 kernel 侧一致。
        // 复合返回形状（如 {session, messages, reasoningEffort}）、事件广播与入参校验由 facade 负责。
        // 每个调用接入 capabilities.audit 能力监测钩子（后期填充 per-method 的能力映射）。
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

// 当 Sidepanel 通过 IPC 唤醒 Service Worker 时，确保 Kernel 已启动。
// 返回 boot promise 以在异步启动期间保持 SW 存活（否则 SW 可能在 boot 中途被回收）。
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message && message._ipc) {
        return ensureBoot();
    }
    return false;
});

console.log('[Background] Service worker loaded');