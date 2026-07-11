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
