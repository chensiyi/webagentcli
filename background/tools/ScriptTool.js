/**
 * ScriptTool — 由用户脚本 @tool 声明自动注册的 AI 工具（P2）
 *
 * 一个带 @tool 元数据且已启用的用户脚本，经 script-tools.reconcileScriptTools
 * 扫描后，会注册成一个来源为 'script' 的 Tool。大模型像调用普通工具一样
 * 调用它；其 handler 在目标页面执行该用户脚本，并把模型传入的 args 以
 * `window.__toolArgs` 形式注入，脚本的 return 值作为工具结果回传给模型。
 *
 * 执行路径复用 script-executor.executeInPage：
 *   - 有 @grant GM_* 的脚本走 USER_SCRIPT 隔离世界（GM API 可用）；
 *   - 纯页面操作（@grant none / 无 grant）走 MAIN 世界。
 *   脚本代码先经 wrapWithGM 注入 GM_* API 与 @require 前置库。
 */
import { Tool } from 'kernel/models/Tool.js';
import { wrapWithGM } from '../gm-api.js';
import { USER_SCRIPT_WORLD, MAIN_WORLD, ISOLATED_WORLD } from '../keys.js';
import { executeInPage } from '../script-executor.js';

/** 由脚本名推导工具名（slug） */
export function slug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'tool';
}

/** 计算工具名：@tool.name 优先，否则用脚本 @name slug 化 */
export function toolNameFor(script) {
  const meta = script?.toolMeta;
  return (meta?.name) || slug(script?.name);
}

/** 由 @tool.param.* 构建 inputSchema（全部参数默认必填） */
export function buildInputSchema(meta) {
  if (!meta || !meta.params || meta.params.length === 0) {
    return { type: 'object', properties: {} };
  }
  const properties = {};
  const required = [];
  for (const p of meta.params) {
    const def = { type: p.type, description: p.description || '' };
    if (p.enum && p.enum.length) def.enum = p.enum;
    properties[p.name] = def;
    required.push(p.name);
  }
  return { type: 'object', properties, required };
}

/**
 * 为单个用户脚本创建一个 Tool 实例。
 * @param script          用户脚本（含 toolMeta）
 * @param getScriptById  运行时按 id 取最新脚本（便于编辑后热更新 handler）
 */
export function createScriptTool(script, getScriptById) {
  const meta = script?.toolMeta;
  const toolName = toolNameFor(script);
  const description = (meta?.description) || script?.description || `用户脚本工具：${script?.name}`;
  const timeout = 300000;

  const handler = async (args, context) => {
    const s = (getScriptById && getScriptById(script.id)) || script;
    if (!s || !s.code) throw new Error('工具对应的用户脚本不存在或缺少代码');

    // 目标标签页：优先用调用方传入的 tabId，否则取活动标签
    let tabId = (context && context.tabId != null) ? Number(context.tabId) : null;
    let targetTab;
    if (tabId == null) {
      [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!targetTab || targetTab.id == null) throw new Error('无法找到目标标签页');
      tabId = targetTab.id;
    } else {
      // 用 tabId 查一下 URL，便于诊断注入失败时知道目标是什么页面
      const tabs = await chrome.tabs.query({});
      targetTab = tabs.find((t) => t.id === tabId);
    }
    if (typeof tabId !== 'number') throw new Error('目标标签页 id 无效');

    // 世界选择：有 GM_* grant → USER_SCRIPT（GM API 可用）；否则 MAIN
    const usesGrant = Array.isArray(s.grant) && s.grant.some(g => typeof g === 'string' && g.startsWith('GM_'));
    const world = usesGrant ? USER_SCRIPT_WORLD : MAIN_WORLD;

    // 前置校验：MAIN 世界只能注入 http(s) 页面，特殊页面直接给明确报错而非静默 null
    if (world === MAIN_WORLD && targetTab?.url && !targetTab.url.startsWith('http')) {
      throw new Error(
        `当前活动标签页不支持内容提取（${targetTab.url}）。` +
        `请切换到一个普通网页（http/https）后再试。`
      );
    }

    // 注入 GM_* API + @require 前置库，并前置 __toolArgs 供脚本读取。
    // gm-api.js 的 wrapWithGM 会把用户代码的返回值捕获到 __scriptResult 变量。
    // 此处生成的 finalCode 是一段「带顶层 return 的语句块」(而非被丢弃的裸 IIFE 表达式)，
    // 这样 script-executor 的 harness `(function(){ code })()` 才能取到返回值
    // （与 run_user_script 的 `return X;` 契约一致）。
    const gmCode = wrapWithGM(s.code, s);
    const argsJson = JSON.stringify(args || {});
    const finalCode =
      `const __toolArgs = ${argsJson};\n` +
      `${gmCode}\n` +
      `return typeof __scriptResult !== 'undefined' ? __scriptResult : null;`;

    return await executeInPage({ tabId, code: finalCode, world, timeout });
  };

  return new Tool({
    name: toolName,
    description,
    inputSchema: buildInputSchema(meta),
    handler,
    source: 'script',
    category: 'user-script',
    tags: ['user-script'],
    danger: !!meta?.danger,
    version: script?.version || '1.0',
    metadata: { scriptId: script.id, sourceScript: script.name },
  });
}
