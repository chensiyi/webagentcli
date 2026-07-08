import { ToolCall } from "./Tool";
export class TextBlock { type: string; text: string; constructor(text: string) { this.type = 'text'; this.text = text; } toJSON(): { type: string; text: string } { return { type: 'text', text: this.text }; } static fromJSON(d: { text: string }): TextBlock { return new TextBlock(d.text); } }
export class ImageBlock { type: string; source: string; constructor(source: string) { this.type = 'image'; this.source = source; } toJSON(): { type: string; source: string } { return { type: 'image', source: this.source }; } static fromJSON(d: { source: string }): ImageBlock { return new ImageBlock(d.source); } }
export class ToolUseBlock { type: string; id: string; name: string; input: unknown; constructor(id: string, name: string, input: unknown) { this.type = 'tool_use'; this.id = id; this.name = name; this.input = input; } toJSON(): { type: string; id: string; name: string; input: unknown } { return { type: 'tool_use', id: this.id, name: this.name, input: this.input }; } static fromJSON(d: { id: string; name: string; input: unknown }): ToolUseBlock { return new ToolUseBlock(d.id, d.name, d.input); } }
export class ToolResultBlock { type: string; toolUseId: string; content: unknown; constructor(toolUseId: string, content: unknown) { this.type = 'tool_result'; this.toolUseId = toolUseId; this.content = content; } toJSON(): { type: string; toolUseId: string; content: unknown } { return { type: 'tool_result', toolUseId: this.toolUseId, content: this.content }; } static fromJSON(d: { toolUseId: string; content: unknown }): ToolResultBlock { return new ToolResultBlock(d.toolUseId, d.content); } }
export class ThinkingBlock { type: string; thinking: string; signature: string | null; constructor(thinking: string, signature: string | null = null) { this.type = 'thinking'; this.thinking = thinking; this.signature = signature; } toJSON(): { type: string; thinking: string; signature?: string } { const o: { type: string; thinking: string; signature?: string } = { type: 'thinking', thinking: this.thinking }; if (this.signature) o.signature = this.signature; return o; } static fromJSON(d: { thinking: string; signature?: string }): ThinkingBlock { return new ThinkingBlock(d.thinking, d.signature ?? null); } }
export class ThinkingConfig { effort: string; constructor(effort: string = 'off') { this.effort = effort; } toJSON(): { effort: string } { return { effort: this.effort }; } static fromJSON(d: { effort?: string }): ThinkingConfig { return new ThinkingConfig(d?.effort || 'off'); } }
export class MediaContent { type: string; text: string; dataUrl: string; url: string; filename: string; mimeType: string; size: number; metadata: Record<string, unknown>; constructor(opts: Record<string, unknown> = {}) { this.type = opts.type as string; this.text = opts.text as string; this.dataUrl = opts.dataUrl as string; this.url = opts.url as string; this.filename = opts.filename as string; this.mimeType = opts.mimeType as string; this.size = opts.size as number; this.metadata = (opts.metadata as Record<string, unknown>) || {}; } }
export class MessageStructure {
  role: string; content: string; reasoning_content: string; tool_calls: unknown[] | null;
  constructor(opts: Record<string, unknown> = {}) {
    this.role = opts.role as string;
    this.content = opts.content as string;
    this.reasoning_content = opts.reasoning_content as string;
    this.tool_calls = (opts.tool_calls as unknown[]) || null;
  }

  /**
   * 将 OpenAI 格式的 tool_calls 数组转为 ToolCall[] 实例。
   * OpenAI 格式: { id, function: { name, arguments } }
   * ToolCall 格式: { id, toolName, input, status, ... }
   */
  static parseToolCallsFromOpenAI(rawToolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string }; name?: string; input?: unknown }>): ToolCall[] {
    if (!rawToolCalls || !Array.isArray(rawToolCalls)) return [];
    return rawToolCalls.map(tc => {
      const id = tc.id || `call_${Date.now()}`;
      const name = tc.function?.name || tc.name || '';
      let input = {};
      if (tc.function?.arguments) {
        try { input = JSON.parse(tc.function.arguments); } catch { input = { raw: tc.function.arguments }; }
      } else if (tc.input) {
        input = tc.input;
      }
      return new ToolCall(id, name, input);
    });
  }

  /**
   * 将内部 toolCalls 格式转回 OpenAI 格式，供 API 请求使用。
   * 内部格式: ToolCall[]
   * OpenAI 格式: { id, type: 'function', function: { name, arguments } }
   */
  static toOpenAIToolCalls(toolCalls: ToolCall[]): Array<{ id: string; type: string; function: { name: string; arguments: string } }> {
    if (!toolCalls || !Array.isArray(toolCalls)) return [];
    return toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.toolName || '',
        arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input || {})
      }
    }));
  }

  /**
   * 将消息对象转为 API 发送格式。
   * 支持 'openai' 格式：{ role, content } + 可选 tool_calls / tool_call_id
   */
  static toAPIFormat(msg: any, format: string = 'openai'): Record<string, unknown> {
    if (!msg) return {};
    if (format === 'openai') {
      const result: Record<string, unknown> = { role: msg.role || 'user', content: msg.content || '' };
      // toolCalls (驼峰) 或 tool_calls (下划线) → OpenAI 格式
      const rawToolCalls = msg.toolCalls || msg.tool_calls;
      if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
        result.tool_calls = MessageStructure.toOpenAIToolCalls(rawToolCalls);
      }
      // toolCallId (驼峰) 或 tool_call_id (下划线) → OpenAI 格式
      const toolCallId = msg.toolCallId || msg.tool_call_id;
      if (toolCallId) result.tool_call_id = toolCallId;
      if (msg.name) result.name = msg.name;
      if (msg.reasoning_content) result.reasoning_content = msg.reasoning_content;
      return result;
    }
    return { role: msg.role, content: msg.content };
  }
}
export class MessagesRequest { model: string; messages: unknown[]; stream: boolean; temperature: number; max_tokens: number; thinking: unknown; tools: unknown; /** 自定义 HTTP 头部（由 Shell 层传入浏览器相关头，如 Referer） */ headers: Record<string, string>; constructor(opts: Record<string, unknown> = {}) { this.model = opts.model as string; this.messages = (opts.messages as unknown[]) || []; this.stream = (opts.stream as boolean) || false; this.temperature = opts.temperature as number; this.max_tokens = opts.max_tokens as number; this.thinking = opts.thinking as ThinkingConfig | null; this.tools = opts.tools as unknown[] | null; this.headers = (opts.headers as Record<string, string>) || {}; } }
