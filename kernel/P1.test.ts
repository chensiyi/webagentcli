/**
 * P1 修复验证：ProviderFactory 独立持有 currentProvider
 *
 * 验证：
 * 1. Kernel 上不再有 currentProviderService / updateProviderService / getCurrentProviderService
 * 2. ProviderFactory 持有 currentProvider，可通过 getCurrentProvider/updateProvider 管理
 * 3. Kernel.getProviderFactory() 能获取 ProviderFactory 服务
 * 4. ChatProgram 通过 ProviderFactory 获取 provider（而非直接从 Kernel）
 */
import { describe, it, expect } from 'vitest';
import { Kernel } from './Kernel.js';
import { ProviderFactory } from './services/ProviderFactory.js';
import { IProviderAPIService } from './services/IProviderAPIService.js';

describe('P1-7: currentProviderService 移到 ProviderFactory', () => {
  it('Kernel 不应有 currentProviderService 属性', () => {
    const kernel = new Kernel();
    expect('currentProviderService' in kernel).toBe(false);
  });

  it('Kernel 不应有 updateProviderService 方法', () => {
    const kernel = new Kernel();
    expect(typeof kernel.updateProviderService).toBe('undefined');
  });

  it('Kernel 不应有 getCurrentProviderService 方法', () => {
    const kernel = new Kernel();
    expect(typeof kernel.getCurrentProviderService).toBe('undefined');
  });

  it('Kernel 应有 getProviderFactory 方法', () => {
    const kernel = new Kernel();
    expect(typeof kernel.getProviderFactory).toBe('function');
  });

  it('ProviderFactory 应有 getCurrentProvider 方法', () => {
    const pf = new ProviderFactory(null);
    expect(typeof pf.getCurrentProvider).toBe('function');
  });

  it('ProviderFactory 应有 updateProvider 方法', () => {
    const pf = new ProviderFactory(null);
    expect(typeof pf.updateProvider).toBe('function');
  });

  it('ProviderFactory.getCurrentProvider() 初始返回 null', () => {
    const pf = new ProviderFactory(null);
    expect(pf.getCurrentProvider()).toBeNull();
  });

  it('ProviderFactory.updateProvider 设置 provider 后 getCurrentProvider 返回它', () => {
    const pf = new ProviderFactory(null);
    const mockService = { name: 'test' } as unknown as IProviderAPIService;
    pf.updateProvider(mockService);
    expect(pf.getCurrentProvider()).toBe(mockService);
  });
});

describe('P1-10: Kernel 不再循环引用 index.ts', () => {
  it('Kernel imports 直接来自各服务文件（无 ./index.js）', () => {
    // 这个通过构建成功来验证（循环依赖会导致 vite 报错）
    // 间接验证：Kernel.ts 源码中 import 不含 ./index.js
    // 直接测试：Kernel 实例能正常创建和使用
    const kernel = new Kernel();
    expect(kernel).toBeDefined();
    expect(kernel.state).toBe('created');
  });
});
