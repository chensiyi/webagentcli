/**
 * IPCTransport — IPC 远程传输层
 *
 * 职责：使 IPC 事件能跨 Service Worker ↔ Sidepanel 传输
 *
 * 原理：
 * - 在 IPC 中间件中拦截所有事件，通过 chrome.runtime.sendMessage 转发到远端
 * - 收到来自远端的消息，注入到本地 IPC 事件总线
 * - 通过 origin='remote' 标记防止循环转发
 *
 * 使用方式：
 *   // background 端
 *   const transport = new IPCTransport(ipc, 'kernel');
 *   transport.init();
 *
 *   // sidepanel 端
 *   const transport = new IPCTransport(ipc, 'shell');
 *   transport.init();
 *
 *   // 之后 IPC.emit() 的事件会自动跨上下文传输
 */

import { IPC } from './IPC.js';
import { Log } from './services/Log.js';

export class IPCTransport {
    private ipc: IPC;
    private _side: 'kernel' | 'shell';
    private _unuse: (() => void) | null = null;

    constructor(ipc: IPC, side: 'kernel' | 'shell') {
        this.ipc = ipc;
        this._side = side;
    }

    /**
     * 初始化传输层：
     * 1. 注册 IPC 中间件，将事件转发到远端
     * 2. 监听 chrome.runtime.onMessage，接收远端事件
     */
    init(): void {
        // 注册中间件：将本地事件转发到远端
        this._unuse = this.ipc.use((message, next) => {
            // 来自远端的消息，已有 _remote 标记，不再转发回去
            if (message.data && (message.data as any).__remote) return next();

            // 通过 runtime 转发到远端
            chrome.runtime.sendMessage({
                _ipc: true,
                event: message.event,
                data: message.data,
                id: message.id,
                timestamp: message.timestamp
            }).catch(() => {
                // 远端可能未就绪，忽略错误
            });

            return next();
        });

        // 接收来自远端的消息
        chrome.runtime.onMessage.addListener((message) => {
            if (!message._ipc) return;

            // 用 __remote 标记数据，防止中间件再转发回去
            this.ipc.emit(message.event, { ...message.data, __remote: true });
        });

        Log.info('IPCTransport', `Transport initialized (side=${this._side})`);
    }

    /**
     * 销毁传输层，移除中间件
     */
    destroy(): void {
        if (this._unuse) {
            this._unuse();
            this._unuse = null;
        }
        Log.info('IPCTransport', 'Transport destroyed');
    }
}