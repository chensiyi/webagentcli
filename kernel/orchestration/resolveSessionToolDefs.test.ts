import { describe, it, expect } from 'vitest';
import { resolveSessionToolDefs } from './session.js';
import { ToolsManager } from '../services/ToolsManager.js';
import { Tool } from '../models/Tool.js';

function stubKernel(tm: ToolsManager): any {
  return { getToolsManager: () => tm };
}

function names(defs: unknown[]): string[] {
  return (defs as any[]).map((d) => d.function?.name ?? d.name);
}

describe('resolveSessionToolDefs — 两层开关合并', () => {
  it('全局关的工具不进入结果（天花板），即便会话级 true 也无效', () => {
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'a', handler: async () => 1 }));
    tm.register(new Tool({ name: 'b', enabled: false, handler: async () => 2 }));
    const session: any = { toolEnabled: { b: true } }; // 试图重新开启全局已关的 b
    expect(names(resolveSessionToolDefs(stubKernel(tm), session))).toEqual(['a']);
  });

  it('全局开、会话级 false → 仅本会话剔除', () => {
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'a', handler: async () => 1 }));
    tm.register(new Tool({ name: 'b', handler: async () => 2 }));
    const session: any = { toolEnabled: { b: false } };
    expect(names(resolveSessionToolDefs(stubKernel(tm), session))).toEqual(['a']);
  });

  it('会话级为 null → 继承全局（全部开启）', () => {
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'a', handler: async () => 1 }));
    tm.register(new Tool({ name: 'b', handler: async () => 2 }));
    const session: any = { toolEnabled: null };
    expect(names(resolveSessionToolDefs(stubKernel(tm), session)).sort()).toEqual(['a', 'b']);
  });

  it('全局开、会话级 true（冗余）仍开启，不破坏', () => {
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'a', handler: async () => 1 }));
    tm.register(new Tool({ name: 'b', handler: async () => 2 }));
    const session: any = { toolEnabled: { a: true, b: true } };
    expect(names(resolveSessionToolDefs(stubKernel(tm), session)).sort()).toEqual(['a', 'b']);
  });
});
