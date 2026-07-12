import { describe, it, expect } from 'vitest';
import { wrapWithGM, buildGMApiWrapper } from './gm-api.js';

describe('gm-api 油猴对齐补齐', () => {
  it('wrapWithGM 注入 @require 前置代码与 GM_info 补全字段', () => {
    const wrapped = wrapWithGM('console.log(1)', {
      id: 's1', name: 'MyScript', version: '2.3', namespace: 'ns', description: 'desc', author: 'me',
      grant: [], code: '', requireCode: 'LIB_CODE();',
    } as any);
    expect(wrapped).toContain('LIB_CODE();');
    expect(wrapped).toContain('GM_info');
    expect(wrapped).toContain('"name":"MyScript"');
    expect(wrapped).toContain('"namespace":"ns"');
    expect(wrapped).toContain('"author":"me"');
    expect(wrapped).toContain('console.log(1)');
  });

  it('GM_getResourceText / GM_registerMenuCommand 随 grant 注入', () => {
    const api = buildGMApiWrapper(
      { id: 's2', resources: { r1: 'RTEXT' } } as any,
      ['GM_getResourceText', 'GM_registerMenuCommand'],
      {},
    );
    expect(api).toContain('GM_getResourceText');
    expect(api).toContain('__gmMenuCommands');
    expect(api).toContain('GM_registerMenuCommand');
  });

  it('未 grant 的 API 不注入', () => {
    const api = buildGMApiWrapper({ id: 's3' } as any, ['GM_setValue'], {});
    expect(api).toContain('GM_setValue');
    expect(api).not.toContain('GM_getResourceText');
    expect(api).not.toContain('GM_addElement');
  });
});
