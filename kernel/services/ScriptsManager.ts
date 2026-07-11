import { BaseScriptsManager } from './IScriptsManager.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import { StorageKeys } from '../Keys.js';
import { IPC } from '../IPC.js';
import { IStorageManager } from './IStorageManager.js';
import { UserScript } from '../models/Scripts.js';
import { Log } from './Log.js';
import { genId } from '../utils/id.js';

/** 最小 Kernel 接口，避免与 Kernel.ts 产生循环引用 */
interface KernelRef {
  getIPC(): IPC | null;
  getStorageManager(): IStorageManager | null;
}

export class ScriptsManager extends BaseScriptsManager {
  kernel: KernelRef;
  ipc: IPC | null;
  scriptsChannel: IPC | null;
  storage: IStorageManager | null;
  scripts: UserScript[];

  constructor(kernel: KernelRef) {
    super();
    this.kernel = kernel;
    this.ipc = kernel?.getIPC();
    this.scriptsChannel = this.ipc?.getOrCreateChannel(KernelChannels.SCRIPTS) || null;
    this.storage = kernel?.getStorageManager?.() || null;
    this.scripts = [];
  }

  /** 从 storage 加载所有脚本并返回 */
  async loadAll(): Promise<UserScript[]> {
    try {
      if (this.storage) {
        const stored = await this.storage.get(StorageKeys.USER_SCRIPTS);
        this.scripts = Array.isArray(stored) ? stored as UserScript[] : [];
      }
    } catch (e) {
      Log.error('ScriptsManager', 'Failed to load scripts from storage:', e);
      this.scripts = [];
    }
    this.scriptsChannel?.emit(KernelEvents.SCRIPTS.LOADED, { scripts: [...this.scripts] });
    return [...this.scripts];
  }

  /** 持久化到 storage */
  private async _save(): Promise<void> {
    try {
      if (this.storage) {
        await this.storage.set(StorageKeys.USER_SCRIPTS, this.scripts);
      }
    } catch (e) {
      Log.error('ScriptsManager', 'Failed to save scripts to storage:', e);
    }
  }

  getScripts(): UserScript[] { return this.scripts; }

  add(script: UserScript): void { this.scripts.push(script); }

  remove(id: string): void {
    const i = this.scripts.findIndex(s => s.id === id);
    if (i !== -1) this.scripts.splice(i, 1);
  }

  get(id: string): UserScript | null {
    return this.scripts.find(s => s.id === id) || null;
  }

  clear(): void { this.scripts = []; }

  /** 解析 Tampermonkey 用户脚本头部元数据 */
  parseMetadata(code: string): Partial<UserScript> {
    const metadata: Partial<UserScript> = {
      name: '', namespace: '', version: '', description: '', author: '', match: [], grant: []
    };
    const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!match) return metadata;
    const block = match[1];
    (['name', 'namespace', 'version', 'description', 'author'] as const).forEach(k => {
      const m = block.match(new RegExp('@' + k + '\\s+(.+)'));
      if (m) (metadata as any)[k] = m[1].trim();
    });
    const matchRegex = /@match\s+(.+)/g;
    let m: RegExpExecArray | null;
    const matchArr: string[] = [];
    while ((m = matchRegex.exec(block)) !== null) matchArr.push(m[1].trim());
    metadata.match = matchArr;
    const grantRegex = /@grant\s+(.+)/g;
    const grantArr: string[] = [];
    let g: RegExpExecArray | null;
    while ((g = grantRegex.exec(block)) !== null) grantArr.push(g[1].trim());
    metadata.grant = grantArr;
    if (!metadata.name) metadata.name = '未命名脚本';
    return metadata;
  }

  async install(code: string): Promise<UserScript> {
    const meta = this.parseMetadata(code);
    const script: UserScript = {
      id: genId('script'),
      code,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name: meta.name || '未命名脚本',
      namespace: meta.namespace || '',
      version: meta.version || '',
      description: meta.description || '',
      author: meta.author || '',
      match: meta.match || [],
      grant: meta.grant || []
    } as UserScript;
    this.scripts.push(script);
    await this._save();
    await this.loadAll();
    return script;
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const s = this.get(id);
    if (s) {
      s.enabled = enabled;
      s.updatedAt = Date.now();
      await this._save();
      await this.loadAll();
    }
  }

  async edit(id: string, code: string): Promise<void> {
    const s = this.get(id);
    if (s) {
      const meta = this.parseMetadata(code);
      s.code = code;
      s.name = meta.name || s.name;
      s.namespace = meta.namespace || s.namespace;
      s.version = meta.version || s.version;
      s.description = meta.description || s.description;
      s.author = meta.author || s.author;
      s.match = meta.match || s.match;
      s.grant = meta.grant || s.grant;
      s.updatedAt = Date.now();
      await this._save();
      await this.loadAll();
    }
  }

  async uninstall(id: string): Promise<void> {
    this.remove(id);
    await this._save();
    await this.loadAll();
  }

  // 保持 updateCode 别名兼容
  async updateCode(id: string, code: string): Promise<void> {
    return this.edit(id, code);
  }
}