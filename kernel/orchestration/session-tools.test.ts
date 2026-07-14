import { describe, it, expect } from 'vitest';
import { ToolExecutor } from './session-tools.js';
import { ToolsManager } from '../services/ToolsManager.js';
import { Tool, ToolCall } from '../models/Tool.js';
import { TextBlock } from '../models/MessageContent.js';

// 验证 ToolExecutor：工具以 { output, userMedia } 结构化返回时，
// tool 消息保留文本，且 userMedia 被原子追加为一条 user 图片消息（模型当轮可见）。
describe('ToolExecutor 工具结果写入', () => {
  it('结构化返回 { output, userMedia }：tool 消息为文本，且额外注入 user 图片消息', async () => {
    const capturedTool: any = {};
    const userMsgs: any[] = [];
    const fakeSm: any = {
      getSession: () => null,
      async appendToolResult(_sid: string, _tcId: string, content: any, isError: boolean) {
        capturedTool.content = content;
        capturedTool.isError = isError;
        return { id: 'm1', role: 'tool', content, toolCallId: _tcId };
      },
      async addMessage(msg: any) { userMsgs.push(msg); return msg; },
    };
    const tool = new Tool({
      name: 'screenshot',
      description: 't',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({
        output: [new TextBlock('已捕获截图')],
        userMedia: [{ mediaId: 'local_1', mimeType: 'image/png', filename: 'screenshot.png' }],
      }),
    });
    const fakeTools = new ToolsManager();
    fakeTools.register(tool);
    const fakeKernel: any = {
      getToolsManager: () => fakeTools,
      getSessionManager: () => fakeSm,
    };

    const exec = new ToolExecutor(fakeKernel, () => {});
    await exec.execute([new ToolCall('c1', 'screenshot', {})], 'sid');

    expect(Array.isArray(capturedTool.content)).toBe(true);
    expect(capturedTool.content[0].text).toContain('截图');
    expect(capturedTool.isError).toBe(false);

    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0].role).toBe('user');
    const mc = userMsgs[0].content;
    expect(Array.isArray(mc)).toBe(true);
    expect(mc[0].type).toBe('media');
    expect(mc[0].mediaId).toBe('local_1');
    expect(mc[0].mimeType).toBe('image/png');
  });

  it('字符串结果保持原样且不注入 user 消息（向后兼容）', async () => {
    const capturedTool: any = {};
    const userMsgs: any[] = [];
    const fakeSm: any = {
      getSession: () => null,
      async appendToolResult(_sid: string, _tcId: string, content: any, isError: boolean) {
        capturedTool.content = content;
        capturedTool.isError = isError;
        return { id: 'm2', role: 'tool', content, toolCallId: _tcId };
      },
      async addMessage(msg: any) { userMsgs.push(msg); return msg; },
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
    await exec.execute([new ToolCall('c2', 'echo', {})], 'sid');

    expect(capturedTool.content).toBe('hello world');
    expect(capturedTool.isError).toBe(false);
    expect(userMsgs.length).toBe(0);
  });
});
