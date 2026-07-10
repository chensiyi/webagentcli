/**
 * SessionManager 媒体回收测试
 *
 * 验证删会话 / 清空消息 / 删单条消息时，会经内核 mediaDeleter 回调连带清理
 * 其中引用的媒体二进制（mediaId）。回收为 best-effort：deleter 抛错不应影响删除主流程。
 */
import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from './SessionManager.js';
import { Message } from '../models/Message.js';

function makeManager(deleterImpl?: (ids: string[]) => Promise<void>) {
  const deleted: string[][] = [];
  const deleter = deleterImpl || (async (ids: string[]) => { deleted.push(ids); });
  const sm = new SessionManager({ ipc: null as any, storage: null as any });
  // 注入内核引用与 mediaDeleter 回调（真实环境由 background main.ts 接线）
  (sm as any)._kernel = { getMediaDeleter: () => deleter };
  return { sm, deleted };
}

describe('SessionManager 媒体回收', () => {
  it('deleteSession 连带清理会话内全部 mediaId（含嵌套 tool_result）', async () => {
    const { sm, deleted } = makeManager();
    const s = await sm.createSession({ persist: false });
    await sm.addMessage(new Message({
      role: 'user',
      content: [
        { type: 'text', text: '图' },
        { type: 'media', kind: 'image', mediaId: 'local_a', mimeType: 'image/png' },
      ],
    }), s.id);
    await sm.addMessage(new Message({
      role: 'tool',
      toolCallId: 't1',
      content: [{ type: 'media', kind: 'image', mediaId: 'remote_b', mimeType: 'image/png' }],
    }), s.id);

    await sm.deleteSession(s.id);

    expect(sm.getSession(s.id)).toBeNull();
    expect(deleted.length).toBe(1);
    expect(deleted[0].sort()).toEqual(['local_a', 'remote_b']);
  });

  it('clearMessages 清空后清理媒体', async () => {
    const { sm, deleted } = makeManager();
    const s = await sm.createSession({ persist: false });
    await sm.addMessage(new Message({ role: 'user', content: [
      { type: 'media', kind: 'image', mediaId: 'local_c', mimeType: 'image/png' },
    ] }), s.id);

    await sm.clearMessages(s.id);

    expect(sm.getSession(s.id)?.messages.length).toBe(0);
    expect(deleted.length).toBe(1);
    expect(deleted[0]).toEqual(['local_c']);
  });

  it('deleteMessage 删除单条消息时清理其媒体', async () => {
    const { sm, deleted } = makeManager();
    const s = await sm.createSession({ persist: false });
    const msg = new Message({ role: 'user', content: [
      { type: 'media', kind: 'image', mediaId: 'local_d', mimeType: 'image/png' },
    ] });
    await sm.addMessage(msg, s.id);

    const ok = await sm.deleteMessage(msg.id, s.id);

    expect(ok).toBe(true);
    expect(deleted.length).toBe(1);
    expect(deleted[0]).toEqual(['local_d']);
  });

  it('无媒体引用的会话删除不触发 deleter', async () => {
    const { sm, deleted } = makeManager();
    const s = await sm.createSession({ persist: false });
    await sm.addMessage(new Message({ role: 'user', content: '纯文本' }), s.id);

    await sm.deleteSession(s.id);
    expect(deleted.length).toBe(0);
  });

  it('deleter 抛错不影响删除主流程（best-effort）', async () => {
    const failing = vi.fn(async () => { throw new Error('media store down'); });
    const { sm } = makeManager(failing);
    const s = await sm.createSession({ persist: false });
    await sm.addMessage(new Message({ role: 'user', content: [
      { type: 'media', kind: 'image', mediaId: 'local_e', mimeType: 'image/png' },
    ] }), s.id);

    // 不应抛出
    await expect(sm.deleteSession(s.id)).resolves.toBeUndefined();
    expect(sm.getSession(s.id)).toBeNull();
    expect(failing).toHaveBeenCalledOnce();
  });

  it('未接线 deleter 时删除仍正常完成', async () => {
    const sm = new SessionManager({ ipc: null as any, storage: null as any });
    (sm as any)._kernel = null;
    const s = await sm.createSession({ persist: false });
    await sm.addMessage(new Message({ role: 'user', content: [
      { type: 'media', kind: 'image', mediaId: 'local_f', mimeType: 'image/png' },
    ] }), s.id);

    await expect(sm.deleteSession(s.id)).resolves.toBeUndefined();
    expect(sm.getSession(s.id)).toBeNull();
  });
});
