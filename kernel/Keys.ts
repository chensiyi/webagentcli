/**
 * kernel/Keys.ts — 共享的关键字面量常量（storage key / 计时等）
 *
 * 跨 background / kernel / sidepanel 共享的关键 key 与常量，集中定义，避免拼写漂移
 * 与「改一处漏一处」。
 *
 * 约定：
 * - 仅放跨层共享的关键字面量。
 * - 仅 background 内部使用的关键字面量（world / runAt / GM 前缀等）见 background/keys.js，
 *   事件名见 kernel/Events.ts 的 KernelEvents，IPC 通道名见 KernelChannels。
 */

/**
 * chrome.storage.local 的存储键名。
 * 所有 Manager 一律从此处取，禁止在业务代码里裸写字符串。
 */
export const StorageKeys = {
  APP_SETTINGS: 'app_settings',
  /** 工具启用/禁用状态持久化：值为 { [toolName]: boolean }，SW 重启后由 ToolsManager.init() 读回 */
  TOOLS_ENABLED: 'tools_enabled',
  /** 会话索引（轻量：id/title/时间/消息数/预览，不含消息体） */
  SESSIONS: 'sessions',
  USER_SCRIPTS: 'user_scripts',
  /** 预装脚本（TARGETS #4.0）已应用版本记录：值为 { [name|namespace]: version }，用于幂等与升级判断 */
  PRESET_INSTALLED: 'preset_installed',
} as const;

/**
 * 单会话消息存储键前缀。
 * 会话消息按 sessionId 独立成键（session:<id>:messages），与上面的 SESSIONS 索引分离，
 * 以支持「按 sessionId 局部更新」，避免每次写入都重写全部会话。
 */
export const SESSION_MESSAGES_PREFIX = 'session:';

/** 由 sessionId 得到该会话消息的独立存储键。 */
export function sessionMessagesKey(id: string): string {
  return `${SESSION_MESSAGES_PREFIX}${id}:messages`;
}

/**
 * 计时 / 批处理常量（命名集中，杜绝魔法数字）。
 */
/** 流式 token 累积落盘的合并窗口（毫秒）：窗口内的多次消息变更合并为一次写盘。 */
export const MSG_PERSIST_BATCH_MS = 150;
/** 存储写入错误的上报冷却（毫秒）：避免流式期间配额超限时刷屏式弹 toast。 */
export const STORAGE_ERROR_COOLDOWN_MS = 3000;
