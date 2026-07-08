/**
 * Session — 会话数据原型
 *
 * 纯数据模型，不含集合管理方法（addMessage/removeMessage/clearMessages 等
 * 已移入 SessionManager）。会话消息的增删改由 SessionManager 统一管理。
 */

import { BaseModel } from './BaseModel.js';
import { Message } from './Message.js';

export class Session extends BaseModel {
  title: string;
  messages: Message[];
  reasoningEffort: string | null;
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
      // 从存储重建时 messages 是纯对象数组，必须 rehydrate 成 Message 实例，
      // 否则后续 toJSON() 调 m.toJSON() 会报 "e.toJSON is not a function"。
      options.messages.filter(m => m != null).forEach(m => this.messages.push(m instanceof Message ? m : new Message(m)));
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      ...(super.toJSON() as Record<string, unknown>),
      title: this.title,
      // 过滤掉 undefined 或 null 的消息，并安全调用 toJSON（裸对象原样返回，不抛错）
      messages: this.messages.filter(m => m != null).map(m => (typeof (m as any).toJSON === 'function' ? (m as any).toJSON() : m)),
      reasoningEffort: this.reasoningEffort,
      model: this.model,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(data: Record<string, unknown>): Session { return new Session(data); }
}
