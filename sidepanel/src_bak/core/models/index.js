/**
 * Core Models Index - 核心业务模型导出
 * 
 * 提供协议无关的业务模型，不包含任何 API 标准相关的字段。
 * 所有模型完全独立于具体的 API 提供商（OpenAI、Anthropic、LM Studio 等）。
 */

// 导出所有核心模型
export { Model } from './Model.js';
export { MediaContent } from './MediaContent.js';
export { ToolIntention } from './ToolIntention.js';
export { Message } from './Message.js';
export { Session } from './Session.js';

// 便捷导出
export const CoreModels = {
  Model,
  MediaContent,
  ToolIntention,
  Message,
  Session
};
