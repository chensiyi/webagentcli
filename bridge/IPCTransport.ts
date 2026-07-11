/**
 * IPCTransport — IPC 远程传输层（Port 长连接版）
 *
 * 职责：使 IPC 事件能跨 Service Worker ↔ Sidepanel 可靠传输。
 *
 * 为什么用 chrome.runtime.connect（长连接 Port）而不是 chrome.runtime.sendMessage：
 *   1. 【SW 保活】Port 打开期间 Chrome 保证 Service Worker 不被回收。这从根上消灭了
 *      "请求发出去、响应回来前 SW 被回收 → RPC Promise 永久挂起 / 侧边栏无服务" 这类
 *      MV3 经典崩溃。旧的 sendMessage 方案只能靠 return bootPromise 这类 hack 勉强续命。
 *   2. 【可靠投递】Port 是双向持久通道，消息不会因 SW 休眠而静默丢失。
 *   3. 【断线自愈】onDisconnect 后自动重连；重连后内核重新推送 bootComplete，Shell 重新拉取状态。
 *
 * 使用方式：
 *   // background 端（内核）
 *   const transport = new IPCTransport(ipc, 'kernel', {
 *     onShellConnect: () => ensureBoot().then(() => ipc.emit('kernel:bootComplete', { timestamp: Date.now() })),
 *   });
 *   transport.init();
 *
 *   // sidepanel 端（Shell）
 *   const transport = new IPCTransport(ipc, 'shell');
 *   transport.init();   // 内部自动 chrome.runtime.connect 并自动重连
 *
 * 所有跨进程数据都会在 _post 边界经 sanitizeForClone 净化（结构化克隆安全 + 永不抛异常），
 * 作为最后一道防线。
 *
 * 注：此文件依赖 chrome.runtime，仅用于 Chrome Extension 环境。
 */

import { IPC } from 'kernel/IPC.js';
import { Log } from 'kernel/services/Log.js';
import { sanitizeForClone } from './serialize.js';

export const IPC_PORT_NAME = 'webagent-ipc';

export interface IPCTransportOptions {
    /**
     * 内核侧：每当 Shell 通过端口连接（含重连）时调用。
     * 典型用途：触发内核启动并保持 SW 存活，然后主动推送 kernel:bootComplete，
     * 使 Shell 无需依赖竞态/超时即可可靠拿到就绪信号。
     */
    onShellConnect?: () => void | Promise<void>;
}

export class IPCTransport {
    private ipc: IPC;
    private _side: 'kernel' | 'shell';
    private _opts: IPCTransportOptions;
    private _unuses: (() => void)[] = [];
    /** 已接入传输层的通道：'__root__' 表示主 IPC，其余为命名子通道 */
    private _channels: Map<string, IPC> = new Map();
    /** 当前活跃的端口（内核侧可能有多个 Shell 连接，这里只保留最近一个） */
    private port: any = null;
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _disposed = false;

    constructor(ipc: IPC, side: 'kernel' | 'shell', opts: IPCTransportOptions = {}) {
        this.ipc = ipc;
        this._side = side;
        this._opts = opts;
    }

    /**
     * 为指定 IPC 实例挂接转发中间件，并把通道登记到 _channels。
     * @param name 通道名（主 IPC 用 '__root__'）
     * @param channel 对应的 IPC 实例
     */
    private _wrapChannel(name: string, channel: IPC): void {
        if (this._channels.has(name)) return;
        this._channels.set(name, channel);

        const unuse = channel.use((message, next) => {
            // 来自远端的消息，已有 __remote 标记，不再转发回去
            if (message.data && (message.data as any).__remote) return next();

            // 边界序列化：保证所有跨进程数据都可结构化克隆，且永不抛异常。
            // 无论 handler 返回什么（循环引用、函数、Svelte $state Proxy 等），都在这里被安全净化。
            const safeData = sanitizeForClone(message.data);

            const envelope = {
                _ipc: true,
                channel: name === '__root__' ? undefined : name,
                event: message.event,
                data: safeData,
                id: message.id,
                timestamp: message.timestamp,
            };

            this._post(envelope);
            return next();
        });

        this._unuses.push(unuse);
    }

