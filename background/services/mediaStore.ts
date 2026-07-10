/**
 * mediaStore.ts — 媒体二进制存储（可插拔后端）
 *
 * 为什么不用 chrome.storage.local：
 *   chrome.storage.local 配额仅 ~5–10MB，一张图 base64 就几十 KB~几 MB，
 *   多张图直接撑爆。媒体二进制应走大容量、支持 Blob 的存储。
 *
 * 后端策略（按设置切换，用户自己管理）：
 * - local（默认）：IndexedDB 存 dataURL 字符串。消息 JSON 只持 mediaId，绝存 base64。
 * - remote（资源服务器）：通用 HTTP 上传到用户自有服务器，消息只持 mediaId，
 *   实际内容由服务器托管、返回公网 URL。失败时**直接抛错**（用户选择，不静默回退本地）。
 *
 * id 前缀路由：local_ / remote_，使 get/delete 能定位到正确的后端，
 * 且即使设置中途切换，旧消息的 mediaId 仍能正确解析。
 */

export interface ResourceServerConfig {
  enabled?: boolean;
  /** 上传端点，例如 https://my-bucket.example.com/upload */
  uploadUrl?: string;
  /** HTTP 方法，默认 POST */
  method?: 'POST' | 'PUT';
  /** 鉴权请求头名（可选），例如 Authorization */
  authHeader?: string;
  /** 鉴权令牌（可选） */
  authToken?: string;
  /** 响应 JSON 中取出 URL 的字段名（支持点路径），默认 'url' */
  responseUrlField?: string;
  /** 拼到返回 URL 前的固定前缀（可选） */
  urlPrefix?: string;
}

export interface MediaStoreLike {
  /** 存一个媒体，返回 mediaId（local_/remote_ 前缀）。input 可为 dataURL 字符串或 Blob。 */
  put(input: Blob | string, mimeType: string, filename?: string): Promise<string>;
  /** 换取 mediaId 对应的内容：local 返回 dataURL，remote 返回公网 URL。不存在返回 null。 */
  get(id: string): Promise<string | null>;
  getMany(ids: string[]): Promise<Record<string, string>>;
  delete(id: string): Promise<void>;
}

// =============================================================================
// Local 后端：IndexedDB
// =============================================================================
const LOCAL_PREFIX = 'local_';

export class LocalMediaStore implements MediaStoreLike {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('webagent-media', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction('blobs', mode).objectStore('blobs');
  }

