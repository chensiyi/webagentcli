/**
 * ToolDefinition — 工具定义测试
 *
 * 覆盖：
 * - 构造函数
 * - toOpenAIFunction 转换
 * - enabled 默认值
 * - inputSchema 别名 (parameters)
 */
import { describe, it, expect } from 'vitest';
import { ToolDefinition } from './ToolDefinition.js';

describe('ToolDefinition', () => {

  describe('构造函数', () => {
    it('默认值', () => {
      const td = new ToolDefinition();
      expect(td.name).toBe('');
      expect(td.description).toBe('');
      expect(td.capabilities).toEqual([]);
      expect(td.enabled).toBe(true);
      expect(td.inputSchema).toBeNull();
    });

    it('传入参数', () => {
      const td = new ToolDefinition({
        name: 'search',
        description: 'Search the web',
        capabilities: ['read', 'web'],
        enabled: false,
      });
      expect(td.name).toBe('search');
      expect(td.description).toBe('Search the web');
      expect(td.capabilities).toEqual(['read', 'web']);
      expect(td.enabled).toBe(false);
    });

    it('inputSchema 接受 parameters 别名', () => {
      const td = new ToolDefinition({ name: 'test', parameters: { type: 'object', properties: { q: { type: 'string' } } } });
      expect(td.inputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
    });
  });

  // ─── toOpenAIFunction ────────────────────────

  describe('toOpenAIFunction', () => {
    it('转换 OpenAI 函数格式', () => {
      const td = new ToolDefinition({
        name: 'get_weather',
        description: 'Get weather by city',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      });
      const fn = td.toOpenAIFunction();
      expect(fn).toEqual({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather by city',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      });
    });

    it('无 inputSchema 时使用默认空 schema', () => {
      const td = new ToolDefinition({ name: 'no_param', description: 'No params' });
      const fn = td.toOpenAIFunction();
      expect(fn.function.parameters).toEqual({ type: 'object', properties: {} });
    });
  });

  // ─── enabled ────────────────────────────────

  describe('enabled 默认值', () => {
    it('不传 enabled 默认为 true', () => {
      expect(new ToolDefinition({ name: 'test' }).enabled).toBe(true);
    });

    it('传 enabled: false', () => {
      expect(new ToolDefinition({ name: 'test', enabled: false }).enabled).toBe(false);
    });
  });
});
