/**
 * Session — 会话数据原型
 *
 * 纯数据模型，不含集合管理方法（addMessage/removeMessage/clearMessages 等
 * 已移入 SessionManager）。会话消息的增删改由 SessionManager 统一管理。
 */

import { BaseModel } from './BaseModel.js';

export class Session extends BaseModel {
  title: string;
  messages: unknown[];
  reasoningEffort: string;
  model: unknown;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.title = (options.title as string) || '新对话';
    this.messages = [];
    this.reasoningEffort = (options.reasoningEffort as string) || 'medium';
    this.model = options.model || null;
    this.createdAt = (options.createdAt as number) || Date.now();
    this.updatedAt = (options.updatedAt as number) || this.createdAt;
    if (Array.isArray(options.messages)) {
      options.messages.filter(m => m != null).forEach(m => this.messages.push(m));
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      ...(super.toJSON() as Record<string, unknown>),
      title: this.title,
      // 过滤掉 undefined 或 null 的消息，并安全调用 toJSON
      messages: this.messages.filter(m => m != null).map(m => (m as { toJSON: () => unknown }).toJSON?.() ?? m),
      reasoningEffort: this.reasoningEffort,
      model: this.model,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(data: Record<string, unknown>): Session { return new Session(data); }
}
