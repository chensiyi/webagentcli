/**
 * kernel/Keys.ts — 共享的关键字面量常量（storage key 等）
 *
 * 跨 background / kernel / sidepanel 共享的关键 key，集中定义，避免拼写漂移
 * 与「改一处漏一处」。
 *
 * 约定：
 * - 仅放跨层共享的关键字面量。
 * - 仅 background 内部使用的关键字面量（world / runAt 等）见 background/keys.js，
 *   事件名见 kernel/Events.ts 的 KernelEvents，IPC 通道名见 KernelChannels。
 */

/**
 * chrome.storage.local 的存储键名。
 * 所有 Manager 一律从此处取，禁止在业务代码里裸写字符串。
 */
export const StorageKeys = {
  APP_SETTINGS: 'app_settings',
  SESSIONS: 'sessions',
  CURRENT_SESSION_ID: 'currentSessionId',
  USER_SCRIPTS: 'user_scripts',
} as const;
