/**
 * Shell 事件常量 — 统一来源为 kernel/Events.ts
 * 
 * 保留 MessageFormats 文档和 Shell 特有事件的补充定义。
 * Vite 打包时 import 会被解析为同一份 KernelEvents 引用。
 */

import { KernelEvents } from '../../kernel/Events.js';

const Events = KernelEvents;

/**
 * 消息格式规范（Shell 层文档，供开发者参考）
 */
const MessageFormats = {
  MESSAGE_ADDED: {
    message: 'Message对象',
    type: "'user' | 'assistant' | 'system' | 'tool'"
  },
  STREAM_CHUNK_APPEND: {
    messageId: 'string - 消息ID',
    content: 'string - 分片内容（可能为空）',
    reasoning_content: 'string - 推理分片内容（可能为空）'
  },
  STREAM_COMPLETE: {
    message: 'Message对象',
    duration: 'number - 耗时（毫秒，可选）'
  },
  STREAM_ERROR: {
    error: 'Error对象',
    message: 'string - 错误消息'
  },
  SESSION_SWITCHED: {
    sessionId: 'string',
    session: 'Session对象'
  },
  SETTINGS_UPDATED: {
    key: 'string - 更新的键名',
    value: 'any - 新值',
    oldValue: 'any - 旧值（可选）'
  }
};

export { Events, MessageFormats };
