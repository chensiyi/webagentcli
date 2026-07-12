import { describe, it, expect } from 'vitest';
import { ToolsManager } from './ToolsManager.js';
import { Tool, ToolCall, ToolResult } from '../models/Tool.js';

describe('ToolsManager.getInvocationHistory', () => {
  it('按 toolName 与 since 精确过滤（修复前的死过滤 bug）', () => {
    const tm = new ToolsManager();
    const now = Date.now();
    // 直接构造带固定 timestamp / toolName 的历史，验证过滤语义
    (tm as any)._invocationHistory = [
      new ToolResult({ toolCallId: 'c1', toolName: 'alpha', status: 'success', timestamp: now - 1000 }),
      new ToolResult({ toolCallId: 'c2', toolName: 'beta', status: 'success', timestamp: now }),
    ];

    expect(tm.getInvocationHistory({ toolName: 'alpha' }).length).toBe(1);
    expect(tm.getInvocationHistory({ toolName: 'gamma' }).length).toBe(0); // 不存在的工具名 → 空
    expect(tm.getInvocationHistory({ since: now - 500 }).length).toBe(1); // 仅 beta 命中
    expect(tm.getInvocationHistory({ since: now + 1000 }).length).toBe(0); // 未来时间 → 空
    expect(tm.getInvocationHistory({ status: 'success' }).length).toBe(2);
  });

  it('invoke 后历史记录携带 toolName / timestamp', async () => {
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'alpha', handler: async () => 'ok' }));
    const res = await tm.invoke(new ToolCall(null, 'alpha', {}));
    expect(res.toolName).toBe('alpha');

    const hist = tm.getInvocationHistory({ toolName: 'alpha' });
    expect(hist.length).toBe(1);
    expect(hist[0].toolName).toBe('alpha');
    expect(typeof hist[0].timestamp).toBe('number');
  });

  it('未知工具 / 参数校验失败的结果也记录 toolName', async () => {
    const tm = new ToolsManager();
    await tm.invoke(new ToolCall(null, 'ghost', {})); // 未注册
    const hist = tm.getInvocationHistory({ toolName: 'ghost' });
    expect(hist.length).toBe(1);
    expect(hist[0].status).toBe('failed');
  });
});

// ─── 启用/禁用状态持久化（防 SW 重启丢失用户选择） ─────────
function makeMockStorage(initial?: Record<string, unknown>) {
  const mem: Record<string, unknown> = { ...(initial || {}) };
  return {
    mem,
    async get(k: string) { return mem[k]; },
    async set(k: string, v: unknown) { mem[k] = v; },
    async remove(k: string) { delete mem[k]; },
    async clear() { for (const k of Object.keys(mem)) delete mem[k]; },
    async getAll() { return { ...mem }; },
  };
}

describe('ToolsManager 启用态持久化与恢复', () => {
  it('init 从存储恢复启用态，register 时应用禁用覆盖', async () => {
    const storage = makeMockStorage({ tools_enabled: { alpha: false, beta: true } });
    const tm = new ToolsManager({ storage });
    await tm.init();
    tm.register(new Tool({ name: 'alpha' })); // 默认 enabled=true，但覆盖为 false
    tm.register(new Tool({ name: 'beta' }));
    expect(tm.get('alpha')!.enabled).toBe(false);
    expect(tm.get('beta')!.enabled).toBe(true);
    // gamma 无覆盖 → 保持默认 true
    tm.register(new Tool({ name: 'gamma' }));
    expect(tm.get('gamma')!.enabled).toBe(true);
  });

  it('disable 后将状态写回存储', async () => {
    const storage = makeMockStorage();
    const tm = new ToolsManager({ storage });
    await tm.init();
    tm.register(new Tool({ name: 'alpha' }));
    await tm.disable('alpha');
    expect(storage.mem['tools_enabled']).toEqual({ alpha: false });
    expect(tm.get('alpha')!.enabled).toBe(false);
  });

  it('enable 后将覆盖写回存储为 true', async () => {
    const storage = makeMockStorage({ tools_enabled: { alpha: false } });
    const tm = new ToolsManager({ storage });
    await tm.init();
    tm.register(new Tool({ name: 'alpha' })); // 启动期恢复为禁用
    expect(tm.get('alpha')!.enabled).toBe(false);
    await tm.enable('alpha');
    expect(storage.mem['tools_enabled']).toEqual({ alpha: true });
    expect(tm.get('alpha')!.enabled).toBe(true);
  });

  it('无 storage 时 init/enable/disable 不报错，保持内存态', async () => {
    const tm = new ToolsManager();
    await expect(tm.init()).resolves.toBeDefined();
    tm.register(new Tool({ name: 'x' }));
    await tm.disable('x');
    expect(tm.get('x')!.enabled).toBe(false);
  });
});

// ─── 危险工具人工确认闸门（danger===true 必须用户确认，内聚于 ToolsManager） ─────────
function makeFakeIpc() {
  const events: { event: string; data: any }[] = [];
  const ipc: any = {
    emit(event: string, data: unknown) { events.push({ event, data }); return { event, data, timestamp: 0, id: 'm', origin: 't' }; },
    getOrCreateChannel() { return { emit() {} }; },
  };
  return { ipc, events };
}

