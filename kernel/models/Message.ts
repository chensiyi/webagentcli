/**
 * Message - 消息原型定义
 *
 * 职责：
 * 1. 定义消息的角色枚举 (Role)
 * 2. 定义核心消息数据结构，支持纯文本和富媒体块内容
 * 3. 工具调用作为子对象（toolCalls: ToolCall[]）随消息持久化
 *
 * 设计原则：
 * - 工具相关字段是消息的子对象，不是独立的 Session 索引
 * - 协议字段 (OpenAI tool_calls) 隔离在 MessageContent.MessageStructure
 */

import { BaseModel } from './BaseModel.js';
import { ToolCall } from './Tool.js';

// =============================================================================
// 角色枚举（as const 类型化，值有精确类型约束）
// =============================================================================
export const Role = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
} as const;

export type RoleType = typeof Role[keyof typeof Role];

// =============================================================================
// 消息类
// =============================================================================
export class Message extends BaseModel {
  role: RoleType;
  content: unknown;
  timestamp: number;
  reasoning_content: unknown;
  toolCallId: string | null;
  metadata: Record<string, unknown>;
  toolCalls: unknown[];

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.role = (options.role as RoleType) || Role.USER;
    this.content = options.content || '';
    this.timestamp = (options.timestamp as number) || ((this as unknown as { createdAt: number }).createdAt);
    this.reasoning_content = options.reasoning_content || null;
    this.toolCallId = (options.toolCallId as string) || null;
    this.metadata = (options.metadata as Record<string, unknown>) || {};
    this.toolCalls = [];
    if (Array.isArray(options.toolCalls)) options.toolCalls.forEach(tc => this.addToolCall(tc));
  }

  addToolCall(toolCall: unknown): void {
    if (!toolCall) return;
    const tc = toolCall instanceof ToolCall ? toolCall : ToolCall.fromJSON(toolCall as Record<string, unknown>);
    if (!tc || this.toolCalls.some(e => (e as unknown as { id: string }).id === (tc as unknown as { id: string }).id)) return;
    this.toolCalls.push(tc);
    this.touch();
  }

  getToolCall(id: string): unknown { return this.toolCalls.find(tc => (tc as unknown as { id: string }).id === id) || null; }
  isRichContent(): boolean { return Array.isArray(this.content); }
  getText(): string {
    if (typeof this.content === 'string') return this.content as string;
    if (Array.isArray(this.content)) return (this.content as { type: string; text: string }[]).filter(b => b.type === 'text').map(b => b.text).join('\n\n');
    return '';
  }
  hasToolCalls(): boolean { return this.toolCalls.length > 0; }
  isUser(): boolean { return this.role === Role.USER; }
  isAssistant(): boolean { return this.role === Role.ASSISTANT; }
  isSystem(): boolean { return this.role === Role.SYSTEM; }
  isTool(): boolean { return this.role === Role.TOOL; }

  toJSON(): Record<string, unknown> {
    return {
      ...(super.toJSON() as Record<string, unknown>),
      ...(this.role && { role: this.role }),
      ...(this.content && { content: this.content }),
      ...(this.timestamp && { timestamp: this.timestamp }),
      ...(this.reasoning_content && { reasoning_content: this.reasoning_content }),
      ...(this.toolCallId && { toolCallId: this.toolCallId }),
      ...(this.toolCalls.length > 0 && { toolCalls: this.toolCalls.map(tc => (typeof (tc as any).toJSON === 'function' ? (tc as any).toJSON() : tc)) }),
      ...((Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata })
    };
  }

  static fromJSON(data: Record<string, unknown>): Message { return new Message(data); }
}
