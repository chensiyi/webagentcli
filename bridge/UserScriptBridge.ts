/**
 * UserScriptBridge — 用户脚本世界 ↔ 内核 RPC 桥接
 *
 * 监听 chrome.runtime.onUserScriptConnect，把每个 Port 接入为独立 RPC 客户端，
 * 复用 RPCServer 已注册的全部 facade handler（session/tools/settings/scripts/...）。
 *
 * 双向通道：
 *   1. RPC 请求/响应：Port 消息 {__rpc, id, method, params} → rpcServer.dispatch() → {__rpc, id, ok, result/error}
 *   2. 流式事件转发：sessionChannel 上的 STREAM_* / MESSAGE_ADDED 事件 → Port 消息 {__event, event, data}
 *      （白名单 + __remote 过滤，避免 shell 回灌事件被二次转发）
 *
 * MV3 SW 生命周期适配（init/bind 分离）：
 * - init() 必须在 SW 脚本顶层同步调用，确保 onUserScriptConnect 监听器在 SW 唤醒时立即可用。
 *   否则 SW 被回收后重新唤醒时，pet-chat.js 的 connect() 会因监听器未注册而
 *   "Could not establish connection. Receiving end does not exist."
 * - bind() 在内核 READY 阶段调用，注入 rpcServer + sessionChannel。
 * - 在 bind 之前到达的 Port 连接会被暂存，bind 后自动处理。
 *
 * 设计要点：
 * - 不创建独立 IPC 实例，直接调 rpcServer.dispatch() 绕过 IPC 传输层
 * - 每个 Port 独立订阅 session 通道事件，断开时精确清理（不影响其他 Port 或 IPCTransport）
 * - 所有出 Port 数据经 sanitizeForClone 净化，保证结构化克隆安全
 */

import { IPC } from 'kernel/IPC.js';
import { RPCServer } from 'bridge/RPC.js';
import { Log } from 'kernel/services/Log.js';
import { sanitizeForClone } from 'bridge/serialize.js';
import { KernelEvents } from 'kernel/Events.js';

export const USER_SCRIPT_PORT_NAME = 'webagent-us-rpc';

/** 转发到用户脚本世界的 session 通道事件白名单 */
const FORWARD_EVENTS = [
    KernelEvents.SESSION.STREAM_START,
    KernelEvents.SESSION.STREAM_CHUNK_APPEND,
    KernelEvents.SESSION.STREAM_UPDATE,
    KernelEvents.SESSION.STREAM_COMPLETE,
    KernelEvents.SESSION.STREAM_ERROR,
    KernelEvents.SESSION.STREAM_STOP,
    KernelEvents.SESSION.MESSAGE_ADDED,
];

export class UserScriptBridge {
    private rpcServer: RPCServer | null = null;
    private sessionChannel: IPC | null = null;
    private _bound = false;
    /** bind 之前到达的 Port 连接暂存于此，bind 后逐个处理 */
    private _pendingPorts: any[] = [];
    /** 选项：用户脚本世界连接时回调（用于触发内核启动/保活，对称于 IPCTransport 的 onShellConnect） */
    private _opts: { onUserScriptConnect?: () => void | Promise<void> } = {};

