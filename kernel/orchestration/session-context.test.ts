/**
 * ContextBuilder — LLM 上下文组装器测试
 *
 * 覆盖：
 * - System prompt 构建（含工具列表）
 * - 消息截断算法（tool_call/tool_result 配对保护）
 * - 基本消息数量控制
 * - API 格式转换
 *
 * 纯逻辑测试，零浏览器依赖，可在任何 JS 环境运行。
 */
import { describe, it, expect } from 'vitest';
import { ContextBuilder } from './session-context.js';

describe('ContextBuilder', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认 systemRole/systemPrinciples', () => {
      const builder = new ContextBuilder();
      expect((builder as any).systemRole).toContain('Web Agent');
      expect((builder as any).systemPrinciples).toContain('优先使用工具');
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
        { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', toolName: 'search', input: {} }] } as any,
        { role: 'tool', toolCallId: 'tc1', content: 'result data' } as any,
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
        { role: 'assistant' as const, content: 'calling', toolCalls: [{ id: 't1', toolName: 'f1' }] },
        { role: 'tool' as const, toolCallId: 't1', content: 'r1' },
        { role: 'user' as const, content: 'ok' },
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

  // ─── 媒体解析（mediaResolver） ───────────────

  describe('mediaResolver 媒体解析', () => {
    it('图片 mediaId 经 resolver 解析为 URL，序列化为 image_url', async () => {
      const builder = new ContextBuilder();
      const resolver = async (id: string) => (id === 'm1' ? 'https://img/x.png' : null);
      const session = {
        messages: [{
          role: 'user',
          content: [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png' }],
        }],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, [], resolver);
      expect(msgs[1].content[0]).toEqual({ type: 'image_url', image_url: { url: 'https://img/x.png', detail: 'auto' } });
    });

    it('resolver 返回 null → 降级为未解析文本，不发出残缺请求', async () => {
      const builder = new ContextBuilder();
      const resolver = async () => null;
      const session = {
        messages: [{
          role: 'user',
          content: [{ type: 'media', kind: 'image', mediaId: 'mX', mimeType: 'image/png' }],
        }],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, [], resolver);
      expect(msgs[1].content[0]).toEqual({ type: 'text', text: '[媒体(image)未解析]' });
    });

    it('无 mediaResolver 时图片块（无 url）同样降级，不抛错', async () => {
      const builder = new ContextBuilder();
      const session = {
        messages: [{
          role: 'user',
          content: [{ type: 'media', kind: 'image', mediaId: 'mX', mimeType: 'image/png' }],
        }],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, []);
      expect(msgs[1].content[0]).toEqual({ type: 'text', text: '[媒体(image)未解析]' });
    });

    it('本地媒体 resolver 返回 dataURL → 序列化为 image_url（含 base64 dataURL）', async () => {
      const builder = new ContextBuilder();
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
      const resolver = async (id: string) => (id === 'local_img1' ? dataUrl : null);
      const session = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '看这张本地截图' },
            { type: 'media', kind: 'image', mediaId: 'local_img1', mimeType: 'image/png' },
          ],
        }],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, [], resolver);
      expect(msgs[1].content[0]).toEqual({ type: 'text', text: '看这张本地截图' });
      expect(msgs[1].content[1]).toEqual({ type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } });
    });

    it('文本 + 图片 + 音频混合内容经 resolver 解析后各部分正确序列化', async () => {
      const builder = new ContextBuilder();
      const imgUrl = 'data:image/png;base64,AAA';
      const audioData = 'UklGRg==';
      const resolver = async (id: string) => {
        if (id === 'local_pic') return imgUrl;
        if (id === 'local_snd') return `data:audio/wav;base64,${audioData}`;
        return null;
      };
      const session = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '图文音混合' },
            { type: 'media', kind: 'image', mediaId: 'local_pic', mimeType: 'image/png' },
            { type: 'media', kind: 'audio', mediaId: 'local_snd', mimeType: 'audio/wav' },
          ],
        }],
      };
      const msgs = await builder.buildMessages(session, { contextWindowSize: 20 }, [], resolver);
      const parts = msgs[1].content;
      expect(parts[0]).toEqual({ type: 'text', text: '图文音混合' });
      expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: imgUrl, detail: 'auto' } });
      expect(parts[2]).toEqual({ type: 'input_audio', input_audio: { data: audioData, format: 'wav' } });
    });
  });
});
