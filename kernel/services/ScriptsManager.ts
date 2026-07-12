import { BaseScriptsManager } from './IScriptsManager.js';
import { KernelEvents, KernelChannels } from '../Events.js';
import { StorageKeys } from '../Keys.js';
import { IPC } from '../IPC.js';
import { IStorageManager } from './IStorageManager.js';
import type { UserScript, ScriptToolMeta, ScriptToolParam } from '../models/Scripts.js';
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
      name: '', namespace: '', version: '', description: '', author: '',
      match: [], include: [], exclude: [], grant: [], runAt: '', icon: '', require: [], resource: [],
    };
    const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!match) return metadata;
    const block = match[1];
    (['name', 'namespace', 'version', 'description', 'author', 'run-at', 'icon'] as const).forEach(k => {
      const m = block.match(new RegExp('@' + k + '\\s+(.+)'));
      if (m) (metadata as any)[k === 'run-at' ? 'runAt' : k] = m[1].trim();
    });
    const matchRegex = /@match\s+(.+)/g;
    let m: RegExpExecArray | null;
    const matchArr: string[] = [];
    while ((m = matchRegex.exec(block)) !== null) matchArr.push(m[1].trim());
    metadata.match = matchArr;
    const includeRegex = /@include\s+(.+)/g;
    const includeArr: string[] = [];
    while ((m = includeRegex.exec(block)) !== null) includeArr.push(m[1].trim());
    metadata.include = includeArr;
    const excludeRegex = /@exclude\s+(.+)/g;
    const excludeArr: string[] = [];
    while ((m = excludeRegex.exec(block)) !== null) excludeArr.push(m[1].trim());
    metadata.exclude = excludeArr;
    const grantRegex = /@grant\s+(.+)/g;
    const grantArr: string[] = [];
    let g: RegExpExecArray | null;
    while ((g = grantRegex.exec(block)) !== null) grantArr.push(g[1].trim());
    metadata.grant = grantArr;
    const requireRegex = /@require\s+(.+)/g;
    const requireArr: string[] = [];
    while ((g = requireRegex.exec(block)) !== null) requireArr.push(g[1].trim());
    metadata.require = requireArr;
    const resourceRegex = /@resource\s+(\S+)\s+(.+)/g;
    const resourceArr: { name: string; url: string }[] = [];
    let r: RegExpExecArray | null;
    while ((r = resourceRegex.exec(block)) !== null) resourceArr.push({ name: r[1].trim(), url: r[2].trim() });
    metadata.resource = resourceArr;
    if (!metadata.name) metadata.name = '未命名脚本';
    // @tool 声明：脚本经 P2 自动注册为 AI 工具
    const toolMeta = this._parseToolMeta(block);
    if (toolMeta) (metadata as Record<string, unknown>).toolMeta = toolMeta;
    return metadata;
  }

  /**
   * 解析 @tool 工具声明（P2：脚本自动注册为 AI 工具）。
   * 语法（写在 ==UserScript== 块内，逐行）：
   *   @tool                                  标记：本脚本是一个工具
   *   @tool.name        <name>            工具名（缺省由脚本 @name slug 化推导）
   *   @tool.description <text>            工具说明（缺省用脚本 @description）
   *   @tool.danger                          危险标记：执行前需人工确认
   *   @tool.param.<p>  <type> [<desc>]   参数声明（type∈string/number/boolean/integer/array/object）
   *   @tool.enum.<p>   a|b|c               参数枚举约束
   * 无 @tool 标记则返回 null（非工具脚本）。
   */
  private _parseToolMeta(block: string): ScriptToolMeta | null {
    let isTool = false;
    let name: string | undefined;
    let description: string | undefined;
    let danger = false;
    const params = new Map<string, ScriptToolParam>();
    const enums = new Map<string, string[]>();
    for (const raw of block.split('\n')) {
      let line = raw.trim();
      // 去掉 Tampermonkey 注释前缀 `// `（元数据块里每行形如 `// @tool ...`）
      line = line.replace(/^\/\/\s?/, '').trim();
      // sub 允许带点（如 param.q / enum.m）；rest 为后续值
      const m = line.match(/^@tool(?:\.([\w.]+))?\s*(.*)$/);
      if (!m) continue;
      const sub = m[1];           // undefined | name | description | danger | param.q | enum.m
      const rest = (m[2] || '').trim();
      if (!sub) { isTool = true; continue; }
      if (sub === 'name') { name = rest; continue; }
      if (sub === 'description') { description = rest; continue; }
      if (sub === 'danger') { danger = true; continue; }
      if (sub.startsWith('param.')) {
        const pname = sub.slice('param.'.length);
        const pm = rest.match(/^(\S+)\s+(.*)$/); // <type> [<free desc>]
        if (pname && pm) {
          params.set(pname, { name: pname, type: pm[1], description: (pm[2] || '').trim() || undefined });
        }
        continue;
      }
      if (sub.startsWith('enum.')) {
        const pname = sub.slice('enum.'.length);
        if (pname) enums.set(pname, rest.split('|').map(s => s.trim()).filter(Boolean));
        continue;
      }
    }
    if (!isTool) return null;
    for (const [pname, vals] of enums) {
      const p = params.get(pname);
      if (p) p.enum = vals;
    }
    return { isTool: true, name, description, danger, params: Array.from(params.values()) };
  }

  /**
   * 解析 @require（拉取外部库并拼接为前置代码）与 @resource（拉取内容为文本）。
   * 在 install / edit 时调用；拉取失败则降级为空（仅告警，不阻断安装）。
   * 之所以在安装期解析而非运行时，是因为 chrome.userScripts.register 需要「最终 JS」，
   * 无法在注入时再发网络请求；结果随脚本持久化，离线也可注入。
   */
  private async _resolveIncludes(meta: Partial<UserScript>): Promise<{ requireCode: string; resources: Record<string, string> }> {
    let requireCode = '';
    let resources: Record<string, string> = {};
    try {
      if (Array.isArray(meta.require) && meta.require.length > 0) {
        const libs = await Promise.all(
          meta.require.map((u) => this._fetchText(u).catch(() => ''))
        );
        requireCode = libs.filter(Boolean).join('\n;\n');
      }
      if (Array.isArray(meta.resource) && meta.resource.length > 0) {
        const entries = await Promise.all(
          meta.resource.map(async (item) => {
            const text = await this._fetchText(item.url).catch(() => '');
            return [item.name, text] as const;
          })
        );
        resources = Object.fromEntries(entries);
      }
    } catch (e) {
      Log.warn('ScriptsManager', 'require/resource resolve error', e);
    }
    return { requireCode, resources };
  }

  /** 拉取文本（wrap fetch，便于各调用点 catch 降级） */
  private async _fetchText(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  }

  async install(code: string): Promise<UserScript> {
    if (!code || !code.trim()) throw new Error('脚本代码不能为空');
    if (!/==UserScript==/.test(code)) throw new Error('缺少 ==UserScript== 元数据头，无法识别为用户脚本');
    const meta = this.parseMetadata(code);
    const { requireCode, resources } = await this._resolveIncludes(meta);
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
      include: meta.include || [],
      exclude: meta.exclude || [],
      grant: meta.grant || [],
      runAt: meta.runAt || '',
      icon: meta.icon || '',
      require: meta.require || [],
      resource: meta.resource || [],
      requireCode,
      resources,
      toolMeta: (meta as Record<string, unknown>).toolMeta as ScriptToolMeta | null || null,
    } as UserScript;
    this.scripts.push(script);
    await this._save();
    await this.loadAll();
    this.scriptsChannel?.emit(KernelEvents.SCRIPTS.CHANGED, { reason: 'install', id: script.id });
    return script;
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const s = this.get(id);
    if (s) {
      s.enabled = enabled;
      s.updatedAt = Date.now();
      await this._save();
      await this.loadAll();
      this.scriptsChannel?.emit(KernelEvents.SCRIPTS.CHANGED, { reason: 'toggle', id });
    }
  }

  async edit(id: string, code: string): Promise<void> {
    if (!code || !code.trim()) throw new Error('脚本代码不能为空');
    const s = this.get(id);
    if (s) {
      const meta = this.parseMetadata(code);
      const { requireCode, resources } = await this._resolveIncludes(meta);
      s.code = code;
      s.name = meta.name || s.name;
      s.namespace = meta.namespace || s.namespace;
      s.version = meta.version || s.version;
      s.description = meta.description || s.description;
      s.author = meta.author || s.author;
      s.match = meta.match || s.match;
      s.include = meta.include || s.include;
      s.exclude = meta.exclude || s.exclude;
      s.grant = meta.grant || s.grant;
      s.runAt = meta.runAt || s.runAt;
      s.icon = meta.icon || s.icon;
      s.require = meta.require || s.require;
      s.resource = meta.resource || s.resource;
      s.requireCode = requireCode;
      s.resources = resources;
      s.toolMeta = (meta as Record<string, unknown>).toolMeta as ScriptToolMeta | null || null;
      s.updatedAt = Date.now();
      await this._save();
      await this.loadAll();
      this.scriptsChannel?.emit(KernelEvents.SCRIPTS.CHANGED, { reason: 'edit', id });
    }
  }

  async uninstall(id: string): Promise<void> {
    this.remove(id);
    await this._save();
    await this.loadAll();
    this.scriptsChannel?.emit(KernelEvents.SCRIPTS.CHANGED, { reason: 'uninstall', id });
  }

  // 保持 updateCode 别名兼容
  async updateCode(id: string, code: string): Promise<void> {
    return this.edit(id, code);
  }
}