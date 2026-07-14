import { describe, it, expect } from 'vitest';
import { ToolExecutor } from './session-tools.js';
import { ToolsManager } from '../services/ToolsManager.js';
import { Tool, ToolCall } from '../models/Tool.js';
import { TextBlock } from '../models/MessageContent.js';

// 验证 ToolExecutor：工具以 { output } 结构化返回时，tool 消息保留内容，
// 且**不再**额外注入 user 图片消息（原 userMedia 注入机制已随截图脚本化移除）。
describe('ToolExecutor 工具结果写入', () => {
  it('结构化返回 { output }：tool 消息为文本块，且不注入额外 user 消息', async () => {
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

    // 截图能力已脚本化：内核不再把 userMedia 注入为独立的 user 图片消息
    expect(userMsgs.length).toBe(0);
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
