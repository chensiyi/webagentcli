/**
 * script-executor — 在目标标签页内执行 JS 的统一原语
 *
 * 被 ScriptTool（P2 用户脚本自动注册）与 RunUserScriptTool 共用，
 * 避免两处各自复制 chrome.userScripts.execute / chrome.scripting.executeScript
 * 的执行 + 超时竞态 + Trusted Types 兼容降级逻辑。
 *
 * 设计要点（重要）：
 * - 优先走 chrome.userScripts.execute —— 它由 Chrome 内部 V8 编译注入，
 *   **不受页面 Trusted Types 策略拦截**，因此 YouTube 等严格 TT 站点也能正常执行
 *   （而 chrome.scripting.executeScript 内部依赖 new Function，会被这类站点挡掉）。
 * - chrome.userScripts.execute（Chrome 135+）**直接回传脚本返回值**：
 *   Promise 解析为 InjectionResult[]，每个元素的 `result` 字段即脚本的完成值
 *   （脚本若返回 Promise 则等待其 settle）。因此直接读 results[0].result 即可，
 *   **无需任何消息通道**。
 * - ⚠️ 易混淆点：消息通道（chrome.runtime.onUserScriptMessage）只用于「声明式持久脚本」
 *   userScripts.register（见 gm-api.js 的 GM_* 持久逻辑）—— 那种脚本没有调用方、
 *   无法 return，才必须主动 sendMessage 回传。本原语执行的是一次性的 execute()，
 *   有调用方、本就直接 return 结果，与前者的消息通道是两回事，不要混为一谈。
 */
import { USER_SCRIPT_WORLD, MAIN_WORLD, ISOLATED_WORLD } from './keys.js';

/**
 * 在标签页内执行 JS 并返回格式化结果字符串。
 * @param tabId   目标标签页 id（必填）
 * @param code     待执行 JS（会被 harness 包裹以捕获 return 值）
 * @param world   目标世界：MAIN / ISOLATED / USER_SCRIPT（仅影响降级路径；userScripts 路径统一注入 USER_SCRIPT 世界）
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

  // harness：执行 code 并捕获其完成值（支持「裸 return」与「裸表达式」两种写法，
  // 失败回退 new Function）。顶层返回值（被 userScripts.execute / scripting.executeScript
  // 捕获为 results[0].result）统一包成 { __wacResult } 或 { __wacError } 信封。
  // 约定：传入的 code 自身必须含顶层 return（如 `return x;` 或 `(function(){...})()` 外层
  // 由调用方包成 return）—— 本 harness 仅做 (function(){ code })() 包裹并取函数返回值。
  // 注：run_user_script 的 code 是模型写的 `return X;`，ScriptTool 的 finalCode 也是
  // 已带顶层 return 的语句块，故两者都兼容此包裹方式。
  const harnessCode = `
(function () {
  try {
    var __wacResult = (function () { ${code} })();
    return { __wacResult: __wacResult === undefined ? null : __wacResult };
  } catch (__wacErr) {
    try {
      var __wacResult2 = new Function('return (' + ${JSON.stringify(code)} + ');')();
      return { __wacResult: __wacResult2 === undefined ? null : __wacResult2 };
    } catch (__wacErr2) {
      return { __wacError: String((__wacErr && __wacErr.message) || __wacErr) };
    }
  }
})();
`;

  // 把 InjectionResult 解析成格式化输出（两条路径共用）
  const resolveInjection = (results) => {
    const r = results?.[0];
    if (!r) {
      const lastError = chrome.runtime?.lastError?.message;
      throw new Error(
        `页面未返回执行结果（可能是不支持注入的特殊页面）。` +
        (lastError ? ` Chrome: ${lastError}` : '')
      );
    }
    if (r.error) throw new Error(`脚本执行错误：${r.error}`);
    const data = r.result;
    if (!data || data.__wacError) {
      throw new Error(`脚本执行错误：${data?.__wacError || '未知错误'}`);
    }
    return formatOutput(data.__wacResult);
  };

  // 带超时的执行辅助
  const withTimeout = (p) => Promise.race([
    p,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        reject(new Error(`脚本执行超时（${effectiveTimeout}ms）`));
      }, effectiveTimeout);
    }),
  ]);

  // ── 优先：chrome.userScripts.execute（不受页面 Trusted Types 限制，YouTube 等可正常执行；直接回传 result）──
  if (typeof chrome.userScripts?.execute === 'function') {
    let results;
    try {
      results = await withTimeout(chrome.userScripts.execute({
        target: { tabId },
        js: [{ code: harnessCode }],
        injectImmediately: true,
      }));
    } catch (e) {
      // userScripts.execute 对特殊页面（chrome://、about:、edge:// 等）或已关闭标签页会抛错
      throw new Error(`页面注入失败：${e?.message || e || '未知错误'}`);
    }
    if (timeoutId) clearTimeout(timeoutId);
    return resolveInjection(results);
  }

  // ── 降级：chrome.scripting.executeScript（老 Chrome / 未开用户脚本权限）──
  // 注意：此路径使用 new Function，可能被严格 TT 站点（如 YouTube）拦截，故仅作兜底。
  const fallbackWorld = world === USER_SCRIPT_WORLD ? ISOLATED_WORLD : world;
  let results;
  try {
    results = await withTimeout(chrome.scripting.executeScript({
      target: { tabId },
      world: fallbackWorld,
      func: (execCode) => {
        try {
          const trimmed = execCode.replace(/[;\s]+$/, '');
          let v;
          try { v = new Function(`return ${trimmed}`)(); }
          catch (e1) { v = new Function(execCode)(); }
          return { __wacResult: v === undefined ? null : v };
        } catch (e) {
          return { __wacError: e.message };
        }
      },
      args: [code],
    }));
  } catch (e) {
    // chrome.scripting.executeScript 对特殊页面或已关闭标签页会抛出 "Cannot access contents of url..." / "No tab with id..."
    throw new Error(`页面注入失败：${e?.message || e || '未知错误'}`);
  }
  if (timeoutId) clearTimeout(timeoutId);
  return resolveInjection(results);
}
