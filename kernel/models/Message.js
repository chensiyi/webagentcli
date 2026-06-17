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
 * - role 一旦设置不可修改
 */

import { BaseModel } from './BaseModel.js';
import { ToolCall } from './ToolCall.js';

// =============================================================================
// 角色枚举
// =============================================================================
export const Role = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
};

// =============================================================================
// 消息类
// =============================================================================
export class Message extends BaseModel {
  constructor(options = {}) {
    super(options);
    this._role = options.role || Role.USER;
    this.content = options.content || '';
    this.timestamp = options.timestamp || this.createdAt;
    this.reasoning_content = options.reasoning_content || null;
    this.toolCallId = options.toolCallId || null;
    this.metadata = options.metadata || {};
    this.toolCalls = [];
    if (Array.isArray(options.toolCalls)) options.toolCalls.forEach(tc => this.addToolCall(tc));
  }

  get role() { return this._role; }

  addToolCall(toolCall) {
    if (!toolCall) return;
    const tc = toolCall instanceof ToolCall ? toolCall : ToolCall.fromJSON(toolCall);
    if (!tc || this.toolCalls.some(e => e.id === tc.id)) return;
    this.toolCalls.push(tc);
    this.touch();
  }

  getToolCall(id) { return this.toolCalls.find(tc => tc.id === id) || null; }
  isRichContent() { return Array.isArray(this.content); }
  getText() {
    if (typeof this.content === 'string') return this.content;
    if (Array.isArray(this.content)) return this.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
    return '';
  }
  hasToolCalls() { return this.toolCalls.length > 0; }
  isUser() { return this._role === Role.USER; }
  isAssistant() { return this._role === Role.ASSISTANT; }
  isSystem() { return this._role === Role.SYSTEM; }
  isTool() { return this._role === Role.TOOL; }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this._role && { role: this._role }),
      ...(this.content && { content: this.content }),
      ...(this.timestamp && { timestamp: this.timestamp }),
      ...(this.reasoning_content && { reasoning_content: this.reasoning_content }),
      ...(this.toolCallId && { toolCallId: this.toolCallId }),
      ...(this.toolCalls.length > 0 && { toolCalls: this.toolCalls.map(tc => tc.toJSON()) }),
      ...((Object.keys(this.metadata || {}).length > 0) && { metadata: this.metadata })
    };
  }

  static fromJSON(data) { return new Message(data); }
}

export default Message;
