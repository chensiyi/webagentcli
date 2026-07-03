/**
 * Process — 状态机 & 看门狗 测试
 *
 * 覆盖：
 * - 所有合法状态转换
 * - 所有非法状态转换（应抛错）
 * - 看门狗机制（setWatchdog / clearWatchdog / forceKill）
 * - 终止回调注入
 * - 终态/活跃态判断 (isFinished / isActive)
 * - 输出追加 (appendOutput)
 * - toJSON 序列化
 */
import { describe, it, expect, vi } from 'vitest';
import { Process } from './Process.js';

describe('Process 状态机', () => {

  // ─── 合法转换 ──────────────────────────────────

  describe('合法状态流转', () => {
    it('created → running → completed', () => {
      const p = new Process({ name: 'test' });
      expect(p.status).toBe('created');

      p.start();
      expect(p.status).toBe('running');
      expect(p.startedAt).toBeGreaterThan(0);
      expect(p.endedAt).toBeNull();

      p.complete();
      expect(p.status).toBe('completed');
      expect(p.endedAt).toBeGreaterThan(0);
      expect(p.isFinished()).toBe(true);
    });

    it('created → running → paused → running → completed', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.pause();
      expect(p.status).toBe('paused');
      p.resume();
      expect(p.status).toBe('running');
      p.complete();
      expect(p.status).toBe('completed');
    });

    it('created → running → failed', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.fail('something went wrong');
      expect(p.status).toBe('failed');
      expect(p.error).toBe('something went wrong');
      expect(p.endedAt).toBeGreaterThan(0);
      expect(p.isFinished()).toBe(true);
    });

    it('created → failed (直接从创建态失败)', () => {
      const p = new Process({ name: 'test' });
      p.fail('init error');
      expect(p.status).toBe('failed');
    });

    it('created → cancelled', () => {
      const p = new Process({ name: 'test' });
      p._forceStatus('cancelled');
      expect(p.status).toBe('cancelled');
    });

    it('完整取消流程: running → cancelling → cancelled', () => {
      const p = new Process({ name: 'test' });
      p.start();

      const terminateFn = vi.fn();
      p.beginCancel(terminateFn);
      expect(p.status).toBe('cancelling');
      expect(p.terminateFn).toBe(terminateFn);

      p.finishCancel();
      expect(p.status).toBe('cancelled');
      expect(p.endedAt).toBeGreaterThan(0);
      expect(p.isFinished()).toBe(true);
    });

    it('看门狗强制终止: running → cancelling → killed', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.beginCancel(() => { /* 一直不完成 */ });
      p.forceKill();
      expect(p.status).toBe('killed');
      expect(p.endedAt).toBeGreaterThan(0);
      expect(p.isFinished()).toBe(true);
    });

    it('暂停态也可以取消: paused → cancelling → cancelled', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.pause();
      p.beginCancel();
      expect(p.status).toBe('cancelling');
      p.finishCancel();
      expect(p.status).toBe('cancelled');
    });
  });

  // ─── 非法转换 ──────────────────────────────────

  describe('非法状态流转', () => {
    it('completed 不能流转', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.complete();
      expect(() => p.start()).toThrow(/Invalid transition/i);
      expect(() => p.fail('x')).toThrow(/Invalid transition/i);
      expect(() => p.pause()).toThrow(/Invalid transition/i);
    });

    it('failed 不能流转', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.fail('x');
      expect(() => p.complete()).toThrow(/Invalid transition/i);
      expect(() => p.start()).toThrow(/Invalid transition/i);
    });

    it('cancelled 不能流转', () => {
      const p = new Process({ name: 'test' });
      p._forceStatus('cancelled');
      expect(() => p.start()).toThrow(/Invalid transition/i);
      expect(() => p.complete()).toThrow(/Invalid transition/i);
    });

    it('killed 不能流转', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.beginCancel();
      p.forceKill();
      expect(() => p.start()).toThrow(/Invalid transition/i);
      expect(() => p.complete()).toThrow(/Invalid transition/i);
    });

    it('created 不能直接 complete', () => {
      const p = new Process({ name: 'test' });
      expect(() => p.complete()).toThrow(/Invalid transition/i);
    });

    it('created 不能直接 pause', () => {
      const p = new Process({ name: 'test' });
      expect(() => p.pause()).toThrow(/Invalid transition/i);
    });

    it('running 不能直接 cancelled（必须经过 cancelling）', () => {
      const p = new Process({ name: 'test' });
      p.start();
      expect(() => p.setStatus('cancelled')).toThrow(/Invalid transition/i);
      // _forceStatus 跳过校验，不抛错
      expect(() => p._forceStatus('cancelled')).not.toThrow();
      expect(p.status).toBe('cancelled');
    });

    it('重复设相同状态不抛错', () => {
      const p = new Process({ name: 'test' });
      p.start();
      expect(() => p.setStatus('running')).not.toThrow();
    });
  });

  // ─── 看门狗 ────────────────────────────────────

  describe('看门狗机制', () => {
    it('setWatchdog 设置定时器', () => {
      const p = new Process({ name: 'test' });
      const timer = setTimeout(() => {}, 1000);
      p.setWatchdog(timer);
      expect(p.watchdogTimer).toBe(timer);
      clearTimeout(timer);
    });

    it('clearWatchdog 清除定时器', () => {
      const p = new Process({ name: 'test' });
      const timer = setTimeout(() => {}, 1000);
      p.setWatchdog(timer);
      p.clearWatchdog();
      expect(p.watchdogTimer).toBeNull();
    });

    it('complete 自动清除看门狗', () => {
      const p = new Process({ name: 'test' });
      p.setWatchdog(setTimeout(() => {}, 1000));
      p.start();
      p.complete();
      expect(p.watchdogTimer).toBeNull();
    });

    it('fail 自动清除看门狗', () => {
      const p = new Process({ name: 'test' });
      p.setWatchdog(setTimeout(() => {}, 1000));
      p.start();
      p.fail('err');
      expect(p.watchdogTimer).toBeNull();
    });

    it('forceKill 自动清除看门狗', () => {
      const p = new Process({ name: 'test' });
      p.setWatchdog(setTimeout(() => {}, 1000));
      p.start();
      p.beginCancel();
      p.forceKill();
      expect(p.watchdogTimer).toBeNull();
    });
  });

  // ─── 终止回调 ──────────────────────────────────

  describe('终止回调', () => {
    it('setTerminateFn 注入且不触发状态变更', () => {
      const p = new Process({ name: 'test' });
      const fn = vi.fn();
      p.setTerminateFn(fn);
      expect(p.terminateFn).toBe(fn);
      expect(p.status).toBe('created'); // 不改变状态
    });

    it('beginCancel 同时注入终止回调', () => {
      const p = new Process({ name: 'test' });
      const fn = vi.fn();
      p.start();
      p.beginCancel(fn);
      expect(p.terminateFn).toBe(fn);
      expect(p.status).toBe('cancelling');
    });
  });

  // ─── 判断方法 ──────────────────────────────────

  describe('isFinished / isActive', () => {
    it('终态返回 isFinished=true', () => {
      const completed = new Process({ name: 'test' });
      completed.start();
      completed.complete();
      expect(completed.isFinished()).toBe(true);

      const failed = new Process({ name: 'test' });
      failed.start();
      failed.fail('x');
      expect(failed.isFinished()).toBe(true);

      const cancelled = new Process({ name: 'test' });
      cancelled._forceStatus('cancelled');
      expect(cancelled.isFinished()).toBe(true);

      const killed = new Process({ name: 'test' });
      killed.start();
      killed.beginCancel();
      killed.forceKill();
      expect(killed.isFinished()).toBe(true);
    });

    it('非终态返回 isActive=true', () => {
      expect(new Process({ name: 'test' }).isActive()).toBe(true);
      const running = new Process({ name: 'test' });
      running.start();
      expect(running.isActive()).toBe(true);
    });

    it('终态返回 isActive=false', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.complete();
      expect(p.isActive()).toBe(false);
    });
  });

  // ─── 输出追加 ──────────────────────────────────

  describe('appendOutput', () => {
    it('追加输出到 output 数组', () => {
      const p = new Process({ name: 'test' });
      p.appendOutput('line 1');
      p.appendOutput('line 2');
      expect(p.output).toEqual(['line 1', 'line 2']);
    });
  });

  // ─── 序列化 ────────────────────────────────────

  describe('toJSON', () => {
    it('序列化包含所有字段', () => {
      const p = new Process({ name: 'test' });
      p.start();
      p.complete();
      const json = p.toJSON();
      expect(json.name).toBe('test');
      expect(json.status).toBe('completed');
      expect(json.startedAt).toBeGreaterThan(0);
      expect(json.endedAt).toBeGreaterThan(0);
      expect(json.error).toBeNull();
      expect(json.output).toEqual([]);
      expect(json.timeout).toBe(5000);
      // watchdog 不应该出现在 JSON 中
      expect((json as any).watchdogTimer).toBeUndefined();
      expect((json as any).terminateFn).toBeUndefined();
    });
  });

  // ─── 默认值 ───────────────────────────────────

  describe('默认值', () => {
    it('默认 timeout 为 5000', () => {
      const p = new Process({ name: 'test' });
      expect(p.timeout).toBe(5000);
    });

    it('可自定义 timeout', () => {
      const p = new Process({ name: 'test', timeout: 30000 });
      expect(p.timeout).toBe(30000);
    });

    it('默认生成 ID', () => {
      const p = new Process({ name: 'test' });
      expect(p.id).toMatch(/^proc_\d+_\w+$/);
    });
  });
});
