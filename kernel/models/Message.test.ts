/**
 * Message — 消息模型测试
 *
 * 覆盖：
 * - 角色（user/assistant/system/tool）
 * - 纯文本 vs 富媒体内容
 * - toolCalls 子对象管理
 * - 角色判断 (isUser/isAssistant/isSystem/isTool)
 * - toJSON / fromJSON 序列化
 */
import { describe, it, expect } from 'vitest';
import { Message, Role } from './Message.js';

describe('Message', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认 role 为 user', () => {
      const m = new Message();
      expect(m.role).toBe('user');
    });

    it('content 默认为空字符串', () => {
      const m = new Message();
      expect(m.content).toBe('');
    });

    it('接受所有属性', () => {
      const m = new Message({
        role: 'assistant',
        content: 'Hello',
        toolCallId: 'call_001',
        reasoning_content: 'thinking...',
        metadata: { key: 'val' },
      });
      expect(m.role).toBe('assistant');
      expect(m.content).toBe('Hello');
      expect(m.toolCallId).toBe('call_001');
      expect(m.reasoning_content).toBe('thinking...');
      expect(m.metadata).toEqual({ key: 'val' });
    });

    it('自动生成 ID', () => {
      const m = new Message();
      expect(m.id).toMatch(/^message_\d+_\w+$/);
    });
  });

  // ─── 角色 ────────────────────────────────────

  describe('角色判断', () => {
    it('isUser 判断用户消息', () => {
      expect(new Message({ role: 'user' }).isUser()).toBe(true);
      expect(new Message({ role: 'assistant' }).isUser()).toBe(false);
    });

    it('isAssistant 判断助手消息', () => {
      expect(new Message({ role: 'assistant' }).isAssistant()).toBe(true);
      expect(new Message({ role: 'user' }).isAssistant()).toBe(false);
    });

    it('isSystem 判断系统消息', () => {
      expect(new Message({ role: 'system' }).isSystem()).toBe(true);
    });

    it('isTool 判断工具消息', () => {
      expect(new Message({ role: 'tool' }).isTool()).toBe(true);
    });
  });

  // ─── 内容 ────────────────────────────────────

  describe('内容处理', () => {
    it('getText 返回纯文本内容', () => {
      const m = new Message({ content: 'Hello World' });
      expect(m.getText()).toBe('Hello World');
    });

    it('getText 处理富媒体数组内容', () => {
      const m = new Message({
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'image', source: 'url' },
          { type: 'text', text: 'Part 2' },
        ],
      });
      expect(m.getText()).toBe('Part 1\n\nPart 2');
    });

    it('isRichContent 判断富媒体', () => {
      expect(new Message({ content: 'plain' }).isRichContent()).toBe(false);
      expect(new Message({ content: [{ type: 'text', text: 'a' }] }).isRichContent()).toBe(true);
    });
  });

  // ─── toolCalls ───────────────────────────────

  describe('toolCalls 管理', () => {
    it('addToolCall 添加工具调用', () => {
      const m = new Message();
      m.addToolCall({ id: 'tc1', toolName: 'search', input: {} });
      expect(m.toolCalls.length).toBe(1);
      expect(m.hasToolCalls()).toBe(true);
    });

    it('addToolCall 重复 id 不添加', () => {
      const m = new Message();
      m.addToolCall({ id: 'tc1', toolName: 'search' });
      m.addToolCall({ id: 'tc1', toolName: 'search2' });
      expect(m.toolCalls.length).toBe(1);
    });

    it('getToolCall 按 id 查找', () => {
      const m = new Message();
      m.addToolCall({ id: 'tc1', toolName: 'search' });
      m.addToolCall({ id: 'tc2', toolName: 'calc' });
      expect(m.getToolCall('tc1')).toBeDefined();
      expect(m.getToolCall('nonexistent')).toBeNull();
    });

    it('构造时传入 toolCalls 数组自动转换', () => {
      const m = new Message({
        toolCalls: [
          { id: 'tc1', toolName: 'search', input: {} },
          { id: 'tc2', toolName: 'calc', input: {} },
        ],
      });
      expect(m.toolCalls.length).toBe(2);
    });

    it('空消息无 toolCalls', () => {
      expect(new Message().hasToolCalls()).toBe(false);
    });
  });

  // ─── 序列化 ──────────────────────────────────

  describe('toJSON / fromJSON', () => {
    it('toJSON 输出完整 fields', () => {
      const m = new Message({ role: 'user', content: 'Hi' });
      const json = m.toJSON();
      expect(json.role).toBe('user');
      expect(json.content).toBe('Hi');
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('timestamp');
    });

    it('无 toolCallId 时不输出该字段', () => {
      const json = new Message().toJSON();
      expect(json).not.toHaveProperty('toolCallId');
    });

    it('fromJSON 反序列化', () => {
      const original = new Message({ id: 'msg_123', role: 'assistant', content: 'ok', toolCallId: 'tc1' });
      const json = original.toJSON();
      const restored = Message.fromJSON(json);
      expect(restored.id).toBe('msg_123');
      expect(restored.role).toBe('assistant');
      expect(restored.content).toBe('ok');
      expect(restored.toolCallId).toBe('tc1');
    });
  });
});
