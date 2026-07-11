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
import { createSessionFacade, createToolsFacade, createStorageFacade, createScriptsFacade, createMediaFacade } from './rpc-facades.js';
import { createMediaStore } from './services/mediaStore.js';
import { Kernel } from 'kernel/Kernel.js';
import { Bootloader } from 'kernel/Bootloader.js';
import { ToolsManager } from 'kernel/services/ToolsManager.js';
import { CapabilityManager } from 'kernel/services/CapabilityManager.js';
import { ConsoleLogger } from 'kernel/services/ConsoleLogger.js';
import { SessionManager } from 'kernel/services/SessionManager.js';
import { SettingsManager } from 'kernel/services/SettingsManager.js';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { ProcessManager } from 'kernel/services/ProcessManager.js';
import { ProviderFactory } from 'kernel/services/ProviderFactory.js';
import { createChromeStorage } from './services/chromeStorage.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool, syncRegisteredScripts } from './tools/ManageUserScriptsTool.js';
import { KernelEvents, KernelChannels } from 'kernel/Events.js';
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
/** 当前已启动的内核实例（供 onSuspend 优雅清理时直接取用，免去二次 await）。 */
let activeKernel: Kernel | null = null;

/** 模块级 IPC：SW 加载时创建一次，确保 chrome 监听器只安装一次。 */
const ipc: IPC = new IPC({ origin: 'background-kernel' });
/** 供全局兜底与 boot 失败回传使用。 */
let activeIpc: IPC = ipc;