    /**
     * 在 SW 顶层同步调用：注册 onUserScriptConnect 监听器。
     * 此时 rpcServer / sessionChannel 尚未创建，Port 连接会被暂存。
     * @param opts.onUserScriptConnect 每当用户脚本世界经 Port 连接（含 SW 回收后重连）时调用；
     *   典型用途：触发内核启动（ensureBoot）并保持 SW 存活，使宠物作为独立入口时即便侧栏关闭
     *   也能可靠启动内核、处理暂存 Port，避免 RPC 永久挂起。
     */
    init(opts: { onUserScriptConnect?: () => void | Promise<void> } = {}): void {
        this._opts = opts;
        const usc = (chrome.runtime as any).onUserScriptConnect;
        if (typeof usc?.addListener !== 'function') {
            Log.warn('UserScriptBridge', 'onUserScriptConnect not available (Chrome < 120 or userScripts disabled)');
            return;
        }
        usc.addListener((port: any) => {
            if (port.name !== USER_SCRIPT_PORT_NAME) return;
            // 用户脚本世界连接即视为一次唤醒：确保内核已启动（保持 SW 存活），
            // 否则 SW 回收后仅靠宠物端口唤醒时内核永不启动、暂存 Port 永不处理。
            try {
                Promise.resolve(this._opts.onUserScriptConnect?.()).catch((e) =>
                    Log.error('UserScriptBridge', 'onUserScriptConnect failed', e)
                );
            } catch (e) {
                Log.error('UserScriptBridge', 'onUserScriptConnect threw', e);
            }
            if (this._bound) {
                this._handlePort(port);
            } else {
                // 内核尚未就绪，暂存 Port（Chrome 会在 onMessage 监听器添加前缓冲消息）
                this._pendingPorts.push(port);
                // 监听断开以从暂存列表移除
                port.onDisconnect.addListener(() => {
                    const idx = this._pendingPorts.indexOf(port);
                    if (idx >= 0) this._pendingPorts.splice(idx, 1);
                });
                Log.info('UserScriptBridge', `Port queued (kernel not ready), ${this._pendingPorts.length} pending`);
            }
        });
        Log.info('UserScriptBridge', `Listening for user script connections (port: "${USER_SCRIPT_PORT_NAME}")`);
    }

    /**
     * 在内核 READY 阶段调用：注入依赖并处理暂存的 Port。
     */
    bind(rpcServer: RPCServer, sessionChannel: IPC): void {
        this.rpcServer = rpcServer;
        this.sessionChannel = sessionChannel;
        this._bound = true;

        // 处理暂存的 Port 连接
        const pending = this._pendingPorts;
        this._pendingPorts = [];
        for (const port of pending) {
            // 检查 port 是否仍然连接（可能用户在等待期间关闭了页面）
            try {
                this._handlePort(port);
            } catch {
                /* port 可能已断开 */
            }
        }
        if (pending.length > 0) {
            Log.info('UserScriptBridge', `Bound. Processing ${pending.length} pending port(s).`);
        }
    }

    private _handlePort(port: any): void {
        if (!this.rpcServer || !this.sessionChannel) return;
        const rpcServer = this.rpcServer;
        const sessionChannel = this.sessionChannel;

        Log.info('UserScriptBridge', 'Port connected');

        // ── 事件转发：session 通道 → Port ──
        const eventHandlers: Array<[string, (data: any) => void]> = [];
        for (const evt of FORWARD_EVENTS) {
            const fn = (data: any) => {
                // 跳过 shell 回灌事件（防止 echo 循环）
                if (data && (data as any).__remote) return;
                try {
                    port.postMessage({
                        __event: true,
                        event: evt,
                        data: sanitizeForClone(data),
                    });
                } catch {
                    /* Port 可能已断开 */
                }
            };
            sessionChannel.on(evt, fn);
            eventHandlers.push([evt, fn]);
        }

        // ── RPC 请求：Port → rpcServer.dispatch() ──
        const onMessage = async (msg: any) => {
            if (!msg || !msg.__rpc) return;
            const { id, method, params } = msg;
            const resp = await rpcServer.dispatch(method, params);
            try {
                port.postMessage({
                    __rpc: true,
                    id,
                    ok: resp.ok,
                    result: resp.result,
                    error: resp.error,
                });
            } catch {
                /* Port 可能已断开 */
            }
        };
        port.onMessage.addListener(onMessage);

        // ── 断开清理 ──
        port.onDisconnect.addListener(() => {
            for (const [evt, fn] of eventHandlers) {
                sessionChannel.off(evt, fn);
            }
            Log.info('UserScriptBridge', 'Port disconnected');
        });
    }
}
