/**
 * sidepanel/main.ts — UI Shell 入口
 *
 * 职责：
 * - 通过 IPCTransport 连接 background Kernel
 * - 渲染 Svelte UI 组件
 * - 转发用户操作到 Kernel
 */

import { mount } from 'svelte';
import Sidepanel from './Sidepanel.svelte';
import './styles/tokens.css';
import './styles/utilities.css';
import './styles/components.css';
import './styles/pages.css';

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from 'kernel/IPCTransport.js';
import { ConsoleLogger } from 'kernel/services/ConsoleLogger.js';

async function init() {
    console.log('[Shell] Initializing...');

    const log = new ConsoleLogger();
    const ipc = new IPC({ origin: 'sidepanel-shell' });

    // IPC 远程传输：连接 background Kernel
    const transport = new IPCTransport(ipc, 'shell');
    transport.init();

    // 等待 Kernel 就绪
    await new Promise<void>((resolve) => {
        const unsub = ipc.on('kernel:bootComplete', () => {
            unsub();
            log.info('SHELL', 'Kernel ready');
            resolve();
        });
        // 如果 Kernel 已经就绪但事件已错过，发送查询
        ipc.emit('kernel:ping', {});
        // 超时保护：3 秒后即使没收到也继续
        setTimeout(() => {
            unsub();
            log.warn('SHELL', 'Kernel not responding, continuing anyway');
            resolve();
        }, 3000);
    });

    // 挂载侧边栏 Shell
    const root = document.getElementById('root');
    if (!root) {
        console.error('[Shell] #root element not found');
        return;
    }

    mount(Sidepanel, {
        target: root,
        props: { kernel: null }, // kernel 为 null，通过 IPCTransport 远程调用
    });

    console.log('[Shell] Mounted successfully');
}

window.addEventListener('load', init);