const transport = new IPCTransport(ipc, 'kernel', {
    // 每当 Shell 通过端口连接（含重连）时：确保内核已启动（保持 SW 存活），
    // 并主动推送就绪信号，使 Shell 无需依赖竞态/超时即可可靠拿到 bootComplete。
    onShellConnect: () => {
        ensureBoot()
            .then(() => ipc.emit(KernelEvents.KERNEL.BOOT_COMPLETE, { timestamp: Date.now() }))
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
    activeIpc?.emit(KernelEvents.KERNEL.CRASHED, { reason: 'unhandledrejection: ' + detail, ts: Date.now() });
    triggerReload('unhandledrejection: ' + detail);
}
function onUncaughtError(e: ErrorEvent) {
    const detail = e?.message || 'unknown';
    Log.error('BACKGROUND', 'Uncaught error', e);
    kernelCrashed = true;
    activeIpc?.emit(KernelEvents.KERNEL.CRASHED, { reason: 'error: ' + detail, ts: Date.now() });
    triggerReload('error: ' + detail);
}
(self as unknown as EventTarget).addEventListener('unhandledrejection', onUnhandledRejection as EventListener);
(self as unknown as EventTarget).addEventListener('error', onUncaughtError as EventListener);

// ── 兼容旧握手：Shell 初始 ping 回 bootComplete，但必须等内核完全启动（RPC 已暴露）后，
//    否则 Shell 收到"就绪"却调不动 RPC，导致 session.getCurrent / tools.list 超时 ──
ipc.on(KernelEvents.KERNEL.PING, () => {
    ensureBoot()
        .then(() => ipc.emit(KernelEvents.KERNEL.BOOT_COMPLETE, { ts: Date.now() }))
        .catch(() => { /* 启动失败已通过 kernel:bootError 暴露 */ });
});

function ensureBoot(): Promise<any> {
    if (!bootPromise) {
        bootPromise = bootKernel()
            .then((k: any) => k)
            .catch((err) => {
                bootPromise = null; // 允许下次唤醒时重试
                Log.error('BACKGROUND', 'Kernel boot failed', err);
                activeIpc?.emit(KernelEvents.KERNEL.BOOT_ERROR, { message: String((err as Error)?.message || err) });
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

    const kernel = new Kernel({
        ipc,
        origin: 'webagentcli-bg',
    });

    const bootloader = new Bootloader(kernel);

    // ─── Phase 1: INIT ───
    bootloader.on(Bootloader.PHASES.INIT, async () => {
        log.info('BACKGROUND', 'IPC ready');
    });

    // ─── Phase 2: REGISTER ───
    bootloader.on(Bootloader.PHASES.REGISTER, async () => {
        // 组装根统一创建**唯一**存储实例并注入内核：内核只依赖 IStorageManager 接口，
        // 不直接触碰 chrome，也不存在中转/代理类（原 ChromeStorageAdapter 已移除）。
        const storage = createChromeStorage();

        // 工具管理 / 能力门控：与其余 Manager 一样走常规注册路径（不再构造器注入）
        // ToolsManager 注入 ipc：注册/注销/启用/禁用时经 TOOL 通道广播 CHANGED，
        // 供 UI（ToolsPage）与后续 P1/P2 动态注册实时反映。
        kernel.register('toolsManager', async () => {
            const mgr = new ToolsManager({ ipc, storage });
            await mgr.init();
            return mgr;
        }, { dependsOn: ['storageManager'] });
        kernel.register('capabilities', async () => new CapabilityManager());

        kernel.register('storageManager', async () => storage);

        kernel.register('sessionManager', async () => {
            // init()（原 initialize）由 Kernel._initService 在 boot 阶段按 init(kernel) 契约自动调用
            return new SessionManager({ ipc, storage, log });
        }, { dependsOn: ['storageManager'] });

        kernel.register('settingsManager', async () => {
            return new SettingsManager({ ipc, storage });
        }, { dependsOn: ['storageManager'] });

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

        // 注册内置工具（直接传实例：RunUserScriptTool 无参，ManageUserScriptsTool 需内核引用）
        // toolsManager 已在 kernel.boot() 期间初始化，此处经 getter 取实例
        const toolsManager = kernel.getToolsManager();
        const builtInTools = [new RunUserScriptTool(), new ManageUserScriptsTool(kernel)];
        builtInTools.forEach((tool) => {
            if (!tool || !tool.name) return;
            try {
                toolsManager.register(tool);
                log.info('BACKGROUND', `Tool registered: ${tool.name}`);
            } catch (e) {
                log.warn('BACKGROUND', 'Failed to register tool', e);
            }
        });

        // 加载配置
        const settingsManager = kernel.getSettingsManager();
        await settingsManager.loadSettings();
        log.info('BACKGROUND', 'Settings loaded');
        // 注意：kernel:bootComplete 统一在 bootKernel() resolve 后由 onShellConnect 的 .then 发出，
        // 此时 Phase 4(READY) 已完成、RPC 服务已暴露，Shell 收到后即可安全调用 RPC，避免竞态超时。
    });

    // ─── Phase 4: Shell 事件转义 + RPC ───
    bootloader.on(Bootloader.PHASES.READY, async () => {
        // 会话通道：RPC facade（createSessionFacade）直接驱动编排并把流式/生命周期事件回灌此通道
        const sessionChannel = ipc.getOrCreateChannel(KernelChannels.SESSION);

        // ── RPC 分发（统一请求 ID 关联，错误回传，边界 sanitize） ──
        const rpcServer = new RPCServer(ipc);

        rpcServer.expose('session', createSessionFacade(kernel, sessionChannel), {
            methods: ['getCurrent', 'create', 'update', 'deleteMessage', 'list', 'switch', 'delete', 'clearMessages', 'send', 'stop'],
            capabilities: kernel.getCapabilities() as any,
        });
        rpcServer.expose('tools', createToolsFacade(kernel), {
            methods: ['list', 'toggle'],
            capabilities: kernel.getCapabilities() as any,
        });
        rpcServer.expose('settings', kernel.getSettingsManager(), {
            methods: ['getSettings', 'saveSettings', 'getSetting', 'saveSetting', 'resetSettings'],
            capabilities: kernel.getCapabilities() as any,
        });
        rpcServer.expose('storage', createStorageFacade(kernel), {
            methods: ['getAll', 'set', 'remove', 'clear'],
            capabilities: kernel.getCapabilities() as any,
        });
        rpcServer.expose('scripts', createScriptsFacade(kernel), {
            methods: ['list', 'install', 'edit', 'toggle', 'uninstall'],
            capabilities: kernel.getCapabilities() as any,
        });

        // 媒体二进制存储（可插拔后端：本地 IndexedDB / 远端资源服务器，按设置切换）
        // 消息只持 mediaId 引用，避免 chrome.storage 配额膨胀
        const mediaStore = createMediaStore(() => kernel.getSettingsManager().getSettings());
        rpcServer.expose('media', createMediaFacade(mediaStore), {
            methods: ['put', 'get', 'getMany', 'delete'],
            capabilities: kernel.getCapabilities() as any,
        });

        // 媒体解析回调：编排层发送前经此把 mediaId 换成实际内容（dataURL 或远端 URL）
        kernel.setMediaResolver((id: string) => mediaStore.get(id).catch(() => null));
        // 媒体回收回调：删除会话/消息时经此连带清理二进制（best-effort，单条失败不影响整体删除）
        kernel.setMediaDeleter(async (ids: string[]) => {
          const list = (ids || []).filter(Boolean);
          if (list.length === 0) return;
          await Promise.all(list.map((id) => mediaStore.delete(id).catch(() => {})));
        });

        // 首次（每次 SW 唤醒）内核启动完毕时，把已启用的用户脚本注册到 chrome.userScripts。
        // 注册是持久化的，SW/内核被回收后注入仍继续；此处保证「内核启动完毕」即完成注入初始化。
        // 放在 READY 末尾并 await：bootComplete 在本函数完成后才发出，Shell 侧 waitKernelReady
        // 会在「内核就绪 + 首次注入注册完成」之后才放行，彻底消除唤醒竞态。
        await syncRegisteredScripts(kernel.getScriptsManager());
    });

    await bootloader.boot();
    log.info('BACKGROUND', `Kernel boot complete. Timings: ${JSON.stringify(bootloader.getTimings())}`);

    activeKernel = kernel; // 供 onSuspend 优雅清理取用
    return kernel;
}

// 扩展安装/更新时启动 Kernel（仅一次）
chrome.runtime.onInstalled.addListener(() => {
    ensureBoot();
    // 点击工具栏图标即打开侧边栏（MV3 默认行为兜底）
    chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

// SW 即将被浏览器回收前：优雅清理内核（清定时器、off 监听、取消活跃进程）。
// onSuspend 非可延长事件，无法可靠 await，故 fire-and-forget；shutdown 内部按 RUNNING 守卫，
// 未启动/已崩溃的内核直接跳过，幂等安全。
chrome.runtime.onSuspend.addListener(() => {
    if (activeKernel && !kernelCrashed) {
        void activeKernel.shutdown().catch((e) => {
            Log.error('BACKGROUND', 'Kernel shutdown on suspend failed', e);
        });
    }
});

console.log('[Background] Service worker loaded');
