/**
 * script-tools — 用户脚本 ↔ AI 工具的协调器（P2 自动注册）
 *
 * 内核侧把「已启用且含 @tool 声明」的用户脚本，自动注册成 source='script'
 * 的 Tool，使大模型像调用内置工具一样调用用户脚本。脚本编辑/启停后，
 * 注册表实时增删改，无需重启。
 *
 * 设计要点：
 * - 单一真源：脚本数据在 ScriptsManager，工具注册只是其「投影」。
 *   reconcile 每次全量对比（wanted vs 已注册），保证幂等。
 * - 与内置工具隔离：同名冲突时跳过（warn），绝不覆盖 builtin。
 * - 安全性：@tool.danger 脚本注册为 danger 工具，执行前仍走 ToolsManager
 *   的危险确认闸门（与 run_user_script 同一套）。
 */
import { Log } from 'kernel/services/Log.js';
import { toolNameFor, createScriptTool } from './tools/ScriptTool.js';

/**
 * 依据当前已安装脚本，把 @tool 脚本同步到 ToolsManager 注册表。
 * 幂等：可反复调用（脚本增删改/启停后都调用一次即可）。
 *
 * @param scriptsManager  提供 getScripts() / get(id)
 * @param toolsManager    提供 get / getBySource / register / update / unregister
 */
export function reconcileScriptTools(scriptsManager, toolsManager) {
  if (!scriptsManager || !toolsManager) return;

  // 1. 计算「期望注册」集合（仅已启用 + 含 @tool）
  const wanted = new Map(); // toolName -> script
  const scripts = (scriptsManager.getScripts && scriptsManager.getScripts()) || [];
  for (const s of scripts) {
    if (!s || s.enabled === false) continue;
    const meta = s.toolMeta;
    if (!meta || !meta.isTool) continue;
    const name = toolNameFor(s);
    wanted.set(name, s);
  }

  // 2. 注销：已注册但不再期望的 script 工具
  for (const t of toolsManager.getBySource('script')) {
    if (!wanted.has(t.name)) {
      toolsManager.unregister(t.name);
    }
  }

  // 3. 注册 / 更新：期望但缺失或变化
  for (const [name, s] of wanted) {
    const existing = toolsManager.get(name);
    // 与内置（或外部来源）工具同名冲突：跳过，不覆盖
    if (existing && existing.source !== 'script') {
      Log.warn('script-tools', `工具名 "${name}" 已被来源(${existing.source})占用，跳过 @tool 注册`);
      continue;
    }
    const tool = createScriptTool(s, (id) => scriptsManager.get(id));
    if (existing) {
      // 就地更新（保留 Tool 实例引用，复用既有 enabled 覆盖）
      toolsManager.update(name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: tool.handler,
        version: tool.version,
        danger: tool.danger,
        metadata: tool.metadata,
        category: tool.category,
        tags: tool.tags,
      });
    } else {
      try {
        toolsManager.register(tool);
      } catch (e) {
        Log.warn('script-tools', `注册工具 "${name}" 失败：${(e).message}`);
      }
    }
  }
}
