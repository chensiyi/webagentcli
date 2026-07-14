import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
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
      // 本项目 @tool 脚本的约定格式是「顶层写成 IIFE 并 return」，而非裸 return 语句。
      // 因此这里用 IIFE 形式，既贴合 examples/tool-extract-links.user.js，
      // 也才能命中 wrapWithGM 的 `return (code)` 捕获逻辑。
      '(function(){ return __toolArgs.x; })();',
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

// 一个「写成 IIFE 且 return 对象」的 @tool 脚本，复刻 examples/tool-extract-links.user.js
// 的约定格式。这正是「双层 IIFE 吞返回值」bug 的载体：
// 修复前 wrapWithGM 是 `__scriptResult = (function(){ (IIFE) })()` → 返回值被当语句丢弃 → null；
// 修复后 `__scriptResult = (function(){ return (IIFE) })()` → 对象被捕获并透传。
const IIFE_OBJ_SCRIPT = `// ==UserScript==
// @tool
// @tool.name links_tool
// ==/UserScript==
(function() {
  return { ok: true, value: __toolArgs.x, doubled: __toolArgs.x + '!' };
})();`;

// 在 mock DOM 中真实执行 harnessCode（模拟 Chrome 取「脚本完成值」的语义）。
// 这是回归测试的关键：用「硬编码返回值」mock 永远测不出「返回链是否真的把值透传」这类 bug，
// 必须真的把代码跑一遍，才能验证 wrapWithGM + finalCode + harness 整条链。
function runInMockDom(code: string): any {
  const sandbox: any = {
    window: { location: { href: 'http://x.com' }, document: { title: 'T' } },
    document: {
      querySelectorAll: () => [],
      title: 'T',
      createElement: () => ({ setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      body: { appendChild() {} },
      documentElement: { appendChild() {} },
    },
    location: { href: 'http://x.com' },
    console,
    setTimeout: ((_fn: any) => 0) as any,
    clearTimeout: (() => {}) as any,
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    Blob: class {},
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
    chrome: { runtime: { sendMessage: () => Promise.resolve() } },
    Notification: function () {},
    Map,
  };
  return runInNewContext(code, sandbox);
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

  it('buildInputSchema：所有参数默认可选（不生成 required），enum 透传', () => {
    const schema = buildInputSchema(mkScript().toolMeta);
    expect(schema.type).toBe('object');
    expect(schema.required).toBeUndefined();
    expect(Object.keys(schema.properties || {})).toEqual(['x', 'm']);
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
      runtime: { lastError: null, sendMessage: vi.fn() },
      userScripts: {
        // 关键：这个 mock 不再硬编码返回值，而是**真在 mock DOM 里执行 harnessCode**，
        // 把「脚本完成值」原样回传（模拟 Chrome 对 userScripts.execute 的真实行为）。
        // 这样 wrapWithGM + finalCode + harness 整条返回链是否被真实跑通都能被测出来——
        // 尤其能抓住「双层 IIFE 吞返回值 → 工具拿到 null」这种回归（硬编码 mock 测不出）。
        execute: vi.fn(async (opts: any) => {
          const envelope = runInMockDom(opts.js[0].code);
          return [{ documentId: 'd', frameId: 0, result: envelope }];
        }),
      },
      scripting: { executeScript: vi.fn() },
    };
    (globalThis as any).chrome = chromeMock;
  });
  afterEach(() => { delete (globalThis as any).chrome; });

  it('注入 __toolArgs 并经 userScripts.execute 真实回传结果', async () => {
    const tool = createScriptTool(mkScript(), () => mkScript());
    const out = await tool.handler!({ x: 'abc', m: 'one' }, { tabId: 7 });
    // mkScript 的 @tool 脚本是 IIFE，return __toolArgs.x → 'abc'
    expect(out).toBe('abc');
    // 确认走的是 userScripts 通道（绕 Trusted Types），且代码带参数 JSON
    expect(chromeMock.userScripts.execute).toHaveBeenCalled();
    const code: string = chromeMock.userScripts.execute.mock.calls[0][0].js[0].code;
    expect(code).toContain('__toolArgs');
    expect(code).toContain('"x":"abc"');
    expect(code).toContain('"m":"one"');
  });

  it('无 context.tabId 时回退到活动标签', async () => {
    const tool = createScriptTool(mkScript(), () => mkScript());
    const out = await tool.handler!({ x: 'z', m: 'one' }, {});
    expect(out).toBe('z'); // mkScript 脚本 return __toolArgs.x → 'z'
    expect(chromeMock.tabs.query).toHaveBeenCalled();
    expect(chromeMock.userScripts.execute).toHaveBeenCalled();
    const code: string = chromeMock.userScripts.execute.mock.calls[0][0].js[0].code;
    expect(code).toContain('__toolArgs');
  });

  it('回归：@tool 脚本写成 IIFE 且 return 对象时，返回值仍被捕获（不丢为 null）', async () => {
    const tool = createScriptTool(
      mkScript({ code: IIFE_OBJ_SCRIPT }),
      () => mkScript({ code: IIFE_OBJ_SCRIPT }),
    );
    const out = await tool.handler!({ x: 'hello', m: 'one' }, { tabId: 7 });
    // out 是 formatOutput 后的 JSON 字符串；解析后应为真实对象，而非 null。
    // 若回归（双层 IIFE 吞返回值），这里会是 'null' → JSON.parse 得 null → 断言失败。
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ ok: true, value: 'hello', doubled: 'hello!' });
  });

  it('脚本存在但缺少 code 时抛错', async () => {
    // getScriptById 返回了一个无 code 的脚本（如已被清空）
    const tool = createScriptTool(mkScript(), () => ({ id: 's1' }) as any);
    await expect(tool.handler!({}, { tabId: 7 })).rejects.toThrow(/缺少代码/);
  });
});
