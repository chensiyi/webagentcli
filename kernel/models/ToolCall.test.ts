/**
 * ToolCall — 工具调用测试
 *
 * 覆盖：
 * - 构造函数默认值
 * - 生命周期: pending → running → completed
 * - 生命周期: pending → running → failed
 * - toJSON / fromJSON
 */
import { describe, it, expect } from 'vitest';
import { ToolCall } from './ToolCall.js';

describe('ToolCall', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认参数', () => {
      const tc = new ToolCall();
      expect(tc.id).toMatch(/^tool_\d+_\w+$/);
      expect(tc.toolName).toBe('');
      expect(tc.input).toEqual({});
      expect(tc.status).toBe('pending');
      expect(tc.result).toBeNull();
      expect(tc.error).toBeNull();
      expect(tc.startedAt).toBeNull();
      expect(tc.completedAt).toBeNull();
    });

    it('指定参数', () => {
      const tc = new ToolCall('my_id', 'search', { query: 'test' });
      expect(tc.id).toBe('my_id');
      expect(tc.toolName).toBe('search');
      expect(tc.input).toEqual({ query: 'test' });
    });
  });

  // ─── 生命周期 ──────────────────────────────────

  describe('生命周期', () => {
    it('markStarted: pending → running', () => {
      const tc = new ToolCall();
      tc.markStarted();
      expect(tc.status).toBe('running');
      expect(tc.startedAt).toBeGreaterThan(0);
    });

    it('markCompleted: running → completed', () => {
      const tc = new ToolCall();
      tc.markStarted();
      tc.markCompleted({ result: 'ok' });
      expect(tc.status).toBe('completed');
      expect(tc.result).toEqual({ result: 'ok' });
      expect(tc.completedAt).toBeGreaterThan(0);
    });

    it('markFailed: running → failed', () => {
      const tc = new ToolCall();
      tc.markStarted();
      tc.markFailed({ message: 'timeout' });
      expect(tc.status).toBe('failed');
      expect(tc.error).toEqual({ message: 'timeout' });
      expect(tc.completedAt).toBeGreaterThan(0);
    });
  });

  // ─── 链式调用 ──────────────────────────────────

  describe('链式调用', () => {
    it('支持链式调用', () => {
      const tc = new ToolCall('id1', 'test');
      const result = tc.markStarted().markCompleted('ok');
      expect(result).toBe(tc);
      expect(tc.status).toBe('completed');
    });
  });

  // ─── 序列化 ──────────────────────────────────

  describe('toJSON / fromJSON', () => {
    it('toJSON 返回所有字段', () => {
      const tc = new ToolCall('id1', 'search', { q: 'hello' });
      tc.markStarted();
      tc.markCompleted([1, 2, 3]);
      const json = tc.toJSON();
      expect(json).toEqual({
        id: 'id1',
        toolName: 'search',
        input: { q: 'hello' },
        status: 'completed',
        result: [1, 2, 3],
        error: null,
        startedAt: expect.any(Number),
        completedAt: expect.any(Number),
      });
    });

    it('fromJSON 正确恢复状态', () => {
      const tc = new ToolCall('id1', 'search');
      tc.markStarted();
      tc.markCompleted('done');
      const json = tc.toJSON();

      const restored = ToolCall.fromJSON(json);
      expect(restored.id).toBe('id1');
      expect(restored.toolName).toBe('search');
      expect(restored.status).toBe('completed');
      expect(restored.result).toBe('done');
      expect(restored.startedAt).toBe(tc.startedAt);
      expect(restored.completedAt).toBe(tc.completedAt);
    });
  });
});
