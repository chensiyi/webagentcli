/**
 * ManageUserScriptsTool - 用户脚本管理工具
 * 允许 AI 查看、安装、编辑、启用、禁用和删除用户脚本
 *
 * 运行在 Service Worker 中，直接调用 chrome API。
 *
 * 注意：所有脚本的读写都通过内核 ScriptsManager（内核 storage 层），
 * 不再直接访问 chrome.storage —— 与 UI（RPC facade）路径共用同一数据源。
 *
 * 注入注册（syncRegisteredScripts）随本文件一并维护，是本工具的自有逻辑；
 * 同时以命名导出提供给 rpc-facades（UI 路径）与 main.ts（首次启动）复用，
 * 保证「AI 工具路径」与「UI 路径」的注入行为完全一致。
 */
import { Tool } from 'kernel/models/Tool.js';
import { wrapWithGM, RUN_AT_MAP } from '../gm-api.js';
import { Log } from 'kernel/services/Log.js';
import { USER_SCRIPT_WORLD, MAIN_WORLD, DEFAULT_RUN_AT } from '../keys.js';
import { reconcileScriptTools } from '../script-tools.js';

/**
 * 把内核 ScriptsManager 中「已启用且有 @match」的脚本同步注册到 chrome.userScripts。
 *
 * 关键事实：chrome.userScripts.register 的注册是「持久化 + 声明式」的。
 * 一旦注册成功，浏览器会在匹配页面自动注入，完全不依赖 SW / 内核是否还存活。
 * 因此「注入」本体不需要任何运行时监听器 → SW 回收后注入照常工作，也无监听器累积。
 *
 * world 选择：
 *   - @grant 含 GM_*（需要 chrome.* 权限）→ USER_SCRIPT_WORLD（隔离世界，有 chrome 权限）
 *   - @grant none（纯页面操作）            → MAIN_WORLD（页面主世界，可访问真实 DOM）
 */
export async function syncRegisteredScripts(scriptsManager) {
  // 若扩展未开启「允许用户脚本」开关（Chrome 138+），chrome.userScripts 整个命名空间为
  // undefined，直接调用 unregister/register 会抛 TypeError 并导致内核启动失败。
  // 此处优雅降级：跳过注册并告警，内核其余功能不受影响。
  if (typeof chrome.userScripts?.unregister !== 'function') {
    Log.warn(
      'ManageUserScriptsTool',
      'chrome.userScripts 不可用（未在扩展详情页开启「允许用户脚本」开关）。已跳过用户脚本注入注册，内核其余功能正常。'
    );
    return;
  }

  const scripts = (await scriptsManager.loadAll()) || [];
  const enabled = scripts.filter(
    (s) => s.enabled && Array.isArray(s.match) && s.match.length > 0
  );

  const registrations = enabled.map((s) => {
    const usesGrant =
      Array.isArray(s.grant) &&
      s.grant.some((g) => typeof g === 'string' && g.startsWith('GM_'));
    const reg = {
      id: s.id,
      matches: s.match,
      js: [{ code: wrapWithGM(s.code, s) }],
      world: usesGrant ? USER_SCRIPT_WORLD : MAIN_WORLD,
      runAt: RUN_AT_MAP[s.runAt] || DEFAULT_RUN_AT,
    };
    // @include（glob）→ includeGlobs；@exclude（URL 模式）→ excludeMatches
    if (Array.isArray(s.include) && s.include.length > 0) reg.includeGlobs = s.include;
    if (Array.isArray(s.exclude) && s.exclude.length > 0) reg.excludeMatches = s.exclude;
    return reg;
  });

  // 先整体反注册再重新注册：幂等且能正确反映「禁用 / 删除」后的状态。
  await chrome.userScripts.unregister();
  if (registrations.length > 0) {
    await chrome.userScripts.register(registrations);
  }

  Log.info('ManageUserScriptsTool', `Synced ${registrations.length} user scripts`);
}

class ManageUserScriptsTool extends Tool {
  constructor(kernel) {
    super({
      name: 'manage_user_scripts',
      description: '管理存储在当前浏览器中的用户脚本（UserScript）。\n可用操作：\n- list: 列出所有已安装的脚本（不含代码内容）\n- get: 获取单个脚本的完整信息（含代码）\n- install: 安装新脚本（需要包含代码，会自动解析 @name/@match 等元数据）\n- update: 更新已有脚本的代码\n- toggle: 启用/禁用脚本\n- delete: 删除脚本\n注意：\n- 脚本存储在 chrome.storage 中，卸载扩展后数据会丢失\n- 脚本会在匹配 @match 规则的页面自动注入执行',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：list, get, install, update, toggle, delete',
            enum: ['list', 'get', 'install', 'update', 'toggle', 'delete']
          },
          code: { type: 'string', description: '脚本代码（install/update 时需要）' },
          id: { type: 'string', description: '脚本 ID（get/update/toggle/delete 时需要）' },
          enabled: { type: 'boolean', description: '启用/禁用（toggle 时需要）' }
        },
        required: ['action']
      },
      handler: async (args, context) => {
        // 统一通过内核 ScriptsManager 访问 storage（内核指定的 storage 层）
        const sm = this.kernel.getScriptsManager();

        const getScriptById = async (id) => {
          const scripts = await sm.loadAll();
          const script = scripts.find((s) => s.id === id);
          if (!script) throw new Error('脚本不存在');
          return script;
        };

        switch (args.action) {
          case 'list': {
            const all = await sm.loadAll();
            return all.map(({ code, ...rest }) => rest);
          }

          case 'get': {
            if (!args.id) throw new Error('id is required');
            return await getScriptById(args.id);
          }

          case 'install': {
            if (!args.code) throw new Error('code is required');
            const installed = await sm.install(args.code);
            // 安装后重新注册到 chrome.userScripts（持久化注入）
            await this.syncRegisteredScripts();
            // 同步把 @tool 脚本注册成 AI 工具
            await this._reconcileTools();
            return installed;
          }

          case 'update': {
            if (!args.id) throw new Error('id is required');
            if (!args.code) throw new Error('code is required');
            await sm.edit(args.id, args.code);
            await this.syncRegisteredScripts();
            await this._reconcileTools();
            return (await sm.loadAll()).find((s) => s.id === args.id);
          }

          case 'toggle': {
            if (!args.id) throw new Error('id is required');
            if (args.enabled === undefined) throw new Error('enabled is required');
            await sm.toggle(args.id, args.enabled);
            await this.syncRegisteredScripts();
            await this._reconcileTools();
            return (await sm.loadAll()).find((s) => s.id === args.id);
          }

          case 'delete': {
            if (!args.id) throw new Error('id is required');
            await sm.uninstall(args.id);
            await this.syncRegisteredScripts();
            await this._reconcileTools();
            return { success: true, id: args.id };
          }

          default:
            throw new Error(`Unknown action: ${args.action}`);
        }
      }
    });
    this.kernel = kernel;
  }

  /** 从内核 ScriptsManager 读取脚本并同步注册到 chrome.userScripts */
  async syncRegisteredScripts() {
    await syncRegisteredScripts(this.kernel.getScriptsManager());
  }

  /** 把 @tool 脚本同步注册为 AI 工具（P2 自动注册） */
  async _reconcileTools() {
    reconcileScriptTools(this.kernel.getScriptsManager(), this.kernel.getToolsManager());
  }
}

export { ManageUserScriptsTool };
