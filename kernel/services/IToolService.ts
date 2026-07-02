import { ToolDefinition } from '../models/ToolDefinition.js';
import { ToolCall } from '../models/ToolCall.js';
import { ToolResult } from '../models/ToolResult.js';
import { Log } from './Log.js';

export class IToolService {
  definition: ToolDefinition;
  enabled: boolean;
  handler: ((args: unknown, ctx: unknown) => Promise<unknown> | unknown) | null;

  constructor(definition) { this.definition = definition; this.enabled = true; }
  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
  register(definition, handler) {
    this.definition = definition;
    this.handler = handler;
    return this;
  }

  /**
   * 执行工具调用。
   * 从 call 中提取 input（工具参数），传给 handler，
   * 将 handler 返回值包装为 ToolResult。
   */
  async invoke(call, ctx) {
    const toolCallId = call?.id || '';
    const input = call?.input ?? call?.arguments ?? call;
    const toolName = call?.toolName || call?.name || this.definition?.name || '';

    if (!this.handler) {
      Log.warn('IToolService', `No handler for tool: ${toolName}`);
      return new ToolResult({ toolCallId, status: 'failed', error: 'Tool handler not registered' });
    }

    const start = Date.now();
    try {
      Log.info('IToolService', `Invoking: ${toolName} (callId=${toolCallId})`);
      const output = await this.handler(input, ctx);

      // handler 可能直接返回 ToolResult
      if (output && typeof (output as any).isSuccess === 'function') {
        return output;
      }

      const duration = Date.now() - start;
      Log.info('IToolService', `Completed: ${toolName} in ${duration}ms`);
      return new ToolResult({ toolCallId, status: 'success', output, duration });
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err as Error)?.message || String(err);
      Log.error('IToolService', `Failed: ${toolName} — ${errMsg}`);
      return new ToolResult({ toolCallId, status: 'failed', error: errMsg, duration });
    }
  }
}