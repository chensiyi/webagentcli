import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptureScreenshotTool } from './CaptureScreenshotTool.js';
import { TextBlock } from 'kernel/models/MessageContent.js';

// 1x1 透明 PNG（合法 PNG 签名 + IHDR：宽高各 1 像素），用于验证 pngSize 解析与 media 落盘。
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('CaptureScreenshotTool', () => {
  let chromeMock: any;
  let mediaStoreMock: any;

  beforeEach(() => {
    mediaStoreMock = {
      put: vi.fn(async (dataUrl: string) => 'local_' + Math.random().toString(36).slice(2)),
    };
    chromeMock = {
      tabs: {
        query: vi.fn(async () => [{ id: 9, url: 'https://example.com' }]),
        get: vi.fn(async () => ({ id: 9, url: 'https://example.com' })),
        captureVisibleTab: vi.fn(async () => PNG_1X1),
      },
      extension: {
        isAllowedFileSchemeAccess: vi.fn(async () => true),
      },
    };
    (globalThis as any).chrome = chromeMock;
  });
  afterEach(() => { delete (globalThis as any).chrome; });

  it('元信息正确（name/source/category/danger）', () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    expect(tool.name).toBe('capture_screenshot');
    expect(tool.source).toBe('builtin');
    expect(tool.category).toBe('page-capability');
    expect(tool.danger).toBe(false);
    expect((tool.inputSchema as any).properties.format.enum).toEqual(['png', 'jpeg']);
  });

  it('handler 调用 captureVisibleTab 并经 mediaStore 落盘，返回 { output:[TextBlock], userMedia:[{mediaId...}] }', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    const out = await tool.handler!({}, { tabId: 9 }) as any;

    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalled();
    expect(mediaStoreMock.put).toHaveBeenCalledTimes(1);
    expect(mediaStoreMock.put.mock.calls[0][1]).toBe('image/png');

    expect(Array.isArray(out)).toBe(false);
    expect(out).toHaveProperty('output');
    expect(out).toHaveProperty('userMedia');
    const [text] = out.output as any[];
    expect(text).toBeInstanceOf(TextBlock);
    expect(text.text).toContain('截图');
    // 工具结果文本须附带图片 url（dataURL），便于模型/调试引用
    expect(text.text).toContain(PNG_1X1);
    expect(Array.isArray(out.userMedia)).toBe(true);
    const um = out.userMedia[0];
    expect(typeof um.mediaId).toBe('string');
    expect(um.mediaId.length).toBeGreaterThan(0);
    expect(um.mimeType).toBe('image/png');
    expect(um.filename).toBe('screenshot.png');
  });

  it('无 context.tabId 时回退到活动标签', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    await tool.handler!({}, {});
    expect(chromeMock.tabs.query).toHaveBeenCalled();
    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalled();
  });

  it('format=jpeg 时以 image/jpeg 落盘', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    // 用一个 jpeg dataURL 模拟返回
    chromeMock.tabs.captureVisibleTab = vi.fn(async () => 'data:image/jpeg;base64,/9j/xxx');
    await tool.handler!({ format: 'jpeg' }, { tabId: 9 });
    expect(mediaStoreMock.put.mock.calls[0][1]).toBe('image/jpeg');
  });

  it('非法 format 抛错', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    await expect(tool.handler!({ format: 'gif' }, { tabId: 9 })).rejects.toThrow(/png \/ jpeg/);
  });

  it('当前标签为受限页面（chrome://）时优雅返回说明、不抛错、不调用 captureVisibleTab', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    chromeMock.tabs.query = vi.fn(async () => [{ id: 1, url: 'chrome://settings' }]);
    const out = await tool.handler!({}, { tabId: 1 });
    expect(Array.isArray(out)).toBe(true);
    const [text] = out as any[];
    expect(text).toBeInstanceOf(TextBlock);
    expect(text.text).toMatch(/特殊|受限|chrome/i);
    expect(chromeMock.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(mediaStoreMock.put).not.toHaveBeenCalled();
  });

  it('file:// 页面且未开启文件访问时优雅返回说明、不调用 captureVisibleTab', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    chromeMock.tabs.query = vi.fn(async () => [{ id: 2, url: 'file:///C:/test.html' }]);
    chromeMock.extension.isAllowedFileSchemeAccess = vi.fn(async () => false);
    const out = await tool.handler!({}, {});
    expect(Array.isArray(out)).toBe(true);
    const [text] = out as any[];
    expect(text).toBeInstanceOf(TextBlock);
    expect(text.text).toMatch(/允许访问文件网址/);
    expect(chromeMock.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('file:// 页面已开启文件访问时正常截图', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    chromeMock.tabs.query = vi.fn(async () => [{ id: 2, url: 'file:///C:/test.html' }]);
    chromeMock.extension.isAllowedFileSchemeAccess = vi.fn(async () => true);
    const out = await tool.handler!({}, {});
    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalled();
    expect(mediaStoreMock.put).toHaveBeenCalled();
  });

  it('captureVisibleTab 失败时抛出可读错误', async () => {
    const tool = new CaptureScreenshotTool({} as any, mediaStoreMock);
    chromeMock.tabs.captureVisibleTab = vi.fn(async () => { throw new Error('denied'); });
    await expect(tool.handler!({}, { tabId: 9 })).rejects.toThrow(/截图失败/);
  });
});
