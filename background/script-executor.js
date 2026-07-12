/**
 * script-executor — 在目标标签页内执行 JS 的统一原语
 *
 * 被 ScriptTool（P2 用户脚本自动注册）与 RunUserScriptTool 共用，
 * 避免两处各自复制 chrome.userScripts.execute / chrome.scripting.executeScript
 * 的执行 + 超时竞态 + Trusted Types 兼容降级逻辑。
 *
 * 约定：传入的 `code` 应当是「可被 IIFE 包裹并返回值」的 JS 源码
 * （调用方负责注入 __toolArgs / wrapWithGM 等前置逻辑）。
 * 本执行器会把 `code` 包成 `(function(){ <code> })()` 以捕获其返回值作为结果。
 */
import { USER_SCRIPT_WORLD, MAIN_WORLD, ISOLATED_WORLD } from './keys.js';

/**
 * 在标签页内执行 JS 并返回格式化结果字符串。
 * @param tabId   目标标签页 id（必填）
 * @param code     待执行 JS（会被 IIFE 包裹以捕获 return）
 * @param world   目标世界：MAIN / ISOLATED / USER_SCRIPT
 * @param timeout  超时（毫秒），默认 300000
 */
export async function executeInPage({ tabId, code, world = MAIN_WORLD, timeout = 300000 }) {
  if (tabId == null) throw new Error('缺少目标标签页（tabId）');

  const effectiveTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 300000;
  let timeoutId;

  const formatOutput = (data) => {
    if (data === undefined) return 'undefined';
    if (typeof data === 'object') return JSON.stringify(data, null, 2);
    return String(data);
  };

  // ── 优先：chrome.userScripts.execute()（Chrome 135+，不受 Trusted Types 限制）──
  if (typeof chrome.userScripts?.execute === 'function') {
    try {
      const wrappedCode = `(function() { ${code} })()`;
      const executePromise = chrome.userScripts.execute({
        target: { tabId },
        js: [{ code: wrappedCode }],
        world: world === ISOLATED_WORLD ? USER_SCRIPT_WORLD : world,
        injectImmediately: true,
      });

      const results = await Promise.race([
        executePromise,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timeoutId = undefined;
            reject(new Error(`脚本执行超时（${effectiveTimeout}ms）`));
          }, effectiveTimeout);
        }),
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      const result = results?.[0];
      if (result?.error) {
        throw new Error(`脚本执行错误：${result.error}`);
      }
      return formatOutput(result?.result);
    } catch (e) {
      console.warn('[script-executor] userScripts.execute failed, falling back:', e.message);
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // ── 降级：chrome.scripting.executeScript({ func }) + new Function ──
  const executePromise = chrome.scripting.executeScript({
    target: { tabId },
    world,
    func: (execCode) => {
      try {
        const trimmed = execCode.replace(/[;\s]+$/, '');
        const result = new Function(`return ${trimmed}`)();
        return { success: true, data: result };
      } catch (e) {
        try {
          const result = new Function(execCode)();
          return { success: true, data: result };
        } catch (e2) {
          return { success: false, error: e2.message };
        }
      }
    },
    args: [code],
  });

  let results;
  try {
    results = await Promise.race([
      executePromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutId = undefined;
          reject(new Error(`脚本执行超时（${effectiveTimeout}ms）`));
        }, effectiveTimeout);
      }),
    ]);
  } catch (e) {
    // chrome.scripting.executeScript 对特殊页面（chrome://、about:、edge:// 等）
    // 或已关闭标签页会抛出 "Cannot access contents of url..." / "No tab with id..."
    throw new Error(`页面注入失败：${e?.message || e || '未知错误'}`);
  }

  if (timeoutId) clearTimeout(timeoutId);

  const injectionResult = results?.[0]?.result;
  if (!injectionResult) {
    // executeScript 返回空结果数组或 result 为 null/undefined：
    // 通常意味着目标页面不支持内容脚本注入（特殊页面 / 已关闭 / 权限不足）
    const lastError = chrome.runtime.lastError?.message;
    throw new Error(
      `页面未返回执行结果（可能是不支持注入的特殊页面）。` +
      (lastError ? ` Chrome: ${lastError}` : '')
    );
  }
  if (!injectionResult.success) {
    throw new Error(`脚本执行错误：${injectionResult.error}`);
  }

  return formatOutput(injectionResult.data);
}
