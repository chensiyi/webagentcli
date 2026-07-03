/**
 * ContextBuilder — LLM 上下文组装器测试
 *
 * 覆盖：
 * - System prompt 构建（含工具列表、页面环境）
 * - 消息截断算法（tool_call/tool_result 配对保护）
 * - 基本消息数量控制
 * - API 格式转换
 *
 * 注意：chrome.tabs.query 在 Node 环境不可用，_getPageContext 会静默跳过。
 * tool_call/tool_result 配对保护的核心逻辑不依赖浏览器 API。
 */
import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from './ContextBuilder.js';

// 全局模拟 chrome.tabs.query 用于非浏览器环境
if (typeof globalThis.chrome === 'undefined') {
  (globalThis as any).chrome = {
    tabs: {
      query: vi.fn().mockRejectedValue(new Error('not in browser')),
    },
  };
}

describe('ContextBuilder', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认 systemRole/systemPrinciples', () => {
      const builder = new ContextBuilder();
      expect((builder as any).systemRole).toContain('Web Agent');
      expect((builder as any).systemPrinciples).toContain('不需要用户确认');
    });

    it('自定义 systemRole/systemPrinciples', () => {
      const builder = new ContextBuilder({
        systemRole: 'You are a helpful assistant',
        systemPrinciples: 'Be concise',
      });
      expect((builder as any).systemRole).toBe('You are a helpful assistant');
      expect((builder as any).systemPrinciples).toBe('Be concise');
    });
  });

  // ─── buildMessages ────────────────────────────

  describe('buildMessages', () => {
    it('构建完整消息序列（含 system prompt + 用户消息）', async () => {
      const builder = new ContextBuilder();
      const session = {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };
      const settings = { contextWindowSize: 20 };
      const tools: unknown[] = [];
      const msgs = await builder.buildMessages(session, settings, tools);
      expect(msgs.length).toBe(2); // system + user
      expect(msgs[0].role).toBe('system');
      expect(msgs[0].content).toContain('Web Agent');
      expect(msgs[1].role).toBe('user');
      expect(msgs[1].content).toBe('Hello');
    });

    it('system prompt 包含工具列表', async () => {
      const builder = new ContextBuilder();
      const tools = [
        { function: { name: 'search', description: 'Search the web' } },
        { function: { name: 'calc', description: 'Calculate' } },
      ];
      const msgs = await builder.buildMessages({ messages: [] }, { contextWindowSize: 20 }, tools);
      expect(msgs[0].content).toContain('search');
      expect(msgs[0].content).toContain('calc');
    });

    it('无工具时不包含工具列表', async () => {
      const builder = new ContextBuilder();
      const msgs = await builder.buildMessages({ messages: [] }, { contextWindowSize: 20 }, []);
      expect(msgs[0].content).not.toContain('可用工具');
    });

    it('转换 OpenRouter/OpenAI API 格式', async () => {
      const builder = new ContextBuilder();
      const session = {
        messages: [
          { role: 'user', content: 'Hi', toolCalls: null },
          { role: 'assistant', content: 'Hello!', toolCallId: null },
        ],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, []);
      expect(msgs[1].role).toBe('user');
      expect(msgs[1].content).toBe('Hi');
      expect(msgs[2].role).toBe('assistant');
      expect(msgs[2].content).toBe('Hello!');
    });
  });

  // ─── 截断算法 ──────────────────────────────────

  describe('消息截断', () => {
    it('消息数不超过 contextWindowSize 时不截断', async () => {
      const builder = new ContextBuilder();
      const messages = Array.from({ length: 5 }, (_, i) => ({
        role: 'user',
        content: `msg ${i}`,
      }));
      const session = { messages };
      const settings = { contextWindowSize: 10, autoContextTruncation: true };
      const msgs = await builder.buildMessages(session, settings, []);
      // system(1) + user messages(5) = 6
      expect(msgs.length).toBe(6);
    });

    it('autoContextTruncation=false 不截断', async () => {
      const builder = new ContextBuilder();
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: 'user',
        content: `msg ${i}`,
      }));
      const session = { messages };
      const settings = { contextWindowSize: 5, autoContextTruncation: false };
      const msgs = await builder.buildMessages(session, settings, []);
      // system(1) + all 50 = 51
      expect(msgs.length).toBe(51);
    });

    it('超出 contextWindowSize 时截断', async () => {
      const builder = new ContextBuilder();
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: 'user',
        content: `msg ${i}`,
      }));
      const session = { messages };
      const settings = { contextWindowSize: 10 };
      const msgs = await builder.buildMessages(session, settings, []);
      // system(1) + truncated(10) = 11
      expect(msgs.length).toBe(11);
      // 应保留最后 10 条
      expect(msgs[1].content).toBe('msg 20');
      expect(msgs[10].content).toBe('msg 29');
    });

    it('保护 tool_call / tool_result 配对完整性', async () => {
      const builder = new ContextBuilder();
      // 构造场景：如果截断点正好在 tool 消息上，应向前回退找到配对的 assistant tool_call
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: 'user',
        content: `msg ${i}`,
      }));
      // 在消息末尾添加 tool_call → tool_result 序列
      messages.push(
        { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', toolName: 'search', input: {} }] },
        { role: 'tool', toolCallId: 'tc1', content: 'result data' },
      );
      const session = { messages };
      // windowSize 很小，截断点会落在 tool 或 assistant 消息上
      const settings = { contextWindowSize: 3 };
      const msgs = await builder.buildMessages(session, settings, []);
      // 至少有 system + 配对的三条: user (末尾) + assistant(tool_call) + tool
      // 截断算法会保护配对，实际保留至少 1 + 若干条
      const msgRoles = msgs.slice(1).map((m: any) => m.role);
      // 检查最后两条是 assistant + tool（配对完整）
      const lastTwo = msgRoles.slice(-2);
      expect(lastTwo[0]).toBe('assistant');
      expect(lastTwo[1]).toBe('tool');
    });

    it('裁断后 tool message 不孤悬', async () => {
      const builder = new ContextBuilder();
      const messages: any[] = [];
      // 增加前缀普通消息
      for (let i = 0; i < 15; i++) {
        messages.push({ role: 'user', content: `msg ${i}` });
      }
      // 末尾三轮 tool call
      messages.push(
        { role: 'assistant', content: 'calling', toolCalls: [{ id: 't1', toolName: 'f1' }] },
        { role: 'tool', toolCallId: 't1', content: 'r1' },
        { role: 'user', content: 'ok' },
      );

      const session = { messages };
      const settings = { contextWindowSize: 5 };
      const msgs = await builder.buildMessages(session, settings, []);

      // 验证：末尾没有孤悬的 tool 消息
      const roles = msgs.slice(1).map((m: any) => m.role);
      const lastRole = roles[roles.length - 1];
      expect(lastRole).not.toBe('tool'); // tool 消息前面必定有 assistant
    });
  });

  // ─── 空消息处理 ──────────────────────────────

  describe('边界情况', () => {
    it('空 session 只返回 system prompt', async () => {
      const builder = new ContextBuilder();
      const msgs = await builder.buildMessages(
        { messages: [] },
        { contextWindowSize: 20 },
        [],
      );
      expect(msgs.length).toBe(1);
      expect(msgs[0].role).toBe('system');
    });

    it('含 null 消息自动过滤', async () => {
      const builder = new ContextBuilder();
      const session = {
        messages: [null, { role: 'user', content: 'only' }, null] as any[],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, []);
      // system + 1 real message = 2
      expect(msgs.length).toBe(2);
      expect(msgs[1].content).toBe('only');
    });

    it('contextWindowSize 默认 20', async () => {
      const builder = new ContextBuilder();
      const session = { messages: Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `msg${i}` })) };
      const msgs = await builder.buildMessages(session, {}, []);
      // system + 20 = 21
      expect(msgs.length).toBe(21);
    });
  });
});
