/**
 * RPC — IPC 远程调用命令定义
 *
 * Shell 层通过 IPC emit 命令 → Kernel 层通过 IPC on 处理 → 通过 IPC emit 响应。
 *
 * 使用：
 *   // Shell 端
 *   import { RPC } from '../../bridge/RPC.js';
 *   chatChannel.emit(RPC.SESSION_GET_CURRENT);
 *
 *   // Kernel 端
 *   import { RPC } from '../bridge/RPC.js';
 *   chatChannel.on(RPC.SESSION_GET_CURRENT, () => {
 *     chatChannel.emit(RPC_RES.SESSION_CURRENT, { session: ... });
 *   });
 */

// ─── Shell → Kernel 请求命令 ─────────────────────────

export const RPC = Object.freeze({
  // Session
  /** 获取当前会话 */
  SESSION_GET_CURRENT: 'rpc:session:getCurrent',
  /** 获取所有会话列表 */
  SESSION_LIST:        'rpc:session:list',
  /** 创建新会话 */
  SESSION_NEW:         'rpc:session:new',
  /** 切换会话 @param { sessionId: string } */
  SESSION_SWITCH:      'rpc:session:switch',
  /** 删除会话 @param { sessionId: string } */
  SESSION_DELETE:      'rpc:session:delete',
  /** 更新会话 @param { sessionId: string, data: object } */
  SESSION_UPDATE:      'rpc:session:update',
  /** 删除消息 @param { messageId: string, sessionId: string } */
  SESSION_DELETE_MSG:  'rpc:session:deleteMessage',
  /** 清空会话消息 @param { sessionId: string } */
  SESSION_CLEAR_MSGS:  'rpc:session:clearMessages',

  // Tool
  /** 获取工具列表 */
  TOOL_LIST:   'rpc:tool:list',
  /** 切换工具启用 @param { name: string, enabled: boolean } */
  TOOL_TOGGLE: 'rpc:tool:toggle',

  // Settings
  /** 获取设置 */
  SETTINGS_GET: 'rpc:settings:get',
});

// ─── Kernel → Shell 响应事件 ─────────────────────────

export const RPC_RES = Object.freeze({
  /** 响应: 当前会话数据 { session, messages, reasoningEffort } */
  SESSION_CURRENT: 'rpc:session:current',
  /** 响应: 会话列表 { sessions } */
  SESSION_LIST:    'rpc:session:list',
  /** 响应: 工具列表 { tools } */
  TOOL_LIST:       'rpc:tool:list',
  /** 响应: 设置 { settings } */
  SETTINGS:        'rpc:settings',
});