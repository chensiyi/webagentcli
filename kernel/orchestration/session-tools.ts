/**
 * ToolExecutor — 工具调用执行器
 *
 * 职责：
 * - 遍历 LLM 返回的 tool_calls，逐一调用 ToolsManager 中注册的工具
 * - 失败时自动重试（最多 3 次，间隔递增）
 * - 收集 ToolResult，格式化为 tool role 消息写入 Session
 * - 通过 emit 回调发出 TOOL.EXECUTING / TOOL.COMPLETED / TOOL.ALL_COMPLETED 事件
 *
 * 设计原则：
 * - 依赖注入：ToolsManager 和 SessionManager 通过 Kernel 获取，emit 通过回调注入
 * - 不持有 IPC 引用，不管理状态，纯执行
 * - 零浏览器依赖：tabId 由调用方传入，内核不查询 chrome.tabs
 */

import { ToolCall, ToolResult } from 'kernel/models/Tool.js';
import { Kernel } from 'kernel/Kernel.js';
import { KernelEvents } from 'kernel/Events.js';
import { Log } from 'kernel/services/Log.js';

type EmitFn = (event: string, data: unknown) => void;

/** 重试间隔（毫秒） */
const RETRY_DELAY = 2000;
/** 最大重试次数 */
const MAX_RETRIES = 3;

export class ToolExecutor {
  private kernel: Kernel;
  private emit: EmitFn;

  /**
   * @param kernel  内核实例（用于获取 toolsManager、sessionManager）
   * @param emit    事件发射回调（由 session RPC facade 注入其 IPC emit 函数）
   */
  constructor(kernel: Kernel, emit: EmitFn) {
    this.kernel = kernel;
    this.emit = emit;
  }

  /**
   * 判断错误是否值得重试
   * 重试条件：超时错误、网络错误、临时性错误
   */
  private _isRetryableError(error: any): boolean {
    const msg = (error)?.message || String(error);
    const retryable = [
      '超时', 'timeout', 'TIMEOUT',
      '网络', 'network', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
      '500', '502', '503', '504', '429',
      'quota', 'rate_limit', 'rate limit',
    ];
    return retryable.some(k => msg.toLowerCase().includes(k.toLowerCase()));
  }

  /**
   * 带重试的执行单个工具
   *
   * @param tc       工具调用信息
   * @param context  执行上下文（含 tabId 等，由调用方传入）
   * @param retries  最大重试次数
   */
  private async _invokeWithRetry(
    tc: ToolCall,
    context: Record<string, unknown>,
    retries: number = MAX_RETRIES
  ): Promise<ToolResult> {
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.kernel.getToolsManager().invoke(tc, context);

        // 失败且可重试
        if (!result.isSuccess() && attempt < retries && this._isRetryableError(result.error)) {
          lastError = result.error;
          Log.warn('ToolExecutor', `重试 ${tc.toolName} (${attempt}/${retries - 1})，${RETRY_DELAY}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }

        return result;
      } catch (invokeError: any) {
        if (attempt < retries && this._isRetryableError(invokeError)) {
          lastError = invokeError;
          Log.warn('ToolExecutor', `重试 ${tc.toolName} (${attempt}/${retries - 1})，${RETRY_DELAY}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        return new ToolResult({
          toolCallId: tc.id,
          status: 'failed',
          error: invokeError.message || String(invokeError),
        });
      }
    }

    return new ToolResult({
      toolCallId: tc.id,
      status: 'failed',
      error: (lastError)?.message || String(lastError),
    });
  }

  /**
   * 执行一批工具调用
   *
   * @param toolCalls  LLM 返回的 tool call 数组 { id, toolName, input }
   * @param sessionId  当前会话 ID
   * @param context    执行上下文（可选，含 tabId 等浏览器环境信息，由 Shell 层传入）
   * @returns 执行结果数组
   */
  async execute(toolCalls: ToolCall[], sessionId: string, context: Record<string, unknown> = {}): Promise<ToolResult[]> {
    const sm = this.kernel.getSessionManager();
    const toolResults: ToolResult[] = [];

    for (const tc of toolCalls) {
      this.emit(KernelEvents.TOOL.EXECUTING, { toolName: tc.toolName, toolCallId: tc.id, sessionId });

      const toolResult = await this._invokeWithRetry(tc, { sessionId, kernel: this.kernel, ...context });

      toolResults.push(toolResult);
      this.emit(KernelEvents.TOOL.COMPLETED, {
        toolName: tc.toolName,
        toolCallId: tc.id,
        status: toolResult.status,
        duration: toolResult.duration,
        sessionId,
      });

      // 工具结果作为 tool 角色消息写入会话（数据操作下沉到 SessionManager）
      const isError = !toolResult.isSuccess();
      const out = toolResult.isSuccess()
        ? (typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output, null, 2))
        : String(toolResult.error || 'unknown error');
      const toolMsg = await sm.appendToolResult(sessionId, tc.id, out, isError);
      this.emit(KernelEvents.SESSION.MESSAGE_ADDED, { messageId: toolMsg.id, sessionId });
    }

    this.emit(KernelEvents.TOOL.ALL_COMPLETED, { toolResults, sessionId });
    return toolResults;
  }
}
