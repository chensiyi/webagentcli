import { ToolCall } from "./Tool";
export class TextBlock { type: string; text: string; constructor(text: string) { this.type = 'text'; this.text = text; } toJSON(): { type: string; text: string } { return { type: 'text', text: this.text }; } static fromJSON(d: { text: string }): TextBlock { return new TextBlock(d.text); } }
export class ImageBlock { type: string; source: string; constructor(source: string) { this.type = 'image'; this.source = source; } toJSON(): { type: string; source: string } { return { type: 'image', source: this.source }; } static fromJSON(d: { source: string }): ImageBlock { return new ImageBlock(d.source); } }
export class ToolUseBlock { type: string; id: string; name: string; input: unknown; constructor(id: string, name: string, input: unknown) { this.type = 'tool_use'; this.id = id; this.name = name; this.input = input; } toJSON(): { type: string; id: string; name: string; input: unknown } { return { type: 'tool_use', id: this.id, name: this.name, input: this.input }; } static fromJSON(d: { id: string; name: string; input: unknown }): ToolUseBlock { return new ToolUseBlock(d.id, d.name, d.input); } }
export class ToolResultBlock { type: string; toolUseId: string; content: unknown; constructor(toolUseId: string, content: unknown) { this.type = 'tool_result'; this.toolUseId = toolUseId; this.content = content; } toJSON(): { type: string; toolUseId: string; content: unknown } { return { type: 'tool_result', toolUseId: this.toolUseId, content: this.content }; } static fromJSON(d: { toolUseId: string; content: unknown }): ToolResultBlock { return new ToolResultBlock(d.toolUseId, d.content); } }
export class ThinkingBlock { type: string; thinking: string; signature: string | null; constructor(thinking: string, signature: string | null = null) { this.type = 'thinking'; this.thinking = thinking; this.signature = signature; } toJSON(): { type: string; thinking: string; signature?: string } { const o: { type: string; thinking: string; signature?: string } = { type: 'thinking', thinking: this.thinking }; if (this.signature) o.signature = this.signature; return o; } static fromJSON(d: { thinking: string; signature?: string }): ThinkingBlock { return new ThinkingBlock(d.thinking, d.signature ?? null); } }
export class ThinkingConfig { effort: string; constructor(effort: string = 'off') { this.effort = effort; } toJSON(): { effort: string } { return { effort: this.effort }; } static fromJSON(d: { effort?: string }): ThinkingConfig { return new ThinkingConfig(d?.effort || 'off'); } }
export class MediaContent { type: string; text: string; dataUrl: string; url: string; filename: string; mimeType: string; size: number; metadata: Record<string, unknown>; constructor(opts: Record<string, unknown> = {}) { this.type = opts.type as string; this.text = opts.text as string; this.dataUrl = opts.dataUrl as string; this.url = opts.url as string; this.filename = opts.filename as string; this.mimeType = opts.mimeType as string; this.size = opts.size as number; this.metadata = (opts.metadata as Record<string, unknown>) || {}; } }

// =============================================================================
// 多媒体内容块（统一媒体模型）
// =============================================================================
export type MediaKind = 'image' | 'audio' | 'video' | 'file';

/**
 * 多媒体消息块。
 *
 * - `mediaId`：IndexedDB 中的 blob 引用，是唯一持久化字段（消息 JSON 只存它，
 *   不存 base64，避免 chrome.storage.local 配额被图片撑爆）。
 * - `url`：会话内临时展示/请求用的 dataURL 或 objectURL，**不持久化**（toJSON 故意排除）。
 * - 兼容旧 `ImageBlock`（`type:'image'` + `source`）：序列化时按 media 块处理，source 视为 url。
 */
export class MediaBlock {
  type: string = 'media';
  kind: MediaKind;
  mediaId: string;
  mimeType: string;
  filename?: string;
  size?: number;
  url?: string;
  text?: string;
  constructor(opts: Record<string, unknown> = {}) {
    this.kind = (opts.kind as MediaKind) || 'file';
    this.mediaId = opts.mediaId as string;
    this.mimeType = opts.mimeType as string;
    this.filename = opts.filename as string | undefined;
    this.size = opts.size as number | undefined;
    this.url = opts.url as string | undefined;
    this.text = opts.text as string | undefined;
  }
  toJSON(): Record<string, unknown> {
    const o: Record<string, unknown> = { type: 'media', kind: this.kind, mediaId: this.mediaId, mimeType: this.mimeType };
    if (this.filename) o.filename = this.filename;
    if (this.size) o.size = this.size;
    if (this.text) o.text = this.text;
    return o;
  }
  static fromJSON(d: Record<string, unknown>): MediaBlock {
    return new MediaBlock({ kind: d.kind, mediaId: d.mediaId, mimeType: d.mimeType, filename: d.filename, size: d.size, url: d.url, text: d.text });
  }
}

/** dataURL → base64 主体（剥离 `data:<mime>;base64,` 前缀） */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
/** 从 dataURL 提取 MIME（无则回退传入 mimeType 或 image/png） */
export function dataUrlMime(dataUrl: string, fallback = 'image/png'): string {
  const m = /^data:([^;,]*)/.exec(dataUrl);
  return m ? m[1] : fallback;
}

/** 音频 MIME → OpenAI input_audio format（仅支持 wav/mp3） */
function audioFormat(mimeType: string): 'wav' | 'mp3' {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  return 'wav';
}

// =============================================================================
// 媒体回收：从消息内容中收集 mediaId（用于删除会话/消息时连带清理二进制）
// =============================================================================

const MEDIA_ID_PREFIXES = ['local_', 'remote_'];

