import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractStreamError } from './sse.js';
import OpenAIService from './OpenAIService.js';
import OpenRouterService from './OpenRouterService.js';

/** 用字符串数组构造一个 SSE ReadableStream，模拟 fetch 响应体。 */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

function stubFetchWith(chunks: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    body: makeStream(chunks),
  });
}

describe('extractStreamError', () => {
  it('从顶层 error 对象提取 message', () => {
    expect(extractStreamError({ choices: [], error: { code: 500, message: 'Internal Server Error' } }))
      .toBe('[500] Internal Server Error');
  });
  it('从顶层 error 字符串提取', () => {
    expect(extractStreamError({ error: 'boom' })).toBe('boom');
  });
  it('从 choice.error 提取', () => {
    expect(extractStreamError({ choices: [{ error: { message: 'nope' } }] })).toBe('nope');
  });
  it('正常数据 chunk 返回 null', () => {
    expect(extractStreamError({ choices: [{ delta: { content: 'hi' } }] })).toBeNull();
    expect(extractStreamError({ choices: [] })).toBeNull();
  });
});

describe('流式错误 chunk 应被拒绝（而非静默停止）', () => {
  let service: any;
  beforeEach(() => {
    service = new OpenAIService();
    service.configure({ apiKey: 'test', endpoint: 'http://example.com/v1' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('OpenAIService.chatStream 在错误 chunk 时 reject', async () => {
    global.fetch = stubFetchWith([
      'data: {"choices":[],"error":{"code":500,"message":"Internal Server Error"}}\n\n',
    ]);
    await expect(service.chatStream({ model: 'm', messages: [] }, () => {})).rejects.toThrow(/Internal Server Error/);
  });

  it('OpenAIService.chatStream 正常 chunk 仍正常 resolve', async () => {
    global.fetch = stubFetchWith([
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"finish_reason":"stop"}\n\n',
      'data: [DONE]\n\n',
    ]);
    const res = await service.chatStream({ model: 'm', messages: [] }, () => {});
    expect(res.content).toBe('你好');
  });
});

describe('OpenRouterService 流式错误 chunk 应被拒绝', () => {
  let service: any;
  beforeEach(() => {
    service = new OpenRouterService();
    service.configure({ apiKey: 'test', endpoint: 'https://openrouter.ai/api/v1' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('在错误 chunk 时 reject', async () => {
    global.fetch = stubFetchWith([
      'data: {"id":"x","object":"chat.completion.chunk","choices":[],"error":{"code":500,"message":"Internal Server Error","metadata":{"error_type":"server"}}}\n\n',
    ]);
    await expect(
      service.chatStream({ model: 'openrouter/x', messages: [] }, () => {}),
    ).rejects.toThrow(/Internal Server Error/);
  });
});
