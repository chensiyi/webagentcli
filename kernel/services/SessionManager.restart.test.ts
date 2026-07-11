import { describe, it, expect } from 'vitest';
import { SessionManager } from './SessionManager.js';
import { Message } from '../models/Message.js';
import { Role } from '../models/Message.js';

/** 内存版 IStorageManager，忠实实现 get/set/remove，模拟 chrome.storage 在重启间存活。 */
class MemoryStorage {
  private m = new Map<string, unknown>();
  async get(key: string) { return this.m.has(key) ? this.m.get(key) : undefined; }
  async set(key: string, v: unknown) { this.m.set(key, v); }
  async remove(key: string) { this.m.delete(key); }
  async clear() { this.m.clear(); }
  async getAll() { return Object.fromEntries(this.m); }
}

describe('SessionManager 重启持久化（端到端索引视图 round-trip）', () => {
  it('切换思考强度后重启，reasoningEffort 从索引恢复、不回退 medium', async () => {
    const storage = new MemoryStorage();
    const sm = new SessionManager({ storage });
    await sm.init();

    // 新建持久会话并发送首条消息（正式化，写入索引）
    const s = await sm.createSession({ reasoningEffort: 'low', model: 'gpt-4o', persist: true });
    await sm.addMessage(new Message({ role: Role.USER, content: 'hi' }), s.id);

    // 用户切换思考强度（模拟 UI handleReasoningEffortChange → api.session.update）
    await sm.updateSession(s.id, { reasoningEffort: 'high' });

    // 模拟扩展重启：丢弃旧实例，用同一 storage 重建 SessionManager 并 init()
    const sm2 = new SessionManager({ storage });
    await sm2.init();
    const restored = sm2.getSession(s.id);

    expect(restored).not.toBeNull();
    expect(restored!.reasoningEffort).toBe('high');
    expect(restored!.messages.length).toBe(1);
  });

  it('会话级 model 也随索引持久化，重启后恢复（回归：toIndexJSON 漏存 model）', async () => {
    const storage = new MemoryStorage();
    const sm = new SessionManager({ storage });
    await sm.init();

    const s = await sm.createSession({ reasoningEffort: 'medium', model: 'claude-3-opus', persist: true });
    await sm.addMessage(new Message({ role: Role.USER, content: 'hello' }), s.id);

    // 切换模型（与思考强度同源的会话级覆盖）
    await sm.updateSession(s.id, { model: 'gpt-4o-mini' });

    const sm2 = new SessionManager({ storage });
    await sm2.init();
    const restored = sm2.getSession(s.id);

    expect(restored).not.toBeNull();
    expect(restored!.model).toBe('gpt-4o-mini');
    expect(restored!.reasoningEffort).toBe('medium');
  });

  it('同时改 thinking+model，重启后两者都恢复', async () => {
    const storage = new MemoryStorage();
    const sm = new SessionManager({ storage });
    await sm.init();

    const s = await sm.createSession({ persist: true });
    await sm.addMessage(new Message({ role: Role.USER, content: 'x' }), s.id);
    await sm.updateSession(s.id, { reasoningEffort: 'low', model: 'local-model' });

    const sm2 = new SessionManager({ storage });
    await sm2.init();
    const restored = sm2.getSession(s.id);

    expect(restored!.reasoningEffort).toBe('low');
    expect(restored!.model).toBe('local-model');
  });
});
