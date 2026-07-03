/**
 * ToolResult — 工具结果测试
 *
 * 覆盖：
 * - 构造函数默认值
 * - 状态判断 (isSuccess / isFailed / isPending)
 * - 工厂方法 (success / failed)
 * - toJSON / fromJSON
 */
import { describe, it, expect } from 'vitest';
import { ToolResult } from './ToolResult.js';

describe('ToolResult', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认值', () => {
      const r = new ToolResult();
      expect(r.toolCallId).toBeNull();
      expect(r.status).toBe('pending');
      expect(r.output).toBeNull();
      expect(r.error).toBeNull();
      expect(r.duration).toBe(0);
    });

    it('传入参数', () => {
      const r = new ToolResult({
        toolCallId: 'tc1',
        status: 'success',
        output: 'result data',
        duration: 150,
      });
      expect(r.toolCallId).toBe('tc1');
      expect(r.status).toBe('success');
      expect(r.output).toBe('result data');
      expect(r.duration).toBe(150);
    });
  });

  // ─── 状态判断 ──────────────────────────────────

  describe('状态判断', () => {
    it('isSuccess', () => {
      expect(new ToolResult({ status: 'success' }).isSuccess()).toBe(true);
      expect(new ToolResult({ status: 'failed' }).isSuccess()).toBe(false);
      expect(new ToolResult({ status: 'pending' }).isSuccess()).toBe(false);
    });

    it('isFailed', () => {
      expect(new ToolResult({ status: 'failed' }).isFailed()).toBe(true);
      expect(new ToolResult({ status: 'success' }).isFailed()).toBe(false);
    });

    it('isPending', () => {
      expect(new ToolResult({ status: 'pending' }).isPending()).toBe(true);
      expect(new ToolResult().isPending()).toBe(true); // 默认 pending
      expect(new ToolResult({ status: 'success' }).isPending()).toBe(false);
    });
  });

  // ─── 工厂方法 ──────────────────────────────────

  describe('工厂方法', () => {
    it('ToolResult.success 创建成功结果', () => {
      const r = ToolResult.success('tc1', { data: 'ok' }, 120);
      expect(r.isSuccess()).toBe(true);
      expect(r.toolCallId).toBe('tc1');
      expect(r.output).toEqual({ data: 'ok' });
      expect(r.duration).toBe(120);
    });

    it('ToolResult.failed 创建失败结果', () => {
      const r = ToolResult.failed('tc1', 'Network error', 500);
      expect(r.isFailed()).toBe(true);
      expect(r.toolCallId).toBe('tc1');
      expect(r.error).toBe('Network error');
      expect(r.duration).toBe(500);
    });

    it('success 默认 duration 为 0', () => {
      const r = ToolResult.success('tc1', 'ok');
      expect(r.duration).toBe(0);
    });
  });

  // ─── 序列化 ──────────────────────────────────

  describe('toJSON / fromJSON', () => {
    it('toJSON 返回所有字段', () => {
      const r = ToolResult.success('tc1', 'output', 100);
      const json = r.toJSON();
      expect(json).toEqual({
        toolCallId: 'tc1',
        status: 'success',
        output: 'output',
        error: null,
        duration: 100,
        metadata: {},
      });
    });

    it('fromJSON 恢复', () => {
      const original = ToolResult.failed('tc1', 'failure', 200);
      const restored = ToolResult.fromJSON(original.toJSON());
      expect(restored.toolCallId).toBe('tc1');
      expect(restored.isFailed()).toBe(true);
      expect(restored.error).toBe('failure');
      expect(restored.duration).toBe(200);
    });

    it('fromJSON 使用默认值', () => {
      const r = ToolResult.fromJSON({});
      expect(r.isPending()).toBe(true);
    });
  });
});