  private reqAsync<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(input: Blob | string, mimeType: string, filename?: string): Promise<string> {
    const id = LOCAL_PREFIX + `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let dataUrl: string;
    let size = 0;
    if (typeof input === 'string') {
      dataUrl = input;
      size = dataUrl.length;
    } else {
      dataUrl = await blobToDataUrl(input);
      size = input.size;
    }
    const rec = { id, dataUrl, mimeType, filename, size, createdAt: Date.now() };
    const store = await this.tx('readwrite');
    await this.reqAsync(store.put(rec));
    return id;
  }

  async get(id: string): Promise<string | null> {
    const store = await this.tx('readonly');
    const rec = await this.reqAsync(store.get(id) as IDBRequest<any>);
    return rec ? rec.dataUrl : null;
  }

  async getMany(ids: string[]): Promise<Record<string, string>> {
    const store = await this.tx('readonly');
    const out: Record<string, string> = {};
    await Promise.all((ids || []).map(async (id) => {
      const rec = await this.reqAsync(store.get(id) as IDBRequest<any>);
      if (rec) out[id] = rec.dataUrl;
    }));
    return out;
  }

  async delete(id: string): Promise<void> {
    const store = await this.tx('readwrite');
    await this.reqAsync(store.delete(id));
  }
}

// =============================================================================
// Remote 后端：通用 HTTP 上传到用户自有资源服务器
// =============================================================================
const REMOTE_PREFIX = 'remote_';

export class RemoteMediaStore implements MediaStoreLike {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('webagent-media-remote', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('urls')) {
          db.createObjectStore('urls', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction('urls', mode).objectStore('urls');
  }

  private reqAsync<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 上传到资源服务器，返回 mediaId（remote_ 前缀）。
   * 失败（配置缺失 / 网络错误 / 非 2xx / 响应无 URL）**直接抛错**，不静默回退本地。
   */
  async put(input: Blob | string, mimeType: string, filename: string | undefined, cfg: ResourceServerConfig): Promise<string> {
    if (!cfg?.enabled) throw new Error('资源服务器未启用');
    const uploadUrl = (cfg.uploadUrl || '').trim();
    if (!uploadUrl) throw new Error('资源服务器上传链接未配置');

    const blob: Blob = typeof input === 'string' ? await dataUrlToBlob(input) : input;
    const form = new FormData();
    form.append('file', blob, filename || `media.${mimeType?.split('/')[1] || 'bin'}`);
    form.append('mimeType', mimeType || '');

    const headers: Record<string, string> = {};
    if (cfg.authHeader && cfg.authToken) headers[cfg.authHeader] = cfg.authToken;

    const resp = await fetch(uploadUrl, { method: cfg.method || 'POST', body: form, headers });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`资源服务器上传失败 HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const json = await resp.json().catch(() => ({} as Record<string, unknown>));
    const field = cfg.responseUrlField || 'url';
    const url = readPath(json, field);
    if (!url || typeof url !== 'string') {
      throw new Error(`资源服务器响应缺少 URL 字段 "${field}"`);
    }
    const finalUrl = (cfg.urlPrefix || '') + url;

    const id = REMOTE_PREFIX + `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const store = await this.tx('readwrite');
    await this.reqAsync(store.put({ id, url: finalUrl, createdAt: Date.now() }));
    return id;
  }

  async get(id: string): Promise<string | null> {
    const store = await this.tx('readonly');
    const rec = await this.reqAsync(store.get(id) as IDBRequest<any>);
    return rec ? rec.url : null;
  }

  async getMany(ids: string[]): Promise<Record<string, string>> {
    const store = await this.tx('readonly');
    const out: Record<string, string> = {};
    await Promise.all((ids || []).map(async (id) => {
      const rec = await this.reqAsync(store.get(id) as IDBRequest<any>);
      if (rec) out[id] = rec.url;
    }));
    return out;
  }

  async delete(id: string): Promise<void> {
    // 仅删除本地索引；远端服务器上的文件由用户自行管理（无法跨域删除）
    const store = await this.tx('readwrite');
    await this.reqAsync(store.delete(id));
  }
}

// =============================================================================
// 门面：按设置选择后端，按 id 前缀路由读取
// =============================================================================
export function createMediaStore(
  getSettings?: () => { resourceServer?: ResourceServerConfig } | null | undefined,
): MediaStoreLike {
  const local = new LocalMediaStore();
  const remote = new RemoteMediaStore();

  const cfg = (): ResourceServerConfig | undefined => getSettings?.()?.resourceServer;

  return {
    async put(input, mimeType, filename) {
      if (cfg()?.enabled) return remote.put(input, mimeType, filename, cfg()!);
      return local.put(input, mimeType, filename);
    },
    async get(id) {
      if (!id) return null;
      if (id.startsWith(REMOTE_PREFIX)) return remote.get(id);
      return local.get(id);
    },
    async getMany(ids) {
      const out: Record<string, string> = {};
      const localIds: string[] = [];
      const remoteIds: string[] = [];
      for (const id of ids || []) (id.startsWith(REMOTE_PREFIX) ? remoteIds : localIds).push(id);
      const [l, r] = await Promise.all([local.getMany(localIds), remote.getMany(remoteIds)]);
      return { ...l, ...r };
    },
    async delete(id) {
      if (!id) return;
      if (id.startsWith(REMOTE_PREFIX)) return remote.delete(id);
      return local.delete(id);
    },
  };
}

// =============================================================================
// 工具函数
// =============================================================================
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** dataURL → Blob（上传远端时用，避免二次 base64） */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** 按点路径从对象取字段，例如 'data.url' */
function readPath(obj: Record<string, unknown>, path: string): unknown {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), obj);
}
