import { describe, it, expect } from 'vitest';
import { Session } from './Session.js';
import { Message } from './Message.js';

describe('Session 模型', () => {
  it('从存储纯对象重建时，messages 必须 rehydrate 成 Message 实例', () => {
    // 模拟从 chrome.storage 读回的纯对象（toJSON 产物）
    const plain = {
      id: 'session_1',
      title: '测试会话',
      messages: [
        { id: 'm1', role: 'user', content: 'hi' },
        { id: 'm2', role: 'assistant', content: 'hello' }
      ],
      reasoningEffort: 'medium',
      createdAt: 100,
      updatedAt: 200
    };
    const s = new Session(plain);
    expect(s.messages.length).toBe(2);
    // 关键：每条都必须是 Message 实例，否则 toJSON 会报 "e.toJSON is not a function"
    for (const m of s.messages) {
      expect(m).toBeInstanceOf(Message);
    }
  });

  it('rehydrate 后的会话 toJSON 不再抛错（回归：persistSessions error）', () => {
    const plain = {
      id: 'session_2',
      title: '回归',
      messages: [{ id: 'm1', role: 'user', content: 'plain object message' }],
      createdAt: 1,
      updatedAt: 2
    };
    const s = new Session(plain);
    // 之前这里会抛 "e.toJSON is not a function"
    expect(() => s.toJSON()).not.toThrow();
    const json = s.toJSON() as any;
    expect(json.messages[0].content).toBe('plain object message');
    expect(json.messages[0].role).toBe('user');
  });

  it('toJSON 对混入的裸对象不抛错（防御层）', () => {
    const s = new Session({ id: 'session_3', messages: [] });
    // 人为塞入一个没有 toJSON 的裸对象（极端/历史脏数据）
    (s as any).messages.push({ id: 'bad', role: 'user', content: 'no toJSON' });
    expect(() => s.toJSON()).not.toThrow();
  });

  it('toIndexJSON 必须持久化 reasoningEffort（回归：重启后思考强度回退 medium）', () => {
    const s = new Session({ id: 'session_4', title: '高推理', reasoningEffort: 'high', messages: [] });
    const idx = s.toIndexJSON() as any;
    expect(idx.reasoningEffort).toBe('high');
  });

  it('从索引重建会话时保留 reasoningEffort，不回退默认 medium（模拟重启 init）', () => {
    // 模拟 SessionManager.init：先 toIndexJSON 落盘索引，再从索引重建 Session
    const original = new Session({ id: 'session_5', title: '高推理', reasoningEffort: 'high', messages: [
      { id: 'm1', role: 'user', content: 'hi' }
    ] });
    const indexEntry = original.toIndexJSON();
    // init() 把索引条目 {...entry} + 独立消息体 拼成 raw 再 new Session(raw)
    const raw = { ...indexEntry, messages: original.messages.map(m => (m as any).toJSON()) };
    const restored = new Session(raw);
    expect(restored.reasoningEffort).toBe('high');
  });
});
