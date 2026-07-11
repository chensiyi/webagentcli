import { describe, it, expect } from 'vitest';
import { ToolExecutor } from './session-tools.js';
import { ToolsManager } from '../services/ToolsManager.js';
import { Tool, ToolCall } from '../models/Tool.js';

// 验证 ToolExecutor 在写入 tool 结果消息时保留媒体 block 数组（不 JSON.stringify），
// 否则图片块会被转义成文本、模型无法「看见」图像。
describe('ToolExecutor 工具结果写入', () => {
  it('成功结果若 handler 返回媒体 block 数组，写入消息的 content 仍应为数组', async () => {
    const captured: any = {};
    const fakeSm: any = {
      async appendToolResult(_sid: string, _tcId: string, content: any, isError: boolean) {
        captured.content = content;
        captured.isError = isError;
        return { id: 'm1', role: 'tool', content, toolCallId: _tcId };
      }
    };
    const tool = new Tool({
      name: 'image_lookup_tool',
      description: 't',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ([{ type: 'media', kind: 'image', mediaId: 'remote_1' }]),
    });
    const fakeTools = new ToolsManager();
    fakeTools.register(tool);
    const fakeKernel: any = {
      getToolsManager: () => fakeTools,
      getSessionManager: () => fakeSm,
    };

    const exec = new ToolExecutor(fakeKernel, () => {});
    const tc = new ToolCall('c1', 'image_lookup_tool', {});
    await exec.execute([tc], 'sid');

    expect(Array.isArray(captured.content)).toBe(true);
    expect(captured.content[0].mediaId).toBe('remote_1');
    expect(captured.isError).toBe(false);
  });

  it('字符串结果保持原样（向后兼容）', async () => {
    const captured: any = {};
    const fakeSm: any = {
      async appendToolResult(_sid: string, _tcId: string, content: any, isError: boolean) {
        captured.content = content;
        captured.isError = isError;
        return { id: 'm2', role: 'tool', content, toolCallId: _tcId };
      }
    };
    const tool = new Tool({
      name: 'echo',
      description: 't',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => 'hello world',
    });
    const fakeTools = new ToolsManager();
    fakeTools.register(tool);
    const fakeKernel: any = {
      getToolsManager: () => fakeTools,
      getSessionManager: () => fakeSm,
    };

    const exec = new ToolExecutor(fakeKernel, () => {});
    const tc = new ToolCall('c2', 'echo', {});
    await exec.execute([tc], 'sid');

    expect(captured.content).toBe('hello world');
    expect(captured.isError).toBe(false);
  });
});
