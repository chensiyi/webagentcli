import { describe, it, expect, vi, afterEach } from 'vitest';
import { RemoteMediaStore, type ResourceServerConfig } from './mediaStore.js';

// ─── 极简内存版 IndexedDB 假实现（仅覆盖 mediaStore 用到的 API） ───
function makeReq(initial?: any) {
  const r: any = { onsuccess: null, onerror: null, result: initial };
  queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
  return r;
}
function makeStore(map: Map<string, any>) {
  return {
    put: (rec: any) => { map.set(rec.id, rec); return makeReq(rec); },
    get: (id: any) => makeReq(map.get(id)),
    delete: (id: any) => { map.delete(id); return makeReq(undefined); },
  };
}
function makeFakeDb(map: Map<string, any>) {
  return {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => {},
    transaction: () => ({ objectStore: () => makeStore(map) }),
  };
}
function jsonResp(obj: any, ok = true, status = 200) {
  return {
    ok, status,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
    blob: async () => new Blob(['x']),
  };
}

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('RemoteMediaStore（资源服务器上传）', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function makeStoreWithSpy() {
    const map = new Map<string, any>();
    const store = new RemoteMediaStore();
    vi.spyOn(store as any, 'open').mockResolvedValue(makeFakeDb(map));
    return { store, map };
  }

  it('put 成功：上传并返回 remote_ 前缀 id，get 取回公网 URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResp({ url: 'https://cdn/x.png' }));
    vi.stubGlobal('fetch', fetchMock);

    const { store } = makeStoreWithSpy();
    const cfg: ResourceServerConfig = { enabled: true, uploadUrl: 'https://up.example.com', responseUrlField: 'url' };
    const id = await store.put(DATA_URL, 'image/png', 'a.png', cfg);

    expect(id.startsWith('remote_')).toBe(true);
    expect(await store.get(id)).toBe('https://cdn/x.png');
    // 上传请求应以 multipart 发出
    expect(fetchMock).toHaveBeenCalledWith('https://up.example.com', expect.objectContaining({ method: 'POST' }));
  });

  it('put 支持自定义鉴权头与 URL 前缀', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResp({ url: '/files/x.png' }));
    vi.stubGlobal('fetch', fetchMock);

    const { store } = makeStoreWithSpy();
    const cfg: ResourceServerConfig = {
      enabled: true, uploadUrl: 'https://up', method: 'PUT',
      authHeader: 'Authorization', authToken: 'tok', urlPrefix: 'https://cdn.example.com',
    };
    const id = await store.put(DATA_URL, 'image/png', 'a.png', cfg);
    const url = await store.get(id);
    expect(url).toBe('https://cdn.example.com/files/x.png');
    // 第一次 fetch 是 dataUrlToBlob，第二次才是上传请求
    const uploadCall = fetchMock.mock.calls.find((c) => c[0] === 'https://up');
    expect(uploadCall).toBeTruthy();
    const init = uploadCall![1] as any;
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('tok');
  });

  it('put 响应取 URL 支持点路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResp({ data: { url: 'https://cdn/y.png' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { store } = makeStoreWithSpy();
    const cfg: ResourceServerConfig = { enabled: true, uploadUrl: 'https://up', responseUrlField: 'data.url' };
    const id = await store.put(DATA_URL, 'image/png', 'a.png', cfg);
    expect(await store.get(id)).toBe('https://cdn/y.png');
  });

  it('put 上传失败（非 2xx）直接抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResp({ error: 'nope' }, false, 500)));
    const { store } = makeStoreWithSpy();
    await expect(store.put(DATA_URL, 'image/png', 'a.png', { enabled: true, uploadUrl: 'https://up' }))
      .rejects.toThrow(/上传失败/);
  });

  it('put 响应缺少可识别 URL 字段直接抛错（报错含真实响应字段名）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResp({ code: 200, msg: 'ok' })));
    const { store } = makeStoreWithSpy();
    await expect(store.put(DATA_URL, 'image/png', 'a.png', { enabled: true, uploadUrl: 'https://up' }))
      .rejects.toThrow(/可识别的 URL/);
  });

  it('put 自动识别 link 字段（用户未配置 responseUrlField）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResp({ code: 200, msg: 'success', link: 'https://i.hd-r.cn/x.jpg' }));
    vi.stubGlobal('fetch', fetchMock);

    const { store } = makeStoreWithSpy();
    // 关键场景：用户服务器返回 { link }，而 responseUrlField 留空 → 自动探测命中 link
    const cfg: ResourceServerConfig = { enabled: true, uploadUrl: 'https://up.example.com' };
    const id = await store.put(DATA_URL, 'image/png', 'a.png', cfg);
    expect(id.startsWith('remote_')).toBe(true);
    expect(await store.get(id)).toBe('https://i.hd-r.cn/x.jpg');
  });

  it('put 用户误配 responseUrlField=url 但服务器返回 link 时降级自动探测成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResp({ link: 'https://i.hd-r.cn/y.jpg' }));
    vi.stubGlobal('fetch', fetchMock);

    const { store } = makeStoreWithSpy();
    const cfg: ResourceServerConfig = { enabled: true, uploadUrl: 'https://up', responseUrlField: 'url' };
    const id = await store.put(DATA_URL, 'image/png', 'a.png', cfg);
    expect(await store.get(id)).toBe('https://i.hd-r.cn/y.jpg');
  });

  it('put 服务器直接返回字符串 URL 也能识别', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResp('https://cdn.z.com/d.png')));
    const { store } = makeStoreWithSpy();
    const id = await store.put(DATA_URL, 'image/png', 'a.png', { enabled: true, uploadUrl: 'https://up' });
    expect(await store.get(id)).toBe('https://cdn.z.com/d.png');
  });

  it('put 未启用/缺上传链接直接抛错', async () => {
    const { store } = makeStoreWithSpy();
    await expect(store.put(DATA_URL, 'image/png', 'a.png', { enabled: false, uploadUrl: 'https://up' }))
      .rejects.toThrow(/未启用/);
    await expect(store.put(DATA_URL, 'image/png', 'a.png', { enabled: true }))
      .rejects.toThrow(/未配置/);
  });
});
