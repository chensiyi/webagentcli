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
