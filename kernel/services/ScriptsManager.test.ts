import { describe, it, expect, vi } from 'vitest';
import { ScriptsManager } from './ScriptsManager.js';

describe('ScriptsManager.parseMetadata 油猴元数据', () => {
  const code = `// ==UserScript==
// @name    T
// @include  *://example.com/*
// @exclude  *://example.com/private*
// @icon     https://x.com/i.png
// @require  https://x.com/lib.js
// @resource name1 https://x.com/r.txt
// ==/UserScript==
console.log(1);`;

  it('解析 @include/@exclude/@icon/@require/@resource', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    const m = sm.parseMetadata(code);
    expect(m.include).toEqual(['*://example.com/*']);
    expect(m.exclude).toEqual(['*://example.com/private*']);
    expect(m.icon).toBe('https://x.com/i.png');
    expect(m.require).toEqual(['https://x.com/lib.js']);
    expect(m.resource).toEqual([{ name: 'name1', url: 'https://x.com/r.txt' }]);
  });
});

describe('ScriptsManager.install 安装期拉取 @require/@resource', () => {
  it('拉取并存储 requireCode / resources', async () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    (globalThis as any).fetch = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => 'LIB_' + url,
    })) as any;

    const code = `// ==UserScript==
// @name    T
// @require  https://x.com/lib.js
// @resource r1 https://x.com/r.txt
// ==/UserScript==
console.log('hi');`;
    const s = await sm.install(code);
    expect(s.requireCode).toContain('LIB_https://x.com/lib.js');
    expect((s.resources as any)?.['r1']).toContain('LIB_https://x.com/r.txt');
  });

  it('fetch 失败降级为空（不阻断安装）', async () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('net'); }) as any;

    const code = `// ==UserScript==
// @name    T
// @require  https://x.com/lib.js
// ==/UserScript==
console.log('hi');`;
    const s = await sm.install(code);
    expect(s.requireCode).toBe('');
  });
});

describe('ScriptsManager.parseMetadata @tool 声明（P2 自动注册）', () => {
  const code = `// ==UserScript==
// @name    My Script
// @tool
// @tool.name        do_thing
// @tool.description 对当前页面做X
// @tool.danger
// @tool.param.q     string  查询词
// @tool.param.n     number  数量
// @tool.param.m     string  模式
// @tool.enum.m     one|all
// ==/UserScript==
console.log(1);`;

  it('解析 @tool/@tool.name/@tool.description/@tool.danger/@tool.param/@tool.enum', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    const m = sm.parseMetadata(code);
    expect(m.toolMeta?.isTool).toBe(true);
    expect(m.toolMeta?.name).toBe('do_thing');
    expect(m.toolMeta?.description).toBe('对当前页面做X');
    expect(m.toolMeta?.danger).toBe(true);
    const q = m.toolMeta?.params.find(p => p.name === 'q');
    expect(q).toMatchObject({ name: 'q', type: 'string', description: '查询词' });
    const mParam = m.toolMeta?.params.find(p => p.name === 'm');
    expect(mParam?.enum).toEqual(['one', 'all']);
  });

  it('无 @tool 标记则 toolMeta 为 null（非工具脚本）', () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    const m = sm.parseMetadata(`// ==UserScript==
// @name    Plain
// ==/UserScript==
console.log(1);`);
    expect(m.toolMeta).toBeUndefined();
  });

  it('install 落盘 toolMeta，可被 reconcile 读取', async () => {
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => null });
    const s = await sm.install(code);
    expect(s.toolMeta?.isTool).toBe(true);
    expect(s.toolMeta?.name).toBe('do_thing');
  });
});
