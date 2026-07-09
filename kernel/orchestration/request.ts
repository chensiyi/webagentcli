/**
 * orchestration/request.ts — 纯函数：请求构造 + provider 缓存注入
 *
 * 刻意零依赖 Kernel / IPC / ContextBuilder，便于单测隔离，
 * 也契合「编排逻辑与基础设施解耦」的简化目标。
 */

import { MessagesRequest, ThinkingConfig } from '../models/MessageContent.js';

/** 构造一轮 MessagesRequest（纯函数，无副作用）。 */
export function buildTurnRequest(opts: {
  model: string;
  messages: unknown[];
  thinking: ThinkingConfig;
  tools: unknown[] | null;
}): MessagesRequest {
  return new MessagesRequest({
    model: opts.model,
    messages: opts.messages as any[],
    stream: true,
    thinking: opts.thinking,
    tools: opts.tools as any[] | null,
  });
}

/** 把会话级缓存 key 注入 provider（唯一的副作用点，与编排逻辑解耦）。 */
export function applySessionCache(
  service: { name?: string; cacheOptions?: { sessionCacheKey?: string } | null },
  sessionId: string,
): void {
  if (service?.cacheOptions) {
    service.cacheOptions.sessionCacheKey = `webagentcli:session:${sessionId}`;
  }
}
