/**
 * IPCTransport 集成测试 —— 验证 kernel <-> shell 跨进程链路（Port 长连接版）
 *
 * 通过桩掉 chrome.runtime.connect / onConnect / Port，
 * 模拟真实扩展环境里 shell 发 RPC、kernel 处理并回传响应，以及连接触发 onShellConnect 钩子。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IPC } from 'kernel/IPC.js';
import { IPCTransport, IPC_PORT_NAME } from './IPCTransport.js';

function installChromeStub() {
  const onConnectListeners: Array<(port: any) => void> = [];
  let lastError: any = undefined;

  // 创建一对互联的端口：postMessage 投递到对端 onMessage；对端监听器未挂好时缓冲，挂好后 flush
  function makePort(): any {
    const self: any = {
      name: IPC_PORT_NAME,
      _peer: null as any,
      _msgListeners: [] as Array<(m: any) => void>,
      _incoming: [] as any[],
      _discListeners: [] as Array<() => void>,
      onMessage: {
        addListener: (l: any) => {
          self._msgListeners.push(l);
          // 监听器挂上后，flush 之前缓冲的消息（模拟 Chrome 端口消息缓冲）
          if (self._incoming.length) {
            const q = self._incoming;
            self._incoming = [];
            for (const m of q) for (const l2 of self._msgListeners) { try { l2(m); } catch { /* ignore */ } }
          }
        },
      },
      onDisconnect: { addListener: (l: any) => self._discListeners.push(l) },
      postMessage: (m: any) => {
        const peer = self._peer;
        if (!peer) return;
        if (peer._msgListeners.length > 0) {
          for (const l of peer._msgListeners) { try { l(m); } catch { /* ignore */ } }
        } else {
          peer._incoming.push(m); // 对端尚未 attach，缓冲
        }
      },
      disconnect: () => {
        for (const l of self._discListeners) { try { l(); } catch { /* ignore */ } }
      },
    };
    return self;
  }

  (globalThis as any).chrome = {
    runtime: {
      get lastError() { return lastError; },
      set lastError(v: any) { lastError = v; },
      onConnect: { addListener: (l: any) => onConnectListeners.push(l) },
      connect: (_opts?: any) => {
        const kernelPort = makePort();
        const shellPort = makePort();
        kernelPort._peer = shellPort;
        shellPort._peer = kernelPort;
        // 模拟 Chrome：onConnect 异步触发（SW 侧 listener 在侧边栏 connect 返回后才触发）
        setTimeout(() => {
          for (const l of onConnectListeners) { try { l(kernelPort); } catch { /* ignore */ } }
        }, 0);
        return shellPort;
      },
    },
  };

  return { onConnectListeners };
}

describe('IPCTransport kernel<->shell 链路（Port 版）', () => {
  beforeEach(() => {
    installChromeStub();
  });

  it('shell 发送事件能被 kernel 处理并回传响应到 shell', async () => {
    // ---- kernel 侧 ----
    const bgIpc = new IPC({ origin: 'bg' });
    const bg = new IPCTransport(bgIpc, 'kernel');
    bg.init();
    const bgChat = bgIpc.getOrCreateChannel('chat');
    bgChat.on('rpc:echo', (d: any) => bgChat.emit('rpc:echo:res', { got: d.v }));

    // ---- shell 侧 ----
    const shIpc = new IPC({ origin: 'sh' });
    const sh = new IPCTransport(shIpc, 'shell');
    sh.init();
    const shChat = shIpc.getOrCreateChannel('chat');

    const result = await new Promise((resolve) => {
      shChat.on('rpc:echo:res', (d: any) => resolve(d));
      shChat.emit('rpc:echo', { v: 42 });
      setTimeout(() => resolve('TIMEOUT'), 600);
    });

    expect(result).toMatchObject({ got: 42 });
  });

  it('kernel emit bootComplete，shell 能收到', async () => {
    const bgIpc = new IPC({ origin: 'bg' });
    const bg = new IPCTransport(bgIpc, 'kernel');
    bg.init();

    const shIpc = new IPC({ origin: 'sh' });
    const sh = new IPCTransport(shIpc, 'shell');
    sh.init();

    const got = await new Promise((resolve) => {
      shIpc.on('kernel:bootComplete', (d: any) => resolve(d));
      // 真实时序：内核端口在 onConnect（异步）后才就绪，这里等连接建立再 emit
      setTimeout(() => bgIpc.emit('kernel:bootComplete', { ok: true }), 20);
      setTimeout(() => resolve('TIMEOUT'), 600);
    });

    expect(got).not.toEqual('TIMEOUT');
  });

  it('Shell 连接时触发 onShellConnect 钩子（SW 保活 / 推送就绪）', async () => {
    let hooked = false;
    const bgIpc = new IPC({ origin: 'bg' });
    const bg = new IPCTransport(bgIpc, 'kernel', {
      onShellConnect: () => {
        hooked = true;
        // 模拟 background/main.ts：内核就绪后主动推送 bootComplete
        bgIpc.emit('kernel:bootComplete', { timestamp: Date.now() });
      },
    });
    bg.init();

    const shIpc = new IPC({ origin: 'sh' });
    const sh = new IPCTransport(shIpc, 'shell');

    const got = new Promise((resolve) => {
      shIpc.on('kernel:bootComplete', (d: any) => resolve(d));
    });

    sh.init(); // 同步 connect；内核 onConnect 异步触发

    const d = await got; // 等待异步连接 + 内核推送 bootComplete
    expect(d).not.toEqual(null);
    expect(hooked).toBe(true); // onConnect 已触发
  });
});
