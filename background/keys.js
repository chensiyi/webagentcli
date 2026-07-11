/**
 * background/keys.js — background（Service Worker）内部共享的关键常量
 *
 * 收口散落在各模块里的魔法字符串（chrome API 取值）与魔法数字，集中定义，
 * 避免拼写漂移与「改一处漏一处」。
 *
 * 约定：
 * - 仅放 background 内部使用、且语义稳定的关键字面量。
 * - 跨 background / kernel / sidepanel 共享的事件名（如 kernel:bootComplete）
 *   仍统一放在 kernel/Events.ts 的 KernelEvents 中，不在此重复。
 */

// chrome.userScripts / chrome.scripting 的 world 取值
export const USER_SCRIPT_WORLD = 'USER_SCRIPT';
export const MAIN_WORLD = 'MAIN';
export const ISOLATED_WORLD = 'ISOLATED';

// chrome.userScripts 注册时 runAt 的兜底默认值（脚本未声明或映射缺失时使用）
export const DEFAULT_RUN_AT = 'document_idle';

// GM_* 注入脚本在 chrome.storage.local 中存放「脚本级键值」时的 key 前缀：
// 实际 key = `${GM_VALUE_PREFIX}${scriptId}_${userKey}`（见 background/gm-api.js）
export const GM_VALUE_PREFIX = 'gm_';
