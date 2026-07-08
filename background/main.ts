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
import { RPC, RPCServer } from '../bridge/RPC.js';
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

        rpcServer.register(RPC.SESSION_GET_CURRENT, () => {
            const sm = kernel.getSessionManager();
            const s = sm.getCurrentSession();
            return {
                session: s,
                messages: s?.messages || [],
                reasoningEffort: s?.reasoningEffort || 'medium',
            };
        });

        rpcServer.register(RPC.SESSION_NEW, async () => {
            const sm = kernel.getSessionManager();
            await sm.createSession();
            const s = sm.getCurrentSession();
            chatChannel.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
            return {
                session: s,
                messages: [],
                reasoningEffort: kernel.getSettingsManager().getSettings().reasoningEffort || 'medium',
            };
        });

        rpcServer.register(RPC.SESSION_UPDATE, async (data: any) => {
            if (!data?.sessionId) return null;
            const sm = kernel.getSessionManager();
            await sm.updateSession(data.sessionId, data.data as any);
            chatChannel.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: data.sessionId });
            return null;
        });

        rpcServer.register(RPC.SESSION_DELETE_MSG, async (data: any) => {
            if (!data?.messageId || !data?.sessionId) return null;
            const sm = kernel.getSessionManager();
            const ok = await sm.deleteMessage(data.messageId, data.sessionId);
            if (ok) {
                chatChannel.emit(KernelEvents.CHAT.MESSAGE_DELETED, { messageId: data.messageId, sessionId: data.sessionId });
            }
            return null;
        });

        rpcServer.register(RPC.TOOL_LIST, () => {
            const tools = (kernel.toolsManager?.getAll() || []).map(t => t.toJSON());
            return { tools };
        });

        rpcServer.register(RPC.TOOL_TOGGLE, (data: any) => {
            if (!data?.name) return null;
            const tm = kernel.toolsManager;
            if (data.enabled) tm?.enable(data.name);
            else tm?.disable(data.name);
            return null;
        });

        rpcServer.register(RPC.SESSION_LIST, () => {
            const sm = kernel.getSessionManager();
            return { sessions: sm.getAllSessions() };
        });

        rpcServer.register(RPC.SESSION_SWITCH, async (data: any) => {
            if (!data?.sessionId) return null;
            const sm = kernel.getSessionManager();
            await sm.setCurrentSession(data.sessionId);
            const s = sm.getCurrentSession();
            chatChannel.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
            return {
                session: s,
                messages: s?.messages || [],
                reasoningEffort: s?.reasoningEffort || 'medium',
            };
        });

        rpcServer.register(RPC.SESSION_DELETE, async (data: any) => {
            if (!data?.sessionId) return null;
            const sm = kernel.getSessionManager();
            await sm.deleteSession(data.sessionId);
            return { sessions: sm.getAllSessions() };
        });

        rpcServer.register(RPC.SESSION_CLEAR_MSGS, async (data: any) => {
            if (!data?.sessionId) return null;
            const sm = kernel.getSessionManager();
            await sm.clearMessages(data.sessionId);
            chatChannel.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: data.sessionId });
            return null;
        });

        // ── 标准外部访问接口：按契约自动注册（settings 服务） ──
        // 其余服务（session/scripts/storage/tools）暂保留旧 RPC.* 手动注册，逐步迁移。
        // expose 通过契约把 SettingsManager 的公共方法注册为 settings.getSettings / settings.saveSettings 等，
        // 同时把每个调用接入 capabilities.audit 能力监测钩子（后期填充 per-method 能力映射）。
        rpcServer.expose('settings', kernel.getSettingsManager(), {
            methods: ['getSettings', 'saveSettings', 'getSetting', 'saveSetting', 'resetSettings'],
            capabilities: kernel.capabilities as any,
        });

        rpcServer.register(RPC.STORAGE_GET_ALL, async () => {
            const storage = kernel.getStorageManager();
            const items = storage ? await storage.getAll() : {};
            return { items: Object.entries(items) };
        });

        rpcServer.register(RPC.STORAGE_SET, async (data: any) => {
            if (!data?.key) return null;
            const storage = kernel.getStorageManager();
            await storage?.set(data.key, data.value);
            const items = storage ? await storage.getAll() : {};
            return { items: Object.entries(items) };
        });

        rpcServer.register(RPC.STORAGE_DELETE, async (data: any) => {
            if (!data?.key) return null;
            const storage = kernel.getStorageManager();
            await storage?.remove(data.key);
            const items = storage ? await storage.getAll() : {};
            return { items: Object.entries(items) };
        });

        rpcServer.register(RPC.STORAGE_CLEAR, async () => {
            const storage = kernel.getStorageManager();
            await storage?.clear();
            return { items: [] };
        });

        rpcServer.register(RPC.SCRIPTS_LIST, async () => {
            const sm = kernel.getScriptsManager();
            const scripts = await sm.loadAll();
            return { scripts };
        });

        rpcServer.register(RPC.SCRIPTS_INSTALL, async (data: any) => {
            if (!data?.code) return null;
            const sm = kernel.getScriptsManager();
            await sm.install(data.code);
            const scripts = await sm.loadAll();
            return { scripts };
        });

        rpcServer.register(RPC.SCRIPTS_EDIT, async (data: any) => {
            if (!data?.id || !data?.code) return null;
            const sm = kernel.getScriptsManager();
            await sm.edit(data.id, data.code);
            const scripts = await sm.loadAll();
            return { scripts };
        });

        rpcServer.register(RPC.SCRIPTS_TOGGLE, async (data: any) => {
            if (!data?.id) return null;
            const sm = kernel.getScriptsManager();
            await sm.toggle(data.id, !!data.enabled);
            const scripts = await sm.loadAll();
            return { scripts };
        });

        rpcServer.register(RPC.SCRIPTS_UNINSTALL, async (data: any) => {
            if (!data?.id) return null;
            const sm = kernel.getScriptsManager();
            await sm.uninstall(data.id);
            const scripts = await sm.loadAll();
            return { scripts };
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