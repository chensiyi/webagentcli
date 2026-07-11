/**
 * 多媒体上传链路端到端集成测试
 *
 * 目标：把"真机联调"中无法在 CI/Node 自动跑的那一段——Shell 经 RPC 上传 → media facade →
 * 媒体存储（本地 IndexedDB，用内存假实现替代）→ 发送前经 mediaResolver 取回 → ContextBuilder
 * 序列化为 provider 的 content parts——用真实组件串起来跑，证明 P3「发图 → 模型能看见」的内核侧链路。
 *
 * 复用了 bridge/RPC.test.ts 的内存 IPC 范式（chromeStub + IPCTransport），不依赖真实扩展环境。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from '../../bridge/IPCTransport.js';
import { RPCClient, RPCServer, createApiClient } from '../../bridge/RPC.js';
import { installChromeStub } from '../../bridge/__testUtils__/chromeStub.js';
import { createMediaFacade } from '../rpc-facades.js';
import { createMediaStore, LocalMediaStore } from './mediaStore.js';
import { ContextBuilder } from 'kernel/orchestration/session-context.js';

// ── 内存版 IndexedDB（仅覆盖 LocalMediaStore 用到的 API，等价于仓库 'blobs'）──
function makeReq(initial?: any) {
  const r: any = { onsuccess: null, onerror: null, result: initial };
  queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
  return r;
}
function makeBlobStore(map: Map<string, any>) {
  return {
    put: (rec: any) => { map.set(rec.id, rec); return makeReq(rec); },
    get: (id: any) => makeReq(map.get(id)),
    delete: (id: any) => { map.delete(id); return makeReq(undefined); },
  };
}
function makeFakeDb(map: Map<string, any>) {
  return {
    objectStoreNames: { contains: (n: string) => n === 'blobs' },
    transaction: () => ({ objectStore: () => makeBlobStore(map) }),
  };
}

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const WAV = 'data:audio/wav;base64,UklGRg==';

describe('多媒体上传链路端到端（RPC → facade → mediaStore → 解析 → 序列化）', () => {
  let chromeStub: any;
  let map: Map<string, any>;

  beforeEach(() => {
    chromeStub = installChromeStub();
    map = new Map();
    // 用内存假 IndexedDB 替掉真实的 indexedDB.open（保持 LocalMediaStore 代码路径不变）
    vi.spyOn(LocalMediaStore.prototype, 'open').mockResolvedValue(makeFakeDb(map) as any);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    chromeStub?.uninstall();
  });

  /** 搭一套最小「Shell → Kernel」双向 RPC，media 服务用真实 facade + 真实 store。 */
  function buildServerClient() {
    const bgIpc = new IPC({ origin: 'bg' });
    new IPCTransport(bgIpc, 'kernel').init();
    const server = new RPCServer(bgIpc);
    // 关闭远端资源服务器 → createMediaStore 走本地 IndexedDB 后端
    const store = createMediaStore(() => ({ resourceServer: { enabled: false } }));
    server.expose('media', createMediaFacade(store), { methods: ['put', 'get', 'getMany', 'delete'] });

    const shIpc = new IPC({ origin: 'sh' });
    new IPCTransport(shIpc, 'shell').init();
    const client = new RPCClient(shIpc);
    const api = createApiClient(client);
    return { store, api };
  }

  it('上传图片 → 存本地 → 经 resolver 取回 → 序列化为 OpenAI image_url part', async () => {
    const { store, api } = buildServerClient();

    // 1) Shell 侧经 RPC 上传（与 ChatPage.addFiles 同款调用形态）
    const res = await api.media.put({ dataUrl: PNG, mimeType: 'image/png', filename: 'a.png' });
    expect(res?.id?.startsWith('local_')).toBe(true);

    // 2) 取回一致，且底层存储确实写入了
    const got = await api.media.get({ id: res!.id! });
    expect(got?.url).toBe(PNG);
    expect(map.has(res!.id!)).toBe(true);

    // 3) 组装一条带图片的用户消息，经真实 mediaResolver 解析后序列化
    const session = {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '看这张图' },
          { type: 'media', kind: 'image', mediaId: res!.id },
        ],
      }],
    };
    const { messages, mediaWarnings } = await new ContextBuilder().buildMessages(
      session as any, { contextWindowSize: 20 }, [], (id) => store.get(id),
    );

    // 4) 请求体含 image_url，且 url 是原始 dataURL（模型能看见）
    const userMsg = messages[messages.length - 1] as any;
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imgPart = userMsg.content.find((p: any) => p.type === 'image_url');
    expect(imgPart).toBeTruthy();
    expect(imgPart.image_url.url).toBe(PNG);
    expect(mediaWarnings).toEqual([]);
  });

  it('混合 文本 + 图片 + 音频：本地媒体全部内联为 base64 parts', async () => {
    const { store, api } = buildServerClient();
    const imgRes = await api.media.put({ dataUrl: PNG, mimeType: 'image/png', filename: 'a.png' });
    const audRes = await api.media.put({ dataUrl: WAV, mimeType: 'audio/wav', filename: 'b.wav' });

    const session = {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '图文音一起' },
          { type: 'media', kind: 'image', mediaId: imgRes!.id },
          { type: 'media', kind: 'audio', mediaId: audRes!.id },
        ],
      }],
    };
    const { messages, mediaWarnings } = await new ContextBuilder().buildMessages(
      session as any, { contextWindowSize: 20 }, [], (id) => store.get(id),
    );
    const parts = (messages[messages.length - 1] as any).content;
    expect(parts.find((p: any) => p.type === 'image_url')).toBeTruthy();

    const audioPart = parts.find((p: any) => p.type === 'input_audio');
    expect(audioPart).toBeTruthy();
    expect(audioPart.input_audio.format).toBe('wav');
    expect(audioPart.input_audio.data).toBe('UklGRg==');
    expect(mediaWarnings).toEqual([]);
  });

  it('孤儿 mediaId（store 无此记录）：resolver 返回 null → 产出警告且不发残缺 image_url', async () => {
    const { store, api } = buildServerClient();
    const session = {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图没了' },
          { type: 'media', kind: 'image', mediaId: 'local_does_not_exist' },
        ],
      }],
    };
    const { messages, mediaWarnings } = await new ContextBuilder().buildMessages(
      session as any, { contextWindowSize: 20 }, [], (id) => store.get(id),
    );
    expect(mediaWarnings.some((w: string) => w.includes('无法解析'))).toBe(true);
    // 降级为文本占位，不发出 image_url 残缺块（避免模型收残缺请求）
    const parts = (messages[messages.length - 1] as any).content;
    expect(parts.find((p: any) => p.type === 'image_url')).toBeFalsy();
  });

  it('RPC 传输层：media.put 经 createApiClient 代理正确路由到 media.put 方法', async () => {
    const { api } = buildServerClient();
    // 直接断言代理调用形态（与 ChatPage/渲染层使用方式一致），并验证返回值形态
    const r = await api.media.put({ dataUrl: PNG, mimeType: 'image/png', filename: 'x.png' });
    expect(r).toHaveProperty('id');
    expect(typeof r.id).toBe('string');
  });
});
