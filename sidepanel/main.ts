/**
 * sidepanel/main.ts — UI Shell 入口
 *
 * 职责：
 * - 创建 IPC 实例，通过 IPCTransport 连接 background Kernel
 * - 渲染 Svelte UI 组件
 * - 所有页面通过 IPC 通道与 Kernel 通信，不直接访问 kernel 模块
 */

import { mount } from 'svelte';
import Sidepanel from './Sidepanel.svelte';
import './styles/tokens.css';
import './styles/utilities.css';
import './styles/components.css';
import './styles/pages.css';

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from '../bridge/IPCTransport.js';
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

    // 挂载侧边栏 Shell，注入 IPC 实例
    const root = document.getElementById('root');
    if (!root) {
        console.error('[Shell] #root element not found');
        return;
    }

    mount(Sidepanel, {
        target: root,
        props: { ipc }, // 注入 IPC 实例，页面通过 IPC 通道与 Kernel 通信
    });

    console.log('[Shell] Mounted successfully');
}

window.addEventListener('load', init);
