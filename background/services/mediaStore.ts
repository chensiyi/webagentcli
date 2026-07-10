/**
 * mediaStore.ts — 媒体二进制存储（IndexedDB）
 *
 * 为什么不是 chrome.storage.local：
 *   chrome.storage.local 配额仅 ~5–10MB，一张图 base64 就几十 KB~几 MB，
 *   多张图直接撑爆。IndexedDB 配额大得多（通常按磁盘比例），适合存媒体 blob。
 *
 * 设计：
 * - 消息 JSON（存于 chrome.storage.local）只持有 `mediaId` 引用，绝不存 base64。
 * - 这里以 dataURL 字符串形式存 blob（IndexedDB 存字符串简单且与发给模型的形状一致）。
 * - 展示/发送时由 Shell 经 `media.get(id)` 换取 dataURL。
 */

export interface StoredMedia {
  id: string;
  dataUrl: string;
  mimeType: string;
  filename?: string;
  size?: number;
  createdAt: number;
}

const DB_NAME = 'webagent-media';
const STORE = 'blobs';
const VERSION = 1;

export class MediaStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  private reqAsync<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** 存一个媒体，返回 mediaId。input 可为 dataURL 字符串或 Blob。 */
  async put(input: Blob | string, mimeType: string, filename?: string): Promise<string> {
    const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let dataUrl: string;
    let size = 0;
    if (typeof input === 'string') {
      dataUrl = input;
      size = dataUrl.length;
    } else {
      dataUrl = await blobToDataUrl(input);
      size = input.size;
    }
    const rec: StoredMedia = { id, dataUrl, mimeType, filename, size, createdAt: Date.now() };
    const store = await this.tx('readwrite');
    await this.reqAsync(store.put(rec));
    return id;
  }

  /** 换取 mediaId 对应的 dataURL（展示/发送用）。不存在返回 null。 */
  async get(id: string): Promise<string | null> {
    const store = await this.tx('readonly');
    const rec = await this.reqAsync(store.get(id) as IDBRequest<StoredMedia | undefined>);
    return rec ? rec.dataUrl : null;
  }

  /** 批量换取多个 mediaId 的 dataURL，返回 {id: dataUrl}。 */
  async getMany(ids: string[]): Promise<Record<string, string>> {
    const store = await this.tx('readonly');
    const out: Record<string, string> = {};
    await Promise.all((ids || []).map(async (id) => {
      const rec = await this.reqAsync(store.get(id) as IDBRequest<StoredMedia | undefined>);
      if (rec) out[id] = rec.dataUrl;
    }));
    return out;
  }

  async delete(id: string): Promise<void> {
    const store = await this.tx('readwrite');
    await this.reqAsync(store.delete(id));
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** 工厂：供 background/main.ts 组装唯一实例并 expose 给 Shell。 */
export function createMediaStore(): MediaStore {
  return new MediaStore();
}
