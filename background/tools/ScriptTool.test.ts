import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScriptTool, toolNameFor, slug, buildInputSchema } from './ScriptTool.js';

function mkScript(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'My Script',
    code:
      '// ==UserScript==\n' +
      '// @tool\n' +
      '// @tool.name do_thing\n' +
      '// @tool.param.x string 数量\n' +
      '// @tool.param.m string 模式\n' +
      '// @tool.enum.m one|all\n' +
      '// ==/UserScript==\n' +
      'return __toolArgs.x;',
    enabled: true,
    grant: [],
    toolMeta: {
      isTool: true,
      name: 'do_thing',
      description: undefined,
      danger: false,
      params: [
        { name: 'x', type: 'string', description: '数量' },
        { name: 'm', type: 'string', description: '模式', enum: ['one', 'all'] },
      ],
    },
    ...over,
  } as any;
}

describe('ScriptTool 工厂与工具名推导', () => {
  it('slug 化脚本名', () => {
    expect(slug('My Cool Script!')).toBe('my_cool_script');
    expect(slug('  Weird--Name  ')).toBe('weird_name');
    expect(slug('')).toBe('tool');
  });

  it('toolNameFor：@tool.name 优先，否则 slug(脚本名)', () => {
    expect(toolNameFor(mkScript())).toBe('do_thing');
    expect(toolNameFor(mkScript({ name: 'My Script', toolMeta: { isTool: true, params: [] } }))).toBe('my_script');
  });

  it('buildInputSchema：全部参数必填，enum 透传', () => {
    const schema = buildInputSchema(mkScript().toolMeta);
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['x', 'm']);
    expect((schema.properties as any).m.enum).toEqual(['one', 'all']);
  });

  it('createScriptTool：source/category/danger/metadata 正确', () => {
    const tool = createScriptTool(mkScript(), () => mkScript());
    expect(tool.name).toBe('do_thing');
    expect(tool.source).toBe('script');
    expect(tool.category).toBe('user-script');
    expect(tool.danger).toBe(false);
    expect((tool.metadata as any).scriptId).toBe('s1');
    expect(tool.inputSchema.properties).toHaveProperty('x');
  });

  it('createScriptTool：@tool.danger 透传为 danger 工具', () => {
    const tool = createScriptTool(mkScript({ toolMeta: { isTool: true, danger: true, params: [] } }), () => mkScript());
    expect(tool.danger).toBe(true);
  });
});

describe('ScriptTool.handler 页面执行', () => {
  let chromeMock: any;
  beforeEach(() => {
    chromeMock = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://x.com' }]) },
      userScripts: {
        execute: vi.fn(async (_opts: any) => {
          // 回放传入代码里写入的「结果」：这里直接验证代码含 __toolArgs
          const code: string = _opts.js[0].code;
          return [{ result: code.includes('__toolArgs') ? 'args-ok' : 'no-args' }];
        }),
      },
      scripting: { executeScript: vi.fn() },
    };
    (globalThis as any).chrome = chromeMock;
  });
  afterEach(() => { delete (globalThis as any).chrome; });

  it('注入 __toolArgs 并经 userScripts.execute 返回格式化结果', async () => {
    const tool = createScriptTool(mkScript(), () => mkScript());
    const out = await tool.handler!({ x: 'abc', m: 'one' }, { tabId: 7 });
    // execute mock 会检查代码含 __toolArgs 并返回 'args-ok'
    expect(out).toBe('args-ok');
    // 确认传给 userScripts 的代码确实带了参数 JSON
    const code: string = chromeMock.userScripts.execute.mock.calls[0][0].js[0].code;
    expect(code).toContain('__toolArgs');
    expect(code).toContain('"x":"abc"');
    expect(code).toContain('"m":"one"');
  });

  it('无 context.tabId 时回退到活动标签', async () => {
    const tool = createScriptTool(mkScript(), () => mkScript());
    await tool.handler!({ x: 'z' }, {});
    expect(chromeMock.tabs.query).toHaveBeenCalled();
    const code: string = chromeMock.userScripts.execute.mock.calls[0][0].js[0].code;
    expect(code).toContain('__toolArgs');
  });

  it('脚本存在但缺少 code 时抛错', async () => {
    // getScriptById 返回了一个无 code 的脚本（如已被清空）
    const tool = createScriptTool(mkScript(), () => ({ id: 's1' }) as any);
    await expect(tool.handler!({}, { tabId: 7 })).rejects.toThrow(/缺少代码/);
  });
});
