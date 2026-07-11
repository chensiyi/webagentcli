/**
 * P0-1: MessageStructure 缺少关键方法
 *
 * OpenRouterService 和 LMStudioService 调用了：
 * - MessageStructure.parseToolCallsFromOpenAI(rawToolCalls)
 * - MessageStructure.toAPIFormat(msg, format)
 *
 * 验证这些方法是否存在于 MessageStructure 类上。
 */
import { describe, it, expect } from 'vitest';
import { MessageStructure, MediaBlock, dataUrlToBase64, dataUrlMime, collectMediaIds, collectMediaIdsFromMessages } from './MessageContent.js';

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const AUDIO = 'data:audio/wav;base64,UklGRg==';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQ=';

describe('P0-1: MessageStructure 缺方法', () => {
  it('MessageStructure 应有 parseToolCallsFromOpenAI 静态方法', () => {
    expect(typeof MessageStructure.parseToolCallsFromOpenAI).toBe('function');
  });

  it('MessageStructure.parseToolCallsFromOpenAI 应能解析 OpenAI 格式 tool_calls', () => {
    const rawToolCalls = [
      { id: 'call_001', function: { name: 'get_weather', arguments: '{"city":"Beijing"}' } },
      { id: 'call_002', function: { name: 'search_web', arguments: '{"query":"test"}' } },
    ];
    const result = MessageStructure.parseToolCallsFromOpenAI(rawToolCalls);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    // 每个 ToolCall 应至少有 id, toolName, input
    expect(result[0].id).toBe('call_001');
    expect(result[0].toolName).toBe('get_weather');
    expect(result[0].input).toEqual({ city: 'Beijing' });
  });

  it('MessageStructure.parseToolCallsFromOpenAI 处理空数组应返回空数组', () => {
    const result = MessageStructure.parseToolCallsFromOpenAI([]);
    expect(result).toEqual([]);
  });

  it('MessageStructure 应有 toAPIFormat 静态方法', () => {
    expect(typeof MessageStructure.toAPIFormat).toBe('function');
  });

  it('MessageStructure.toAPIFormat 应能将消息转为 OpenAI 格式', () => {
    const msg = { role: 'user', content: 'Hello' };
    const result = MessageStructure.toAPIFormat(msg, 'openai');
    expect(result).toBeDefined();
    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
  });
});

describe('MediaBlock 模型', () => {
  it('toJSON 持久化只含 mediaId/mimeType，排除 url（避免配额膨胀）', () => {
    const b = new MediaBlock({ kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: IMG, filename: 'a.png', size: 123 });
    const j = b.toJSON();
    expect(j.mediaId).toBe('m1');
    expect(j.kind).toBe('image');
    expect(j.mimeType).toBe('image/png');
    expect(j.filename).toBe('a.png');
    expect(j.url).toBeUndefined();
    expect('url' in j).toBe(false);
  });

  it('fromJSON 可还原（含 url 等可选字段）', () => {
    const b = MediaBlock.fromJSON({ kind: 'audio', mediaId: 'm2', mimeType: 'audio/wav', url: AUDIO });
    expect(b).toBeInstanceOf(MediaBlock);
    expect(b.kind).toBe('audio');
    expect(b.mediaId).toBe('m2');
    expect(b.url).toBe(AUDIO);
  });

  it('dataUrlToBase64 / dataUrlMime 工具', () => {
    expect(dataUrlToBase64(IMG)).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC');
    expect(dataUrlMime(IMG)).toBe('image/png');
  });
});

