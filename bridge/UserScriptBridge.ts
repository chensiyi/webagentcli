/**
 * UserScriptBridge — 用户脚本世界 ↔ 内核 RPC 桥接
 *
 * 监听 chrome.runtime.onUserScriptConnect，把每个 Port 接入为独立 RPC 客户端，
 * 复用 RPCServer 已注册的全部 facade handler（session/tools/settings/scripts/...）。
 *
 * 双向通道：
 *   1. RPC 请求/响应：Port 消息 {__rpc, id, method, params} → rpcServer.dispatch() → {__rpc, id, ok, result/error}
 *   2. 流式/确认事件转发：sessionChannel 上的 STREAM_* / MESSAGE_ADDED / SESSION.CONFIRM_* 事件 → Port 消息
 *      {__event, event, data}（白名单 + __remote 过滤，避免 shell 回灌事件被二次转发）
 *   3. 控制消息：Port → {__bind, sessionId}，脚本 ensureSession 后上报自身会话，
 *      bridge 据此把该 Port 绑定到 sessionId，仅转发本会话事件（消除跨会话广播）。
 *
 * 多会话并行路由（sessionId 匹配）：
 * - 每个 Port 维护 boundSessionId（初始 null）。脚本经 {__bind} 上报后置位。
 * - 所有转发的事件（含 SESSION.CONFIRM_*）统一按「已绑定且 data.sessionId 不匹配则跳过」过滤；
 *   未绑定时维持全量转发（向后兼容旧脚本）。
 * - SESSION.CONFIRM_* 与 STREAM_* 同走 session 通道、同带 sessionId，因此路由逻辑完全统一，
 *   无需 Task 4 早期方案里「root IPC + 已转发 requestId 集合」的额外 hack。
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

/** 转发到用户脚本世界的 session 通道事件白名单（含危险工具确认闸门 SESSION.CONFIRM_*） */
const FORWARD_EVENTS = [
    KernelEvents.SESSION.STREAM_START,
    KernelEvents.SESSION.STREAM_CHUNK_APPEND,
    KernelEvents.SESSION.STREAM_UPDATE,
    KernelEvents.SESSION.STREAM_COMPLETE,
    KernelEvents.SESSION.STREAM_ERROR,
    KernelEvents.SESSION.STREAM_STOP,
    KernelEvents.SESSION.MESSAGE_ADDED,
    // 危险工具人工确认闸门：与 STREAM_* 同走 session 通道，按 boundSessionId 统一过滤
    KernelEvents.SESSION.CONFIRM_REQUEST,
    KernelEvents.SESSION.CONFIRM_RESOLVED,
];

