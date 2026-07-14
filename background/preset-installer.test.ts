import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installPresets } from './preset-installer.js';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { StorageKeys } from 'kernel/Keys.js';

const PRESET_CODE = `// ==UserScript==
// @name         提取页面标题层级 Extract Headings
// @namespace    https://github.com/webagentcli
// @version      1.0.0
// @match        *://*/*
// @grant        none
// @tool
// @tool.name        extract_headings
// @tool.description 提取标题
// ==/UserScript==
(function(){ return []; })();`;

/** 内存版 storage，供真实 ScriptsManager 持久化 */
function mkStorage() {
  const mem = new Map<string, unknown>();
  return {
    get: async (k: string) => mem.get(k),
    set: async (k: string, v: unknown) => { mem.set(k, v); },
    remove: async (k: string) => { mem.delete(k); },
    clear: async () => mem.clear(),
  };
}

/** 测试用远程基址（jsDelivr 风格，指向 sidepanel/userscripts 目录） */
const BASE = 'https://cdn.jsdelivr.net/gh/org/repo@main/sidepanel/userscripts';

/** 让 fetch 按 URL 返回清单或脚本内容 */
function mockFetch(manifestFiles: string[], fileBody = PRESET_CODE) {
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    if (url.endsWith('presets.json')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(manifestFiles) };
    }
    return { ok: true, status: 200, text: async () => fileBody };
  }) as any;
}

beforeEach(() => {
  (globalThis as any).fetch = undefined;
});

describe('installPresets 预装机制（#4.0 远程源）', () => {
  it('首次启动：安装清单内脚本并写入版本记录', async () => {
    mockFetch(['extract-headings.user.js']);
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: mkStorage });
    const storage = mkStorage();

    const res = await installPresets(sm, storage, BASE);

    expect(res.installed).toBe(1);
    expect(res.skipped).toBe(0);
    const scripts = await sm.loadAll();
    expect(scripts.length).toBe(1);
    expect(scripts[0].toolMeta?.name).toBe('extract_headings');
    const record = (await storage.get(StorageKeys.PRESET_INSTALLED)) as Record<string, string>;
    expect(Object.values(record)).toContain('1.0.0');
  });

  it('同版本二次启动：幂等跳过，不重复安装/覆盖', async () => {
    mockFetch(['extract-headings.user.js']);
    const storage = mkStorage();
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => storage });

    await installPresets(sm, storage, BASE);
    const idAfterFirst = (await sm.loadAll())[0].id;
    const res = await installPresets(sm, storage, BASE); // 第二次

    expect(res.installed).toBe(0);
    expect(res.skipped).toBe(1);
    const scripts = await sm.loadAll();
    expect(scripts.length).toBe(1);
    expect(scripts[0].id).toBe(idAfterFirst); // 同一脚本，未被重建
  });

  it('清单缺失/损坏：安全跳过，不抛异常', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('404'); }) as any;
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: mkStorage });
    const storage = mkStorage();

    const res = await installPresets(sm, storage, BASE);
    expect(res).toEqual({ installed: 0, skipped: 0 });
    expect(await sm.loadAll()).toHaveLength(0);
  });

  it('版本升级：版本变化时重新安装（更新原地脚本）', async () => {
    mockFetch(['extract-headings.user.js'], PRESET_CODE);
    const storage = mkStorage();
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: () => storage });
    await installPresets(sm, storage, BASE);

    // 模拟发布新版本 2.0.0
    const upgraded = PRESET_CODE.replace(/@version\s+[\d.]+/, '@version      2.0.0');
    mockFetch(['extract-headings.user.js'], upgraded);
    const res = await installPresets(sm, storage, BASE);

    expect(res.installed).toBe(1);
    const scripts = await sm.loadAll();
    expect(scripts.length).toBe(1);
    expect(scripts[0].version).toBe('2.0.0');
    const record = (await storage.get(StorageKeys.PRESET_INSTALLED)) as Record<string, string>;
    expect(Object.values(record)).toContain('2.0.0');
  });

  it('base 为空：守卫跳过、不发起 fetch', async () => {
    mockFetch(['extract-headings.user.js']);
    const sm = new ScriptsManager({ getIPC: () => null, getStorageManager: mkStorage });
    const storage = mkStorage();
    const res = await installPresets(sm, storage, '');
    expect(res).toEqual({ installed: 0, skipped: 0 });
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });
});
