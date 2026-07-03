/**
 * IPC — 事件总线测试
 *
 * 覆盖：
 * - on/off/emit/once 基本订阅发布
 * - 取消订阅 (off / 返回函数)
 * - 中间件链 (use / 阻断 / 错误恢复)
 * - 命名空间通道 (getOrCreateChannel / 隔离)
 * - 查询方法 (getRegisteredEvents / getListenerCount / removeAllListeners)
 * - destroy 清理
 * - origin 追踪
 */
import { describe, it, expect, vi } from 'vitest';
import { IPC } from './IPC.js';

describe('IPC 事件总线', () => {

  // ─── 基本订阅发布 ────────────────────────────

  describe('基本订阅发布', () => {
    it('on + emit 正常收发消息', () => {
      const ipc = new IPC();
      const handler = vi.fn();
      ipc.on('test.event', handler);
      ipc.emit('test.event', { hello: 'world' });

      expect(handler).toHaveBeenCalledTimes(1);
      const [data, message] = handler.mock.calls[0];
      expect(data).toEqual({ hello: 'world' });
      expect(message).toHaveProperty('event', 'test.event');
      expect(message).toHaveProperty('timestamp');
      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('origin');
    });

    it('emit 返回 IPCMessage', () => {
      const ipc = new IPC({ origin: 'test' });
      const msg = ipc.emit('e', { x: 1 });
      expect(msg.event).toBe('e');
      expect(msg.data).toEqual({ x: 1 });
      expect(msg.origin).toBe('test');
    });

    it('未订阅的事件 emit 不报错', () => {
      const ipc = new IPC();
      expect(() => ipc.emit('no.listeners', {})).not.toThrow();
    });

    it('多个监听器都能收到', () => {
      const ipc = new IPC();
      const h1 = vi.fn();
      const h2 = vi.fn();
      ipc.on('e', h1);
      ipc.on('e', h2);
      ipc.emit('e', {});
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('listener 抛错不影响其他 listener', () => {
      const ipc = new IPC();
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      ipc.on('e', bad);
      ipc.on('e', good);
      expect(() => ipc.emit('e', {})).not.toThrow();
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    });
  });

  // ─── once ────────────────────────────────────

  describe('once', () => {
    it('once 只触发一次', () => {
      const ipc = new IPC();
      const handler = vi.fn();
      ipc.once('once.event', handler);

      ipc.emit('once.event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      ipc.emit('once.event', {});
      expect(handler).toHaveBeenCalledTimes(1); // 不会再触发
    });
  });

  // ─── 取消订阅 ────────────────────────────────

  describe('取消订阅', () => {
    it('off 取消指定 listener', () => {
      const ipc = new IPC();
      const handler = vi.fn();
      ipc.on('e', handler);
      ipc.off('e', handler);
      ipc.emit('e', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('on 返回取消函数', () => {
      const ipc = new IPC();
      const handler = vi.fn();
      const unsubscribe = ipc.on('e', handler);
      unsubscribe();
      ipc.emit('e', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('off 不存在的 listener 不报错', () => {
      const ipc = new IPC();
      expect(() => ipc.off('e', () => {})).not.toThrow();
    });
  });

  // ─── 中间件 ──────────────────────────────────

  describe('中间件', () => {
    it('中间件链按注册顺序执行', () => {
      const ipc = new IPC();
      const order: string[] = [];

      ipc.use((_msg, next) => { order.push('A'); return next(); });
      ipc.use((_msg, next) => { order.push('B'); return next(); });
      ipc.use((_msg, next) => { order.push('C'); return next(); });

      ipc.on('e', () => { order.push('handler'); });
      ipc.emit('e', {});

      expect(order).toEqual(['A', 'B', 'C', 'handler']);
    });

    it('中间件返回 false 阻断事件', () => {
      const ipc = new IPC();
      const handler = vi.fn();

      ipc.use((_msg, next) => { return false; });
      ipc.on('e', handler);
      ipc.emit('e', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('中间件抛错不阻断链', () => {
      const ipc = new IPC();
      const handler = vi.fn();

      ipc.use((_msg, next) => { throw new Error('mw error'); });
      ipc.use((_msg, next) => { return next(); });
      ipc.on('e', handler);

      expect(() => ipc.emit('e', {})).not.toThrow();
      expect(handler).toHaveBeenCalled();
    });

    it('use 返回取消注册函数', () => {
      const ipc = new IPC();
      const order: string[] = [];
      const unuse = ipc.use(() => { order.push('used'); });
      unuse();
      ipc.emit('e', {});
      expect(order).toEqual([]);
    });
  });

  // ─── 通道 ────────────────────────────────────

  describe('命名空间通道', () => {
    it('getOrCreateChannel 创建命名空间子 IPC', () => {
      const ipc = new IPC({ origin: 'root' });
      const chat = ipc.getOrCreateChannel('chat');
      expect(chat).toBeInstanceOf(IPC);
      // 验证 origin 命名空间
      const msg = chat.emit('test', {});
      expect(msg.origin).toBe('root:chat');
    });

    it('同名通道返回同一个实例', () => {
      const ipc = new IPC();
      const ch1 = ipc.getOrCreateChannel('chat');
      const ch2 = ipc.getOrCreateChannel('chat');
      expect(ch1).toBe(ch2);
    });

    it('通道事件隔离 — 父 IPC 收不到子 IPC 的事件', () => {
      const ipc = new IPC();
      const parentHandler = vi.fn();
      ipc.on('e', parentHandler);

      const child = ipc.getOrCreateChannel('child');
      const childHandler = vi.fn();
      child.on('e', childHandler);

      child.emit('e', { msg: 'from child' });

      expect(parentHandler).not.toHaveBeenCalled();
      expect(childHandler).toHaveBeenCalledTimes(1);
    });

    it('通道事件隔离 — 子 IPC 收不到父 IPC 的事件', () => {
      const ipc = new IPC();
      const child = ipc.getOrCreateChannel('child');
      const childHandler = vi.fn();
      child.on('e', childHandler);

      ipc.emit('e', {});
      expect(childHandler).not.toHaveBeenCalled();
    });
  });

  // ─── 查询方法 ────────────────────────────────

  describe('查询方法', () => {
    it('getRegisteredEvents 返回所有已注册事件名', () => {
      const ipc = new IPC();
      ipc.on('a', () => {});
      ipc.on('b', () => {});
      ipc.on('b', () => {});
      expect(ipc.getRegisteredEvents()).toEqual(expect.arrayContaining(['a', 'b']));
      expect(ipc.getRegisteredEvents().length).toBe(2);
    });

    it('getListenerCount 无参返回总数', () => {
      const ipc = new IPC();
      ipc.on('a', () => {});
      ipc.on('b', () => {});
      ipc.on('b', () => {});
      expect(ipc.getListenerCount()).toBe(3);
    });

    it('getListenerCount(event) 返回指定事件数', () => {
      const ipc = new IPC();
      ipc.on('a', () => {});
      ipc.on('b', () => {});
      ipc.on('b', () => {});
      expect(ipc.getListenerCount('a')).toBe(1);
      expect(ipc.getListenerCount('b')).toBe(2);
    });

    it('getListenerCount 不存在的事件返回 0', () => {
      const ipc = new IPC();
      expect(ipc.getListenerCount('nonexistent')).toBe(0);
    });

    it('removeAllListeners 清空所有监听', () => {
      const ipc = new IPC();
      ipc.on('a', () => {});
      ipc.on('b', () => {});
      ipc.removeAllListeners();
      expect(ipc.getListenerCount()).toBe(0);
    });
  });

  // ─── destroy ────────────────────────────────

  describe('destroy', () => {
    it('destroy 清空 listeners/middlewares/子通道', () => {
      const ipc = new IPC();
      ipc.on('a', () => {});
      ipc.use(() => {});
      ipc.getOrCreateChannel('chat');

      ipc.destroy();
      expect(ipc.getListenerCount()).toBe(0);
      expect(ipc.getRegisteredEvents().length).toBe(0);
    });
  });
});