describe('toAPIFormat 多模态 content parts', () => {
  it('OpenAI: 文本 + 图片 → image_url parts', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: IMG },
      ],
    };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.role).toBe('user');
    expect(Array.isArray(r.content)).toBe(true);
    expect(r.content[0]).toEqual({ type: 'text', text: '看图' });
    expect(r.content[1]).toEqual({ type: 'image_url', image_url: { url: IMG, detail: 'auto' } });
  });

  it('Anthropic: 图片 → image source base64', () => {
    const msg = {
      role: 'user',
      content: [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: IMG }],
    };
    const r = MessageStructure.toAPIFormat(msg, 'anthropic') as any;
    expect(r.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: dataUrlToBase64(IMG) },
    });
  });

  it('OpenAI: 音频 → input_audio (wav)', () => {
    const msg = {
      role: 'user',
      content: [{ type: 'media', kind: 'audio', mediaId: 'm2', mimeType: 'audio/wav', url: AUDIO }],
    };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.content[0]).toEqual({ type: 'input_audio', input_audio: { data: dataUrlToBase64(AUDIO), format: 'wav' } });
  });

  it('OpenAI: 文件/PDF → file part (内联 base64)', () => {
    const msg = {
      role: 'user',
      content: [{ type: 'media', kind: 'file', mediaId: 'm3', mimeType: 'application/pdf', url: PDF, filename: 'doc.pdf' }],
    };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.content[0]).toEqual({ type: 'file', file: { file_data: dataUrlToBase64(PDF), filename: 'doc.pdf' } });
  });

  it('Anthropic 不支持音频/文件 → 降级为文本提示', () => {
    const audio = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'audio', mediaId: 'm2', mimeType: 'audio/wav', url: AUDIO }] }, 'anthropic') as any;
    expect(audio.content[0].type).toBe('text');
    const file = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'file', mediaId: 'm3', mimeType: 'application/pdf', url: PDF }] }, 'anthropic') as any;
    expect(file.content[0].type).toBe('text');
  });

  it('兼容旧 ImageBlock（type:image + source）', () => {
    const msg = { role: 'user', content: [{ type: 'image', source: IMG }] };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.content[0]).toEqual({ type: 'image_url', image_url: { url: IMG, detail: 'auto' } });
  });

  it('媒体块未解析（无 url）→ 降级文本，不发出残缺请求', () => {
    const msg = { role: 'user', content: [{ type: 'media', kind: 'image', mediaId: 'mX', mimeType: 'image/png' }] };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.content[0].type).toBe('text');
    expect(r.content[0].text).toContain('未解析');
  });

  it('tool_calls 与媒体内容可共存（assistant 消息）', () => {
    const msg = {
      role: 'assistant',
      content: [{ type: 'text', text: '分析完成' }],
      toolCalls: [{ id: 'c1', toolName: 'screenshot', input: {} }],
    };
    const r = MessageStructure.toAPIFormat(msg, 'openai') as any;
    expect(r.tool_calls).toBeDefined();
    expect(r.tool_calls[0].function.name).toBe('screenshot');
    expect(r.content[0].text).toBe('分析完成');
  });

  describe('远端资源服务器 URL 形态', () => {
    const HTTP_IMG = 'https://cdn.example.com/x.png';
    const HTTP_FILE = 'https://cdn.example.com/doc.pdf';

    it('图片为 http(s) URL：OpenAI 走 image_url 直链', () => {
      const r = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: HTTP_IMG }] }, 'openai') as any;
      expect(r.content[0]).toEqual({ type: 'image_url', image_url: { url: HTTP_IMG, detail: 'auto' } });
    });

    it('图片为 http(s) URL：Anthropic 走 source.type:url', () => {
      const r = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: HTTP_IMG }] }, 'anthropic') as any;
      expect(r.content[0]).toEqual({ type: 'image', source: { type: 'url', url: HTTP_IMG } });
    });

    it('图片为 dataURL：Anthropic 仍走 base64', () => {
      const r = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png', url: IMG }] }, 'anthropic') as any;
      expect(r.content[0].source.type).toBe('base64');
    });

    it('非图片远端链接（音频/文件）无法内联 → 降级文本提示', () => {
      const audio = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'audio', mediaId: 'm2', mimeType: 'audio/wav', url: HTTP_FILE }] }, 'openai') as any;
      expect(audio.content[0].type).toBe('text');
      expect(audio.content[0].text).toContain('仅本地内容可内联');
      const file = MessageStructure.toAPIFormat({ role: 'user', content: [{ type: 'media', kind: 'file', mediaId: 'm3', mimeType: 'application/pdf', url: HTTP_FILE }] }, 'openai') as any;
      expect(file.content[0].type).toBe('text');
      expect(file.content[0].text).toContain('仅本地内容可内联');
    });
  });
});

describe('collectMediaIds 媒体回收收集', () => {
  it('纯文本 content 不收集任何 mediaId', () => {
    expect(collectMediaIds('只是文本')).toEqual([]);
    expect(collectMediaIds([{ type: 'text', text: 'hi' }])).toEqual([]);
  });

  it('media 块收集其 mediaId（local_ 前缀）', () => {
    const content = [
      { type: 'text', text: '看图' },
      { type: 'media', kind: 'image', mediaId: 'local_abc123', mimeType: 'image/png' },
    ];
    expect(collectMediaIds(content)).toEqual(['local_abc123']);
  });

  it('嵌套在 tool_result 内的 media 块也能被递归收集（remote_ 前缀）', () => {
    const content = [
      { type: 'tool_result', toolUseId: 't1', content: [
        { type: 'media', kind: 'image', mediaId: 'remote_xyz789', mimeType: 'image/png' },
      ] },
    ];
    expect(collectMediaIds(content)).toEqual(['remote_xyz789']);
  });

  it('旧 ImageBlock（type:image + source URL）不持有二进制，不收集', () => {
    const content = [{ type: 'image', source: 'https://x/y.png' }];
    expect(collectMediaIds(content)).toEqual([]);
  });

  it('非前缀 mediaId 不收集（仅 local_/remote_ 计入回收）', () => {
    const content = [{ type: 'media', kind: 'image', mediaId: 'm1', mimeType: 'image/png' }];
    expect(collectMediaIds(content)).toEqual([]);
  });

  it('collectMediaIdsFromMessages 跨消息去重', () => {
    const messages = [
      { content: [{ type: 'media', mediaId: 'local_a', kind: 'image' }] },
      { content: [{ type: 'media', mediaId: 'local_a', kind: 'image' }] },
      { content: [{ type: 'media', mediaId: 'local_b', kind: 'video' }] },
    ];
    expect(collectMediaIdsFromMessages(messages).sort()).toEqual(['local_a', 'local_b']);
  });
});
