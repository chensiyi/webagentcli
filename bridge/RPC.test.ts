/**
 * RPC 重设计后的回归测试：
 * 1. sanitizeForClone 必须永不抛异常，且正确处理循环引用 / 函数 / 特殊类型
 * 2. RPCClient.call ↔ RPCServer.register 跨进程往返（请求 ID 关联）
 * 3. handler 抛错时错误以 rejected Promise 回传（而非静默失败 / 爆栈）
 * 4. RPC 方法名全局唯一（杜绝旧版「请求名 == 响应名」碰撞）
 * 5. Tool 含函数，必须经 toJSON 剥离后才能结构化克隆
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IPC } from '../kernel/IPC.js';
import { IPCTransport } from './IPCTransport.js';
import { RPC, RPCClient, RPCServer, createApiClient } from './RPC.js';
import { sanitizeForClone } from './serialize.js';
import { Tool } from '../kernel/models/Tool.js';

function installChromeStub() {
  const onConnectListeners: Array<(port: any) => void> = [];
  let lastError: any = undefined;

  function makePort(): any {
    const self: any = {
      name: 'webagent-ipc',
      _peer: null as any,
      _msgListeners: [] as Array<(m: any) => void>,
      _incoming: [] as any[],
      _discListeners: [] as Array<() => void>,
      onMessage: {
        addListener: (l: any) => {
          self._msgListeners.push(l);
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
          peer._incoming.push(m);
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
        setTimeout(() => {
          for (const l of onConnectListeners) { try { l(kernelPort); } catch { /* ignore */ } }
        }, 0);
        return shellPort;
      },
    },
  };
}

describe('sanitizeForClone', () => {
  it('永不抛异常，循环引用降级为 [Circular]', () => {
    const a: any = { name: 'a' };
    a.self = a; // 循环引用
    let out: any;
    expect(() => { out = sanitizeForClone(a); }).not.toThrow();
    expect(out.self).toBe('[Circular]');
  });

  it('函数与 symbol 降级为 null', () => {
    const v = { fn: () => 1, sym: Symbol('x'), n: 5 };
    const out = sanitizeForClone(v);
    expect(out.fn).toBeNull();
    expect(out.sym).toBeNull();
    expect(out.n).toBe(5);
  });

  it('Date / Map / Set / Error 转为可还原的纯对象', () => {
    const v = {
      d: new Date('2020-01-01T00:00:00Z'),
      m: new Map([['k', 1]]),
      s: new Set([1, 2]),
      e: new Error('boom'),
    };
    const out = sanitizeForClone(v);
    expect(out.d).toEqual({ __type: 'Date', value: '2020-01-01T00:00:00.000Z' });
    expect(out.m).toEqual({ __type: 'Map', value: [['k', 1]] });
    expect(out.s).toEqual({ __type: 'Set', value: [1, 2] });
    expect(out.e.__type).toBe('Error');
    expect(out.e.message).toBe('boom');
  });

  it('含函数的对象也能被 structuredClone（边界安全保证）', () => {
    const v = { a: 1, handler: () => 'x' };
    let cloned: any;
    expect(() => { cloned = structuredClone(sanitizeForClone(v)); }).not.toThrow();
    expect(cloned.a).toBe(1);
    expect(cloned.handler).toBeNull();
  });
});

describe('RPCClient ↔ RPCServer', () => {
  beforeEach(() => installChromeStub());

  it('shell call 能被 kernel handler 处理并返回关联结果', async () => {
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.register(RPC.SESSION_LIST, () => ({ sessions: [{ id: 's1' }] }));

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);

    const res = await client.call<{ sessions: any[] }>(RPC.SESSION_LIST);
    expect(res.sessions).toEqual([{ id: 's1' }]);
  });

  it('handler 抛错时，client 收到 rejected Promise（错误回传，不静默）', async () => {
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.register(RPC.SETTINGS_GET, () => { throw new Error('kaboom'); });

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);

    await expect(client.call(RPC.SETTINGS_GET)).rejects.toThrow('kaboom');
  });

  it('并发多个请求各自正确关联（不会串台）', async () => {
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.register('echo', (p: any) => ({ echo: p.v }));

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);

    const [r1, r2] = await Promise.all([
      client.call<{ echo: number }>('echo', { v: 1 }),
      client.call<{ echo: number }>('echo', { v: 2 }),
    ]);
    expect(r1.echo).toBe(1);
    expect(r2.echo).toBe(2);
  });
});

describe('RPC 方法名约束', () => {
  it('所有方法名全局唯一（请求/响应共用同一命名空间，杜绝碰撞）', () => {
    const names = Object.values(RPC);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Tool 序列化', () => {
  it('含 handler 的 Tool 必须经 toJSON 才能结构化克隆', () => {
    const tool = new Tool({ name: 't', description: 'd', handler: () => 1 });
    expect(() => structuredClone(tool)).toThrow();
    const json = tool.toJSON();
    expect(() => structuredClone(json)).not.toThrow();
    expect((json as any).handler).toBeUndefined();
  });
});

describe('RPCServer.expose + createApiClient（标准外部访问接口）', () => {
  beforeEach(() => installChromeStub());

  it('expose 把对象方法自动注册为 service.method，代理按契约调用', async () => {
    const fakeSettings: any = {
      getSettings: async () => ({ theme: 'dark', n: 1 }),
      saveSettings: async (_s: any) => { /* persist */ },
    };
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.expose('settings', fakeSettings, { methods: ['getSettings', 'saveSettings'] });

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);
    const api = createApiClient<{ settings: { getSettings(): Promise<any>; saveSettings(s: any): Promise<void> } }>(client);

    const s = await api.settings.getSettings();
    expect(s.theme).toBe('dark');
    // 边界约定：void 方法经 RPC 返回 undefined，被规范化成 null（shell 端不消费返回值）
    await expect(api.settings.saveSettings({ theme: 'light' })).resolves.toBeNull();
  });

  it('多参数按数组展开传给实现', async () => {
    const impl: any = { add: (a: number, b: number) => a + b };
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.expose('math', impl, { methods: ['add'] });

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);
    const api = createApiClient<any>(client);

    expect(await api.math.add(2, 3)).toBe(5);
  });

  it('capabilities.audit 在每个调用时被触发（能力监测钩子）', async () => {
    const audits: any[] = [];
    const caps = { audit: (...a: any[]) => audits.push(a) };
    const impl: any = { ping: () => 'pong' };
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    server.expose('svc', impl, { methods: ['ping'], capabilities: caps });

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);
    const api = createApiClient<any>(client);

    await api.svc.ping();
    expect(audits.length).toBe(1);
    expect(audits[0][1]).toBe('svc');     // key
    expect(audits[0][2]).toEqual(['ping']); // capabilities
  });

  it('非函数 / 不存在的方法会被跳过（不抛异常）', () => {
    const impl: any = { ok: () => 1, notFn: 42 };
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    expect(() => server.expose('x', impl, { methods: ['ok', 'notFn', 'missing'] })).not.toThrow();
    expect((server as any).handlers.has('x.ok')).toBe(true);
    expect((server as any).handlers.has('x.notFn')).toBe(false);
    expect((server as any).handlers.has('x.missing')).toBe(false);
  });
});

