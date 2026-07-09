/**
 * orchestration/request — 抽出的纯函数单测（buildTurnRequest / applySessionCache）
 *
 * 不依赖 Kernel / IPC，验证重构切片的行为正确性。
 */
import { describe, it, expect } from 'vitest';
import { buildTurnRequest, applySessionCache } from './request.js';
import { MessagesRequest, ThinkingConfig } from '../models/MessageContent.js';

describe('buildTurnRequest', () => {
  it('构造流式 MessagesRequest，透传 model/messages/tools', () => {
    const req = buildTurnRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      thinking: new ThinkingConfig('off'),
      tools: null,
    });
    expect(req).toBeInstanceOf(MessagesRequest);
    expect(req.model).toBe('gpt-4o');
    expect(req.stream).toBe(true);
    expect(req.tools).toBeNull();
  });

  it('透传工具数组', () => {
    const tools = [{ name: 'run_user_script' }];
    const req = buildTurnRequest({
      model: 'm',
      messages: [],
      thinking: new ThinkingConfig('low'),
      tools,
    });
    expect(req.tools).toEqual(tools);
  });

  it('不修改调用方传入的 options', () => {
    const opts = { model: 'm', messages: [1], thinking: new ThinkingConfig('off'), tools: null };
    buildTurnRequest(opts);
    expect(opts.tools).toBeNull();
  });
});

describe('applySessionCache', () => {
  it('把会话级缓存 key 注入 provider.cacheOptions', () => {
    const service: any = { name: 'lmstudio', cacheOptions: {} };
    applySessionCache(service, 'abc-123');
    expect(service.cacheOptions.sessionCacheKey).toBe('webagentcli:session:abc-123');
  });

  it('cacheOptions 缺失时不抛错', () => {
    const service: any = { name: 'p' };
    expect(() => applySessionCache(service, 'x')).not.toThrow();
  });
});
