/**
 * P0-1: MessageStructure 缺少关键方法
 *
 * OpenRouterService 和 LMStudioService 调用了：
 * - MessageStructure.parseToolCallsFromOpenAI(rawToolCalls)
 * - MessageStructure.toAPIFormat(msg, format)
 *
 * 验证这些方法是否存在于 MessageStructure 类上。
 */
import { describe, it, expect } from 'vitest';
import { MessageStructure } from './MessageContent.js';

describe('P0-1: MessageStructure 缺方法', () => {
  it('MessageStructure 应有 parseToolCallsFromOpenAI 静态方法', () => {
    expect(typeof MessageStructure.parseToolCallsFromOpenAI).toBe('function');
  });

  it('MessageStructure.parseToolCallsFromOpenAI 应能解析 OpenAI 格式 tool_calls', () => {
    const rawToolCalls = [
      { id: 'call_001', function: { name: 'get_weather', arguments: '{"city":"Beijing"}' } },
      { id: 'call_002', function: { name: 'search_web', arguments: '{"query":"test"}' } },
    ];
    const result = MessageStructure.parseToolCallsFromOpenAI(rawToolCalls);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    // 每个 ToolCall 应至少有 id, name, arguments
    expect(result[0].id).toBe('call_001');
    expect(result[0].name).toBe('get_weather');
  });

  it('MessageStructure.parseToolCallsFromOpenAI 处理空数组应返回空数组', () => {
    const result = MessageStructure.parseToolCallsFromOpenAI([]);
    expect(result).toEqual([]);
  });

  it('MessageStructure 应有 toAPIFormat 静态方法', () => {
    expect(typeof MessageStructure.toAPIFormat).toBe('function');
  });

  it('MessageStructure.toAPIFormat 应能将消息转为 OpenAI 格式', () => {
    const msg = { role: 'user', content: 'Hello' };
    const result = MessageStructure.toAPIFormat(msg, 'openai');
    expect(result).toBeDefined();
    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
  });
});