/**
 * 递归扫描任意内容结构，收集所有 mediaId 字符串（仅匹配 local_/remote_ 前缀，
 * 避免误收普通文本）。媒体块可能嵌套在 tool_result 等结构里，故必须递归。
 *
 * 注意：仅收集 media 块（type:'media'），不收集旧 ImageBlock（type:'image' + source 是 URL，
 * 不持有二进制引用）。
 */
function walkCollectMediaIds(node: unknown, out: Set<string>): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollectMediaIds(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const m = obj.mediaId;
  if (typeof m === 'string' && m && MEDIA_ID_PREFIXES.some((p) => m.startsWith(p))) {
    out.add(m);
  }
  for (const key of Object.keys(obj)) walkCollectMediaIds(obj[key], out);
}

/** 从单条消息的 content 中收集所有 mediaId。 */
export function collectMediaIds(content: unknown): string[] {
  const out = new Set<string>();
  walkCollectMediaIds(content, out);
  return [...out];
}

/** 从一组消息中收集所有 mediaId（去重）。 */
export function collectMediaIdsFromMessages(messages: { content?: unknown }[]): string[] {
  const out = new Set<string>();
  for (const m of messages || []) {
    for (const id of collectMediaIds(m?.content)) out.add(id);
  }
  return [...out];
}

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
    const role = msg.role || 'user';
    // 多模态 provider（OpenAI 家族 / Anthropic）走统一 content-parts 序列化
    if (format === 'openai' || format === 'anthropic') {
      const result: Record<string, unknown> = { role };
      const content = msg.content;
      // content 为 block 数组 → 拼成 provider 的 content parts；否则按原样（字符串）
      result.content = Array.isArray(content)
        ? MessageStructure.serializeContentParts(content, format)
        : (content || '');
      // toolCalls (驼峰) 或 tool_calls (下划线) → OpenAI 格式（Anthropic 亦兼容此形状）
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
    return { role, content: msg.content };
  }

  /**
   * 把内部内容块数组转换为 provider 的 content parts。
   * 目前仅处理文本与媒体块（图片/音频/文件/视频）；工具类块经 tool_calls 单独传递，此处跳过。
   * 媒体块发送前需已解析出 `url`（dataURL）——由编排层在发送时经 media.get 注入。
   */
  static serializeContentParts(blocks: any[], format: string): any[] {
    const parts: any[] = [];
    for (const b of blocks || []) {
      if (!b) continue;
      const t = b.type;
      if (t === 'text') {
        parts.push({ type: 'text', text: b.text || '' });
        continue;
      }
      // 兼容旧 ImageBlock（type:'image' + source）与新 MediaBlock（type:'media'）
      if (t === 'media' || t === 'image') {
        const kind: MediaKind = t === 'image' ? 'image' : (b.kind || 'file');
        const url: string | undefined = b.url || (t === 'image' ? b.source : undefined);
        if (!url) {
          // 未解析（理论上不会发生在正常发送流）：降级为文本提示，避免发出残缺请求
          parts.push({ type: 'text', text: `[媒体(${kind})未解析]` });
          continue;
        }
        const isData = url.startsWith('data:');
        if (kind === 'image') {
          if (format === 'anthropic') {
            // dataURL → base64；公网 URL → url source（远端资源服务器直链）
            if (isData) {
              parts.push({ type: 'image', source: { type: 'base64', media_type: dataUrlMime(url, b.mimeType), data: dataUrlToBase64(url) } });
            } else {
              parts.push({ type: 'image', source: { type: 'url', url } });
            }
          } else {
            // OpenAI image_url 同时接受 dataURL 与公网 URL（远端直链更省请求体积）
            parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } });
          }
        } else if (kind === 'audio') {
          // OpenAI: input_audio（仅 wav/mp3，需 base64）；Anthropic 暂不支持音频输入 → 降级
          if (format === 'anthropic') { parts.push({ type: 'text', text: '[音频暂不支持]' }); continue; }
          if (!isData) { parts.push({ type: 'text', text: `[音频(${kind})仅本地内容可内联，远端链接无法发送]` }); continue; }
          parts.push({ type: 'input_audio', input_audio: { data: dataUrlToBase64(url), format: audioFormat(b.mimeType) } });
        } else {
          // file / video：OpenAI 用 file part（内联 base64）；Anthropic 暂不支持 → 降级
          if (format === 'anthropic') { parts.push({ type: 'text', text: `[文件(${kind})暂不支持]` }); continue; }
          if (!isData) { parts.push({ type: 'text', text: `[文件(${kind})仅本地内容可内联，远端链接无法发送]` }); continue; }
          parts.push({ type: 'file', file: { file_data: dataUrlToBase64(url), filename: b.filename || `file.${kind}` } });
        }
        continue;
      }
      // ToolUseBlock / ToolResultBlock / ThinkingBlock 等非 content-part 块：跳过
    }
    return parts;
  }
}
export class MessagesRequest { model: string; messages: unknown[]; stream: boolean; temperature: number; max_tokens: number; thinking: unknown; tools: unknown; /** 自定义 HTTP 头部（由 Shell 层传入浏览器相关头，如 Referer） */ headers: Record<string, string>; constructor(opts: Record<string, unknown> = {}) { this.model = opts.model as string; this.messages = (opts.messages as unknown[]) || []; this.stream = (opts.stream as boolean) || false; this.temperature = opts.temperature as number; this.max_tokens = opts.max_tokens as number; this.thinking = opts.thinking as ThinkingConfig | null; this.tools = opts.tools as unknown[] | null; this.headers = (opts.headers as Record<string, string>) || {}; } }