describe('ToolsManager 危险工具人工确认闸门', () => {
  it('danger 工具被拒绝：返回 rejected 且不执行 handler', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'done'; } }));
    const invokePromise = tm.invoke(new ToolCall(null, 'danger', {}));
    // requestConfirm 已同步经 IPC 广播 CONFIRM.REQUEST，取出 requestId 后回写拒绝
    expect(events.some(e => e.event === 'confirm:request')).toBe(true);
    const reqId = events.find(e => e.event === 'confirm:request')!.data.requestId as string;
    tm.resolveConfirm(reqId, false);
    const res = await invokePromise;
    expect(handlerCalled).toBe(false);
    expect(res.status).toBe('rejected');
  });

  it('danger 工具被允许：执行 handler 并返回结果', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'ok'; } }));
    const invokePromise = tm.invoke(new ToolCall(null, 'danger', {}));
    const reqId = events.find(e => e.event === 'confirm:request')!.data.requestId as string;
    tm.resolveConfirm(reqId, true);
    const res = await invokePromise;
    expect(handlerCalled).toBe(true);
    expect(res.status).toBe('success');
    expect(res.output).toBe('ok');
  });

  it('非 danger 工具跳过确认直接执行，不广播 CONFIRM.REQUEST', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    tm.register(new Tool({ name: 'safe', handler: async () => 'ok' }));
    const res = await tm.invoke(new ToolCall(null, 'safe', {}));
    expect(events.some(e => e.event === 'confirm:request')).toBe(false);
    expect(res.status).toBe('success');
  });

  it('无 IPC 时危险工具安全默认拒绝（绝不静默放行）', async () => {
    const tm = new ToolsManager(); // 不注入 ipc
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'done'; } }));
    const res = await tm.invoke(new ToolCall(null, 'danger', {}));
    expect(handlerCalled).toBe(false);
    expect(res.status).toBe('rejected');
  });

  it('迟到的 resolveConfirm 被忽略（已被超时回收）', () => {
    const { ipc } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    // 未知 requestId：应无异常、静默忽略
    expect(() => tm.resolveConfirm('ghost-id', true)).not.toThrow();
  });

  it('用户决策后回写：广播 CONFIRM.RESOLVED 并携带 toolCallId', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'ok'; } }));
    const invokePromise = tm.invoke(new ToolCall('call-1', 'danger', {}));
    const reqId = events.find(e => e.event === 'confirm:request')!.data.requestId as string;
    tm.resolveConfirm(reqId, true);
    await invokePromise;
    const resolved = events.find(e => e.event === 'confirm:resolved');
    expect(resolved).toBeTruthy();
    expect((resolved!.data as any).toolCallId).toBe('call-1');
    expect((resolved!.data as any).requestId).toBe(reqId);
    expect(handlerCalled).toBe(true);
  });

  it('超时未响应：安全默认拒绝并广播 CONFIRM.RESOLVED（带 toolCallId）', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc, confirmTimeoutMs: 20 });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'done'; } }));
    const res = await tm.invoke(new ToolCall('call-2', 'danger', {}));
    // 超过 confirmTimeoutMs 后定时器触发 → 拒绝 + 广播
    expect(handlerCalled).toBe(false);
    expect(res.status).toBe('rejected');
    const resolved = events.find(e => e.event === 'confirm:resolved');
    expect(resolved).toBeTruthy();
    expect((resolved!.data as any).toolCallId).toBe('call-2');
  });
});

// ─── 会话级三态覆盖（context.toolEnabledOverride: true | false | undefined） ─────────
// 矩阵：未定义→弹确认；开启→跳过确认直接执行；关闭→直接拒绝（不弹确认、不执行）。
describe('ToolsManager 会话级三态覆盖（toolEnabledOverride）', () => {
  it('danger + 开启(true) → 跳过确认直接执行，不广播 CONFIRM.REQUEST', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'ok'; } }));
    const res = await tm.invoke(new ToolCall(null, 'danger', {}), { toolEnabledOverride: true });
    expect(events.some(e => e.event === 'confirm:request')).toBe(false);
    expect(handlerCalled).toBe(true);
    expect(res.status).toBe('success');
    expect(res.output).toBe('ok');
  });

  it('danger + 关闭(false) → 直接拒绝，不广播 CONFIRM.REQUEST、不执行 handler', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'done'; } }));
    const res = await tm.invoke(new ToolCall(null, 'danger', {}), { toolEnabledOverride: false });
    expect(events.some(e => e.event === 'confirm:request')).toBe(false);
    expect(handlerCalled).toBe(false);
    expect(res.status).toBe('rejected');
  });

  it('非 danger + 关闭(false) → 直接拒绝（防御性，不执行）', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'safe', handler: async () => { handlerCalled = true; return 'ok'; } }));
    const res = await tm.invoke(new ToolCall(null, 'safe', {}), { toolEnabledOverride: false });
    expect(events.some(e => e.event === 'confirm:request')).toBe(false);
    expect(handlerCalled).toBe(false);
    expect(res.status).toBe('rejected');
  });

  it('非 danger + 未定义(undefined) → 继承全局正常执行', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'safe', handler: async () => { handlerCalled = true; return 'ok'; } }));
    const res = await tm.invoke(new ToolCall(null, 'safe', {}), { toolEnabledOverride: undefined });
    expect(events.some(e => e.event === 'confirm:request')).toBe(false);
    expect(handlerCalled).toBe(true);
    expect(res.status).toBe('success');
  });

  it('danger + 未定义(undefined) → 弹确认（与历史行为一致）', async () => {
    const { ipc, events } = makeFakeIpc();
    const tm = new ToolsManager({ ipc });
    let handlerCalled = false;
    tm.register(new Tool({ name: 'danger', danger: true, handler: async () => { handlerCalled = true; return 'ok'; } }));
    const invokePromise = tm.invoke(new ToolCall('c3', 'danger', {}), { toolEnabledOverride: undefined });
    expect(events.some(e => e.event === 'confirm:request')).toBe(true);
    const reqId = events.find(e => e.event === 'confirm:request')!.data.requestId as string;
    tm.resolveConfirm(reqId, true);
    const res = await invokePromise;
    expect(handlerCalled).toBe(true);
    expect(res.status).toBe('success');
  });
});
