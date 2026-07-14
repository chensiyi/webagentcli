import { describe, it, expect, vi } from 'vitest';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { ToolsManager } from 'kernel/services/ToolsManager.js';
import { Tool } from 'kernel/models/Tool.js';
import { reconcileScriptTools } from './script-tools.js';

/** 构造一个带 @tool 声明的已启用脚本 */
function mkToolScript(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'My Script',
    code:
      '// ==UserScript==\n' +
      '// @tool\n' +
      '// @tool.name do_thing\n' +
      '// @tool.param.x string 数量\n' +
      '// ==/UserScript==\n' +
      'return __toolArgs.x;',
    enabled: true,
    toolMeta: {
      isTool: true,
      name: 'do_thing',
      description: undefined,
      danger: false,
      params: [{ name: 'x', type: 'string', description: '数量' }],
    },
    ...over,
  } as any;
}

describe('reconcileScriptTools（P2 @tool 自动注册）', () => {
  it('把 @tool 脚本注册为 source=script 工具，带 inputSchema', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    sm.scripts = [mkToolScript()];
    const tm = new ToolsManager();
    reconcileScriptTools(sm, tm);

    const t = tm.get('do_thing');
    expect(t).toBeTruthy();
    expect(t.source).toBe('script');
    expect(t.inputSchema.properties.x).toBeTruthy();
    expect(t.inputSchema.required).toBeUndefined();
    expect(t.category).toBe('user-script');
  });

  it('禁用脚本则注销其工具', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    sm.scripts = [mkToolScript()];
    const tm = new ToolsManager();
    reconcileScriptTools(sm, tm);
    expect(tm.get('do_thing')).toBeTruthy();

    sm.scripts = [mkToolScript({ enabled: false })];
    reconcileScriptTools(sm, tm);
    expect(tm.get('do_thing')).toBeNull();
  });

  it('移除脚本后注销其工具', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    sm.scripts = [mkToolScript()];
    const tm = new ToolsManager();
    reconcileScriptTools(sm, tm);
    expect(tm.get('do_thing')).toBeTruthy();

    sm.scripts = [];
    reconcileScriptTools(sm, tm);
    expect(tm.get('do_thing')).toBeNull();
  });

  it('与内置工具同名冲突时跳过，不覆盖 builtin', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    sm.scripts = [mkToolScript()];
    const tm = new ToolsManager();
    tm.register(new Tool({ name: 'do_thing', description: 'builtin' })); // source='builtin'
    reconcileScriptTools(sm, tm);

    const t = tm.get('do_thing');
    expect(t.source).toBe('builtin'); // 未被覆盖
  });

  it('脚本编辑（参数变化）后 update 而非新建', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    const script = mkToolScript();
    sm.scripts = [script];
    const tm = new ToolsManager();
    reconcileScriptTools(sm, tm);
    const first = tm.get('do_thing');

    // 编辑：新增参数 y
    script.toolMeta = {
      isTool: true,
      name: 'do_thing',
      danger: false,
      params: [
        { name: 'x', type: 'string', description: '数量' },
        { name: 'y', type: 'number', description: '页码' },
      ],
    };
    reconcileScriptTools(sm, tm);
    const after = tm.get('do_thing');
    expect(after).toBe(first); // 同一实例引用（update 而非 register）
    expect(after.inputSchema.properties.y).toBeTruthy();
  });

  it('非工具脚本不被注册', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    sm.scripts = [{ id: 'p1', name: 'Plain', code: '// ==UserScript==\n// @name Plain\n// ==/UserScript==\n', enabled: true, toolMeta: null } as any];
    const tm = new ToolsManager();
    reconcileScriptTools(sm, tm);
    expect(tm.getBySource('script').length).toBe(0);
  });
});
