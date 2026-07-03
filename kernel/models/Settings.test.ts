/**
 * Settings — 设置模型测试
 *
 * 覆盖：
 * - 构造函数默认值
 * - toJSON 脱敏（apiKey 不应明文泄漏）
 * - fromJSON 反序列化
 */
import { describe, it, expect } from 'vitest';
import { Settings } from './Settings.js';

describe('Settings', () => {

  // ─── 构造函数 ──────────────────────────────────

  describe('构造函数', () => {
    it('默认值', () => {
      const s = new Settings();
      expect(s.provider).toBe('openai');
      expect(s.endpoint).toBe('');
      expect(s.apiKey).toBe('');
      expect(s.model).toBe('gpt-4o');
      expect(s.reasoningEffort).toBe('medium');
      expect(s.autoContextTruncation).toBe(true);
      expect(s.contextWindowSize).toBe(20);
      expect(s.maxTokens).toBe(2000);
      expect(s.contextWindowRatio).toBe(0.8);
      expect(s.temperature).toBeNull();
      expect(s.metadata).toEqual({});
    });

    it('接受自定义值', () => {
      const s = new Settings({
        provider: 'openrouter',
        model: 'claude-3',
        apiKey: 'sk-test123',
        contextWindowSize: 50,
      });
      expect(s.provider).toBe('openrouter');
      expect(s.model).toBe('claude-3');
      expect(s.apiKey).toBe('sk-test123');
      expect(s.contextWindowSize).toBe(50);
    });

    it('autoContextTruncation 默认 true，显式 false 为 false', () => {
      expect(new Settings().autoContextTruncation).toBe(true);
      expect(new Settings({ autoContextTruncation: false }).autoContextTruncation).toBe(false);
    });
  });

  // ─── 序列化 ──────────────────────────────────

  describe('toJSON', () => {
    it('toJSON 输出所有字段', () => {
      const s = new Settings({ provider: 'openrouter', model: 'gpt-4o' });
      const json = s.toJSON();
      expect(json.provider).toBe('openrouter');
      expect(json.model).toBe('gpt-4o');
      expect(json.autoContextTruncation).toBe(true);
    });
  });

  // ─── fromJSON ────────────────────────────────

  describe('fromJSON', () => {
    it('Settings 没有 fromJSON（继承 BaseModel 抛错，因为 Settings 不走反序列化路径，由 SettingsManager 直接 new）', () => {
      expect(() => Settings.fromJSON({})).toThrow();
    });
  });
});
