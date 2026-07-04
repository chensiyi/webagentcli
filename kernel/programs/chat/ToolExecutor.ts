/**
 * ToolExecutor — 工具调用执行器
 *
 * 职责：
 * - 遍历 LLM 返回的 tool_calls，逐一调用 ToolsManager 中注册的工具
 * - 收集 ToolResult，格式化为 tool role 消息写入 Session
 * - 通过 emit 回调发出 TOOL.EXECUTING / TOOL.COMPLETED / TOOL.ALL_COMPLETED 事件
 *
 * 设计原则：
 * - 依赖注入：ToolsManager 和 SessionManager 通过 Kernel 获取，emit 通过回调注入
 * - 不持有 IPC 引用，不管理状态，纯执行
 */

import { ToolResult } from '../../models/Tool.js';
import { Message, Role } from '../../models/Message.js';
import { Kernel } from '../../Kernel.js';
import { KernelEvents } from '../../Events.js';

type EmitFn = (event: string, data: unknown) => void;

export class ToolExecutor {
  private kernel: Kernel;
  private emit: EmitFn;

  /**
   * @param kernel  内核实例（用于获取 toolsManager、sessionManager）
   * @param emit    事件发射回调（ChatProgram 注入其 IPC emit 函数）
   */
  constructor(kernel: Kernel, emit: EmitFn) {
    this.kernel = kernel;
    this.emit = emit;
  }

  /**
   * 执行一批工具调用
   *
   * @param toolCalls  LLM 返回的 tool call 数组 { id, toolName, input }
   * @param sessionId  当前会话 ID
   * @returns 执行结果数组，如果全部成功则返回结果
   */
  async execute(toolCalls: Array<{ id: string; toolName: string; input?: unknown }>, sessionId: string): Promise<ToolResult[]> {
    const sm = this.kernel.getSessionManager();
    const toolResults: ToolResult[] = [];

    for (const tc of toolCalls) {
      this.emit(KernelEvents.TOOL.EXECUTING, { toolName: tc.toolName, toolCallId: tc.id, sessionId });

      let toolResult: ToolResult;
      try {
        let tabId: number | null = null;
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs[0]?.id || null;
        } catch (_e) { /* 非浏览器环境 */ }

        toolResult = await this.kernel.toolsManager!.invoke(tc, { sessionId, tabId, kernel: this.kernel });
      } catch (invokeError: any) {
        toolResult = new ToolResult({
          toolCallId: tc.id,
          status: 'failed',
          error: invokeError.message || String(invokeError),
        });
      }

      toolResults.push(toolResult);
      this.emit(KernelEvents.TOOL.COMPLETED, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        status: toolResult.status,
        duration: toolResult.duration,
        sessionId,
      });

      // 工具结果作为 tool 角色消息写入会话
      const toolMsg = new Message({
        role: Role.TOOL,
        toolCallId: tc.id,
        content: toolResult.isSuccess()
          ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
          : `⚠️ 执行失败: ${toolResult.error}`,
      });
      await sm.addMessage(toolMsg, sessionId);
      this.emit(KernelEvents.CHAT.MESSAGE_ADDED, { messageId: toolMsg.id, sessionId });
    }

    this.emit(KernelEvents.TOOL.ALL_COMPLETED, { toolResults, sessionId });
    return toolResults;
  }
}