export class UserScriptBridge {
    private rpcServer: RPCServer | null = null;
    private sessionChannel: IPC | null = null;
    private _toolChannel: IPC | null = null;
    private _bound = false;
    /** bind 之前到达的 Port 连接暂存于此（含缓冲监听），bind 后逐个处理 */
    private _pendingPorts: Array<{ port: any; bufferFn: any }> = [];
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
                // 内核尚未就绪：立即挂临时监听收下入站 RPC，避免早期消息被静默丢弃
                const bufferFn = (msg: any) => {
                    (port.__buffered ||= []).push(msg);
                };
                port.onMessage.addListener(bufferFn);
                this._pendingPorts.push({ port, bufferFn });
                // 监听断开以从暂存列表移除
                port.onDisconnect.addListener(() => {
                    const idx = this._pendingPorts.findIndex((p) => p.port === port);
                    if (idx >= 0) this._pendingPorts.splice(idx, 1);
                });
                Log.info('UserScriptBridge', `Port queued (kernel not ready), ${this._pendingPorts.length} pending`);
            }
        });
        Log.info('UserScriptBridge', `Listening for user script connections (port: "${USER_SCRIPT_PORT_NAME}")`);
    }

    /**
     * 在内核 READY 阶段调用：注入依赖并处理暂存的 Port。
     * @param sessionChannel session 通道实例——STREAM_* / MESSAGE_ADDED / SESSION.CONFIRM_* 均在此广播，
     *   桥接层只订阅它即可统一按会话路由（无需再订阅根 IPC）。
     */
    bind(rpcServer: RPCServer, sessionChannel: IPC, toolChannel: IPC | null = null): void {
        this.rpcServer = rpcServer;
        this.sessionChannel = sessionChannel;
        this._toolChannel = toolChannel;
        this._bound = true;

        // 处理暂存的 Port 连接（携带缓冲监听，bind 时移除缓冲并重放）
        const pending = this._pendingPorts;
        this._pendingPorts = [];
        for (const { port, bufferFn } of pending) {
            // 检查 port 是否仍然连接（可能用户在等待期间关闭了页面）
            try {
                this._handlePort(port, bufferFn);
            } catch {
                /* port 可能已断开 */
            }
        }
        if (pending.length > 0) {
            Log.info('UserScriptBridge', `Bound. Processing ${pending.length} pending port(s).`);
        }
    }

    private _handlePort(port: any, bufferFn?: any): void {
        if (!this.rpcServer || !this.sessionChannel) return;
        const rpcServer = this.rpcServer;
        const sessionChannel = this.sessionChannel;

        // 若有缓冲监听（bind 前到达），先移除，再挂真实 handler 并回放
        if (bufferFn) {
            try { port.onMessage.removeListener(bufferFn); } catch { /* noop */ }
        }

        Log.info('UserScriptBridge', 'Port connected');

        // 本 Port 绑定的会话（脚本经 {__bind} 上报后置位）；null=未绑定（全量转发，向后兼容）
        let boundSessionId: string | null = null;

        // 统一记录 [ipc实例, 事件名, 回调]，断开时精确 off
        const eventHandlers: Array<[IPC, string, (data: any) => void]> = [];

        const postEvent = (evt: string, data: any) => {
            try {
                port.postMessage({ __event: true, event: evt, data: sanitizeForClone(data) });
            } catch {
                /* Port 可能已断开 */
            }
        };

        // ── 事件转发：session 通道 → Port（按 boundSessionId 定向）──
        // STREAM_* / MESSAGE_ADDED / SESSION.CONFIRM_* 同走 session 通道、同带 sessionId，统一过滤路由。
        for (const evt of FORWARD_EVENTS) {
            const fn = (data: any) => {
                // 跳过 shell 回灌事件（防止 echo 循环）
                if (data && (data as any).__remote) return;
                // 已绑定会话时仅转发本会话事件；未绑定维持全量转发（向后兼容）
                if (boundSessionId && (data as any)?.sessionId !== boundSessionId) return;
                postEvent(evt, data);
            };
            sessionChannel.on(evt, fn);
            eventHandlers.push([sessionChannel, evt, fn]);
        }

        // ── 工具通道事件转发：tool:executing / tool:completed → Port（按 boundSessionId 定向）──
        // 工具执行状态与 STREAM_* 不同通道（前者在 tool 通道、后者在 session 通道），
        // 但二者同带 sessionId、路由逻辑一致，故沿用同一 boundSessionId 过滤。
        // 命名沿用内核 KernelEvents.TOOL 原值（'tool:executing' / 'tool:completed'），
        // pet 侧按字面匹配即可，无需在桥接层改写。
        if (this._toolChannel) {
            const toolEvents = [KernelEvents.TOOL.EXECUTING, KernelEvents.TOOL.COMPLETED];
            for (const evt of toolEvents) {
                const fn = (data: any) => {
                    if (data && (data as any).__remote) return;
                    if (boundSessionId && (data as any)?.sessionId !== boundSessionId) return;
                    postEvent(evt, data);
                };
                this._toolChannel.on(evt, fn);
                eventHandlers.push([this._toolChannel, evt, fn]);
            }
        }

        // ── Port 入站消息：控制消息 {__bind} 与 RPC 请求 {__rpc} ──
        const onMessage = async (msg: any) => {
            if (!msg) return;
            // 控制消息：绑定会话（脚本 ensureSession 后上报，reconnect 后会重发）
            if (msg.__bind) {
                const sid = typeof msg.sessionId === 'string' ? msg.sessionId : null;
                boundSessionId = sid;
                Log.info('UserScriptBridge', `Port bound to session: ${sid ?? '(none)'}`);
                return;
            }
            // RPC 请求：Port → rpcServer.dispatch()
            if (!msg.__rpc) return;
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

        // ── 重放 bind 前缓冲的入站消息（{__bind} / RPC 请求），消除早期发送竞态 ──
        if (bufferFn) {
            const buffered: any[] = port.__buffered || [];
            port.__buffered = null;
            for (const m of buffered) {
                try { onMessage(m); } catch { /* 缓冲消息处理异常不影响后续 */ }
            }
            if (buffered.length) {
                Log.info('UserScriptBridge', `Replayed ${buffered.length} buffered message(s)`);
            }
        }

        // ── 断开清理 ──
        port.onDisconnect.addListener(() => {
            for (const [ipc, evt, fn] of eventHandlers) {
                ipc.off(evt, fn);
            }
            Log.info('UserScriptBridge', 'Port disconnected');
        });
    }
}
