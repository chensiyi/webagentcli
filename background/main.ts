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
import { RPC, RPC_RES } from '../bridge/RPC.js';
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

        // ── Session RPC ──
        chatChannel.on(RPC.SESSION_GET_CURRENT, () => {
            const sm = kernel.getSessionManager();
            const s = sm.getCurrentSession();
            chatChannel.emit(RPC_RES.SESSION_CURRENT, {
                session: s,
                messages: s?.messages || [],
                reasoningEffort: s?.reasoningEffort || 'medium',
            });
        });

        chatChannel.on(RPC.SESSION_NEW, async () => {
            const sm = kernel.getSessionManager();
            await sm.createSession();
            const s = sm.getCurrentSession();
            chatChannel.emit(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, { sessionId: s?.id });
            chatChannel.emit(RPC_RES.SESSION_CURRENT, {
                session: s,
                messages: [],
                reasoningEffort: kernel.getSettingsManager().getSettings().reasoningEffort || 'medium',
            });
        });

        chatChannel.on(RPC.SESSION_UPDATE, async (data: any) => {
            if (!data?.sessionId) return;
            const sm = kernel.getSessionManager();
            await sm.updateSession(data.sessionId, data.data as any);
            chatChannel.emit(KernelEvents.CHAT.SESSION_UPDATED, { sessionId: data.sessionId });
        });

        chatChannel.on(RPC.SESSION_DELETE_MSG, async (data: any) => {
            if (!data?.messageId || !data?.sessionId) return;
            const sm = kernel.getSessionManager();
            const ok = await sm.deleteMessage(data.messageId, data.sessionId);
            if (ok) {
                chatChannel.emit(KernelEvents.CHAT.MESSAGE_DELETED, { messageId: data.messageId, sessionId: data.sessionId });
            }
        });

        // ── Tool RPC ──
        toolChannel.on(RPC.TOOL_LIST, () => {
            const tools = kernel.toolsManager?.getAll() || [];
            toolChannel.emit(RPC_RES.TOOL_LIST, { tools });
        });

        toolChannel.on(RPC.TOOL_TOGGLE, (data: any) => {
            if (!data?.name) return;
            const tm = kernel.toolsManager;
            if (data.enabled) tm?.enable(data.name);
            else tm?.disable(data.name);
        });
    });

    await bootloader.boot();
    log.info('BACKGROUND', `Kernel boot complete. Timings: ${JSON.stringify(bootloader.getTimings())}`);

    return kernel;
}

// 扩展安装/更新/启动时启动 Kernel
chrome.runtime.onInstalled.addListener(() => {
    bootKernel();
});

// 如果 Service Worker 被唤醒，确保 Kernel 已启动
let kernelPromise: Promise<any> | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message._ipc && !kernelPromise) {
        kernelPromise = bootKernel();
    }
});

console.log('[Background] Service worker loaded');