    /** 通过活跃端口发送信封；无连接时静默丢弃（Shell 会在重连后重新拉取状态）。 */
    private _post(envelope: any): void {
        if (!this.port) return;
        try {
            this.port.postMessage(envelope);
        } catch (err) {
            Log.warn('IPCTransport', `postMessage dropped: ${String((err as Error)?.message || err)}`);
        }
    }

    /**
     * 初始化传输层：
     * 1. 为主 IPC 及之后创建的命名子通道挂接转发中间件
     * 2. 内核侧监听 chrome.runtime.onConnect；Shell 侧主动 chrome.runtime.connect
     * 3. 双向消息经端口 postMessage 传输，入站消息按通道名路由到对应 IPC 实例
     */
    init(): void {
        // 主 IPC 通道
        this._wrapChannel('__root__', this.ipc);

        // 拦截 getOrCreateChannel：后续创建的子通道也自动接入传输层
        const self = this;
        const origGetChannel = this.ipc.getOrCreateChannel.bind(this.ipc);
        (this.ipc as any).getOrCreateChannel = function (name: string): IPC {
            const ch = origGetChannel(name);
            self._wrapChannel(name, ch);
            return ch;
        };

        if (this._side === 'kernel') {
            chrome.runtime.onConnect.addListener((port: any) => {
                if (port.name !== IPC_PORT_NAME) return;
                self._accept(port);
            });
        } else {
            this._connect();
        }

        Log.info('IPCTransport', `Transport initialized (side=${this._side}, port-based)`);
    }

    // ─── Shell 侧：发起并维护长连接 ───

    private _connect(): void {
        if (this._disposed) return;
        try {
            const port = chrome.runtime.connect({ name: IPC_PORT_NAME });
            this._attach(port);
        } catch (err) {
            Log.warn('IPCTransport', `connect failed, will retry: ${String((err as Error)?.message || err)}`);
            this._scheduleReconnect();
        }
    }

    private _scheduleReconnect(): void {
        if (this._reconnectTimer || this._disposed) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._connect();
        }, 800);
    }

    // ─── 内核侧：接受 Shell 连接 ───

    private _accept(port: any): void {
        this._attach(port);
        // 触发内核启动 + 推送就绪信号（保证 SW 在连接期间存活，Shell 可靠拿到 bootComplete）
        try {
            Promise.resolve(this._opts.onShellConnect?.()).catch((e) =>
                Log.error('IPCTransport', 'onShellConnect failed', e)
            );
        } catch (e) {
            Log.error('IPCTransport', 'onShellConnect threw', e);
        }
    }

    // ─── 共用：把端口挂到传输层 ───

    private _attach(port: any): void {
        this.port = port;
        const self = this;

        port.onMessage.addListener((message: any) => {
            if (!message || !message._ipc) return;

            let target: IPC;
            if (message.channel) {
                target = self._channels.get(message.channel) ?? (self.ipc as any).getOrCreateChannel(message.channel);
            } else {
                target = self.ipc;
            }

            // 用 __remote 标记数据，防止中间件再转发回去
            target.emit(message.event, { ...message.data, __remote: true });
        });

        port.onDisconnect.addListener(() => {
            if (self.port === port) self.port = null;
            const err = chrome.runtime.lastError;
            if (err) Log.warn('IPCTransport', `port disconnected: ${err.message}`);
            // Shell 侧在断开后自动重连；内核侧无需动作（等待下一次连接）
            if (self._side === 'shell' && !self._disposed) {
                self._scheduleReconnect();
            }
        });

        Log.info('IPCTransport', `port attached (side=${self._side})`);
    }

    /**
     * 销毁传输层，移除所有中间件与重连定时器
     */
    destroy(): void {
        this._disposed = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.port) {
            try {
                this.port.disconnect();
            } catch {
                /* 端口可能已断 */
            }
            this.port = null;
        }
        this._unuses.forEach((u) => u());
        this._unuses = [];
        this._channels.clear();
        Log.info('IPCTransport', 'Transport destroyed');
    }
}
