/**
 * ToolRegistry — 工具注册表测试
 *
 * 覆盖：
 * - register / registerAll / unregister / get / has
 * - enable / disable 开关
 * - getEnabled / getDisabled / getEnabledCount / getTotalCount
 * - getAll / findByCapability
 * - getDefinitionsForLLM (OpenAI 格式)
 * - 调用历史 (recordInvocation / getInvocationHistory / 筛选 / 上限)
 * - beforeInvoke / afterInvoke 钩子
 * - getStats / clear / destroy
 */
import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from './ToolRegistry.js';

// 创建模拟工具
function makeTool(name: string, opts: Record<string, unknown> = {}) {
  return {
    definition: {
      name,
      description: opts.description || `Tool ${name}`,
      capabilities: (opts.capabilities || []) as string[],
      inputSchema: opts.inputSchema || { type: 'object' },
      toOpenAIFunction() {
        return {
          type: 'function',
          function: {
            name: this.name,
            description: this.description,
            parameters: this.inputSchema || { type: 'object', properties: {} },
          },
        };
      },
    },
    enabled: opts.enabled !== false,
    invoke: opts.invoke || vi.fn(),
  };
}

describe('ToolRegistry', () => {

  // ─── 注册 ────────────────────────────────────

  describe('注册', () => {
    it('register 注册一个工具', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('tool_a'));
      expect(reg.has('tool_a')).toBe(true);
      expect(reg.getTotalCount()).toBe(1);
    });

    it('register 重复注册抛错', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('tool_a'));
      expect(() => reg.register(makeTool('tool_a'))).toThrow(/already registered/i);
    });

    it('register null/undefined/无 definition 抛错', () => {
      const reg = new ToolRegistry();
      expect(() => reg.register(null)).toThrow();
      expect(() => reg.register({})).toThrow();
      expect(() => reg.register({ definition: {} })).toThrow();
    });

    it('registerAll 批量注册（容错：单个失败不阻断）', () => {
      const reg = new ToolRegistry();
      reg.registerAll([
        makeTool('a'),
        null, // 这个会跳过
        makeTool('b'),
      ]);
      expect(reg.getTotalCount()).toBe(2);
      expect(reg.has('a')).toBe(true);
      expect(reg.has('b')).toBe(true);
    });

    it('unregister 移除工具', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('tool_a'));
      reg.unregister('tool_a');
      expect(reg.has('tool_a')).toBe(false);
      expect(reg.getTotalCount()).toBe(0);
    });
  });

  // ─── 查询 ────────────────────────────────────

  describe('查询', () => {
    it('get 返回工具对象', () => {
      const reg = new ToolRegistry();
      const tool = makeTool('search');
      reg.register(tool);
      expect(reg.get('search')).toBe(tool);
    });

    it('get 不存在的工具返回 null', () => {
      const reg = new ToolRegistry();
      expect(reg.get('nonexistent')).toBeNull();
    });

    it('getAll 返回所有工具的数组', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.register(makeTool('b'));
      expect(reg.getAll().length).toBe(2);
    });

    it('findByCapability 按能力筛选', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('reader', { capabilities: ['read'] }));
      reg.register(makeTool('writer', { capabilities: ['write'] }));
      reg.register(makeTool('both', { capabilities: ['read', 'write'] }));

      const readers = reg.findByCapability('read');
      expect(readers.length).toBe(2);

      const writers = reg.findByCapability('write');
      expect(writers.length).toBe(2);

      const deleters = reg.findByCapability('delete');
      expect(deleters.length).toBe(0);
    });
  });

  // ─── 启用/禁用 ────────────────────────────────

  describe('启用/禁用', () => {
    it('新注册的工具默认启用', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      expect(reg.getEnabledCount()).toBe(1);
      expect(reg.getDisabled().length).toBe(0);
    });

    it('可注册时指定 enabled: false', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a', { enabled: false }));
      expect(reg.getEnabledCount()).toBe(0);
      expect(reg.getDisabled().length).toBe(1);
    });

    it('disable/enable 切换开关', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.disable('a');
      expect(reg.getEnabledCount()).toBe(0);
      expect(reg.getDisabled().length).toBe(1);

      reg.enable('a');
      expect(reg.getEnabledCount()).toBe(1);
      expect(reg.getDisabled().length).toBe(0);
    });

    it('getEnabled 仅返回启用的工具', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.register(makeTool('b', { enabled: false }));
      const enabled = reg.getEnabled();
      expect(enabled.length).toBe(1);
    });
  });

  // ─── OpenAI 函数定义 ─────────────────────────

  describe('getDefinitionsForLLM', () => {
    it('返回启用工具的 OpenAI 格式定义', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('search', { description: 'Search the web' }));
      reg.register(makeTool('calc', { enabled: false }));

      const defs = reg.getDefinitionsForLLM('openai');
      expect(defs.length).toBe(1);
      expect(defs[0]).toEqual({
        type: 'function',
        function: {
          name: 'search',
          description: 'Search the web',
          parameters: { type: 'object' },
        },
      });
    });

    it('空注册表返回空数组', () => {
      const reg = new ToolRegistry();
      expect(reg.getDefinitionsForLLM('openai')).toEqual([]);
    });
  });

  // ─── 调用历史 ────────────────────────────────

  describe('调用历史', () => {
    it('recordInvocation 记录调用', () => {
      const reg = new ToolRegistry();
      reg.recordInvocation({ toolName: 'search', status: 'completed' });
      reg.recordInvocation({ toolName: 'calc', status: 'failed' });

      const history = reg.getInvocationHistory();
      expect(history.length).toBe(2);
      expect(history[0].toolName).toBe('search');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('id');
    });

    it('getInvocationHistory 支持按 toolName 筛选', () => {
      const reg = new ToolRegistry();
      reg.recordInvocation({ toolName: 'search' });
      reg.recordInvocation({ toolName: 'calc' });
      reg.recordInvocation({ toolName: 'search' });

      expect(reg.getInvocationHistory({ toolName: 'search' }).length).toBe(2);
      expect(reg.getInvocationHistory({ toolName: 'calc' }).length).toBe(1);
    });

    it('getInvocationHistory 支持按 status 筛选', () => {
      const reg = new ToolRegistry();
      reg.recordInvocation({ status: 'completed' });
      reg.recordInvocation({ status: 'failed' });
      reg.recordInvocation({ status: 'completed' });

      expect(reg.getInvocationHistory({ status: 'completed' }).length).toBe(2);
    });

    it('getInvocationHistory 支持 limit', () => {
      const reg = new ToolRegistry();
      for (let i = 0; i < 10; i++) {
        reg.recordInvocation({ toolName: 'search', index: i });
      }
      expect(reg.getInvocationHistory({ limit: 3 }).length).toBe(3);
    });

    it('历史记录超过 maxHistory 时移除最旧', () => {
      const reg = new ToolRegistry({ maxHistory: 3 });
      reg.recordInvocation({ toolName: 'a' });
      reg.recordInvocation({ toolName: 'b' });
      reg.recordInvocation({ toolName: 'c' });
      reg.recordInvocation({ toolName: 'd' });

      const history = reg.getInvocationHistory();
      expect(history.length).toBe(3);
      expect(history[0].toolName).toBe('b'); // a 被挤出
    });
  });

  // ─── 钩子 ────────────────────────────────────

  describe('beforeInvoke / afterInvoke', () => {
    it('setBeforeInvoke 设置前置钩子', () => {
      const reg = new ToolRegistry();
      const fn = vi.fn(() => true);
      reg.setBeforeInvoke(fn);
      const result = reg.runBeforeInvoke({}, {});
      expect(fn).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('beforeInvoke 返回 false 拒绝执行', () => {
      const reg = new ToolRegistry();
      reg.setBeforeInvoke(() => false);
      expect(reg.runBeforeInvoke({}, {})).toBe(false);
    });

    it('没有前置钩子默认通过', () => {
      const reg = new ToolRegistry();
      expect(reg.runBeforeInvoke({}, {})).toBe(true);
    });

    it('setAfterInvoke 设置后置钩子', () => {
      const reg = new ToolRegistry();
      const fn = vi.fn();
      reg.setAfterInvoke(fn);
      reg.runAfterInvoke({ result: 'ok' }, {});
      expect(fn).toHaveBeenCalled();
    });
  });

  // ─── 统计 ────────────────────────────────────

  describe('getStats', () => {
    it('返回完整统计信息', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.register(makeTool('b', { enabled: false }));
      reg.recordInvocation({ toolName: 'a', status: 'completed' });
      reg.recordInvocation({ toolName: 'a', status: 'completed' });
      reg.recordInvocation({ toolName: 'a', status: 'failed' });

      const stats = reg.getStats();
      expect(stats.totalTools).toBe(2);
      expect(stats.enabledTools).toBe(1);
      expect(stats.disabledTools).toBe(1);
      expect(stats.totalInvocations).toBe(3);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
    });

    it('无调用时 successRate 为 N/A', () => {
      const stats = new ToolRegistry().getStats();
      expect(stats.successRate).toBe('N/A');
    });
  });

  // ─── 清理 ────────────────────────────────────

  describe('clear / destroy', () => {
    it('clearHistory 清空历史保留工具', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.recordInvocation({ toolName: 'a' });
      reg.clearHistory();
      expect(reg.getInvocationHistory().length).toBe(0);
      expect(reg.getTotalCount()).toBe(1);
    });

    it('clear 清空工具和历史', () => {
      const reg = new ToolRegistry();
      reg.register(makeTool('a'));
      reg.recordInvocation({ toolName: 'a' });
      reg.clear();
      expect(reg.getTotalCount()).toBe(0);
      expect(reg.getInvocationHistory().length).toBe(0);
    });

    it('destroy 清空+清理钩子', () => {
      const reg = new ToolRegistry({ beforeInvoke: vi.fn(), afterInvoke: vi.fn() });
      reg.register(makeTool('a'));
      reg.destroy();
      expect(reg.getTotalCount()).toBe(0);
      // destroy 不应抛错
    });
  });
});
