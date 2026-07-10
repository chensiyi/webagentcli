/**
 * SSE 流式解析共享工具。
 *
 * 替代 OpenAIService / OpenRouterService / LMStudioService 中三份近似克隆的
 * 流式读取循环（reader 创建、buffer 跨块拼接、行拆分、JSON.parse、[DONE] 跳过、容错日志）。
 * 三个 Provider 仅需保留各自不同的「分片 → 累积」逻辑。
 */
import { Log } from '../Log.js';

/**
 * 逐行读取 SSE 流，对每个 `data: ` 前缀的 JSON 行调用 onData。
 * 统一处理：buffer 跨块拼接、跳过空行 / `data: [DONE]` / 非 data 行、JSON.parse 容错。
 */
export async function forEachSSEData(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onData: (json: any) => void,
  logTag: string
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;
      try {
        onData(JSON.parse(trimmed.slice(6)));
      } catch (e) {
        Log.warn(logTag, 'Failed to parse SSE chunk:', e);
      }
    }
  }
}

/**
 * 从 SSE chunk 中提取上游返回的错误。
 * OpenAI / OpenRouter 等兼容服务可能把错误放在 chunk 顶层 `error` 字段
 * （如 `{"choices":[],"error":{"code":500,"message":"Internal Server Error"}}`），
 * 也可能放在 `choices[0].error`。若不提取，这类错误会被 `if (!choice) return` 静默吞掉，
 * 流式静默结束、交互直接停止、用户无感知。
 * @returns 错误描述字符串，或 null（该 chunk 非错误）
 */
export function extractStreamError(parsed: any): string | null {
  const e = parsed?.error ?? parsed?.choices?.[0]?.error;
  if (!e) return null;
  if (typeof e === 'string') return e;
  if (e.message) return `${e.code ? `[${e.code}] ` : ''}${e.message}`;
  try { return JSON.stringify(e); } catch { return '未知流式错误'; }
}

/**
 * 累积 OpenAI 格式 tool_calls 分片（按 index 合并 function.name / function.arguments）。
 * OpenAIService 与 OpenRouterService 共用。
 */
export function accumulateOpenAIToolCall(pending: Record<number, any>, tc: any): void {
  if (!pending[tc.index]) {
    pending[tc.index] = tc;
    return;
  }
  const existing = pending[tc.index];
  if (tc.function) {
    existing.function = existing.function || { name: '', arguments: '' };
    existing.function.name = existing.function.name || tc.function.name || '';
    existing.function.arguments = (existing.function.arguments || '') + (tc.function.arguments || '');
  }
}

/** 组装流式响应最终对象（SSE 末片 usage/model 通常为 null）。 */
export function makeStreamResult(
  content: string,
  reasoning: string,
  toolCalls: any[],
  finishReason: string | null
): any {
  return {
    content,
    reasoning_content: reasoning,
    toolCalls,
    finishReason: finishReason || 'stop',
    usage: null,
    model: null,
  };
}
