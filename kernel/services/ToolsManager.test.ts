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
