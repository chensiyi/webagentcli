/**
 * script-executor — 在目标标签页内执行 JS 的统一原语
 *
 * 被 ScriptTool（P2 用户脚本自动注册）与 RunUserScriptTool 共用，
 * 避免两处各自复制 chrome.userScripts.execute / chrome.scripting.executeScript
 * 的执行 + 超时竞态 + Trusted Types 兼容降级逻辑。
 *
 * 设计要点（重要）：
 * - 优先走 chrome.userScripts.execute —— 它由 Chrome 内部 V8 编译注入，
 *   **不受页面 Trusted Types 策略拦截**，因此 YouTube 等严格 TT 站点也能正常执行。
 * - chrome.userScripts.execute（Chrome 135+）**直接回传脚本返回值**：
 *   Promise 解析为 InjectionResult[]，每个元素的 `result` 字段即脚本的完成值
 *   （脚本若返回 Promise 则等待其 settle）。因此直接读 results[0].result 即可，
 *   **无需任何消息通道**。
 * - ⚠️ 注入脚本（harness）内**严禁使用 eval / new Function**：目标页面若带
 *   `script-src 'self'`（无 unsafe-eval）的 CSP，运行时会直接报
 *   "Evaluating a string as JavaScript violates Content Security Policy" 而失败。
 *   故 harness 一律用纯函数包裹 + 编译期 IIFE 拆解来捕获 return 值（见 tryUnwrapIIFE）。
 * - ⚠️ 易混淆点：消息通道（chrome.runtime.onUserScriptMessage）只用于「声明式持久脚本」
 *   userScripts.register（见 gm-api.js 的 GM_* 持久逻辑）—— 那种脚本没有调用方、
 *   无法 return，才必须主动 sendMessage 回传。本原语执行的是一次性的 execute()，
 *   有调用方、本就直接 return 结果，与前者的消息通道是两回事，不要混为一谈。
 */
import { USER_SCRIPT_WORLD, MAIN_WORLD, ISOLATED_WORLD } from './keys.js';

/**
 * 在不使用 eval / new Function 的前提下，把模型可能写的「整体 IIFE 包裹」拆开，
 * 让其中的 return 能被外层函数正常捕获。仅当整段代码正好是一个 IIFE 调用时才拆，
 * 否则原样返回（交给外层函数体处理顶层 return / 普通语句）。
 *
 * 例：(() => { const x = document.body.innerText; return x.length; })();
 *   → { body: '{ const x = document.body.innerText; return x.length; }', isAsync: false }
 * 这样外层 (function () { <body> })() 就能拿到 return 值，而不是被双层 IIFE 吞成 undefined。
 *
 * @returns {{ body: string, isAsync: boolean }}
 */
function tryUnwrapIIFE(code) {
  const s = (code || '').trim();
  if (s.length === 0 || s[0] !== '(') return { body: code, isAsync: false };

  // 判断是否 async IIFE：'(async ...' / '( async ...'
  const isAsync = s.slice(1).trim().startsWith('async ');

  // 找到与首个 '(' 匹配的最外层 ')'
  let depth = 0, inStr = false, strCh = '', esc = false, closeIdx = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { closeIdx = i; break; } }
  }
  if (closeIdx === -1) return { body: code, isAsync: false };

  // 只允许结尾是 IIFE 调用形式：空 / '()' / ';' / '();'，不得是方法链（如 '.foo()'）
  const rest = s.slice(closeIdx + 1).trim();
  if (!/^\(\)?;?$/.test(rest)) return { body: code, isAsync: false };

  let inner = s.slice(1, closeIdx).trim().replace(/;+\s*$/, '');

  // 箭头函数：() => { ... } 或 async () => { ... }
  const arrowIdx = inner.indexOf('=>');
  if (arrowIdx !== -1) {
    return { body: inner.slice(arrowIdx + 2).trim(), isAsync };
  }
  // function 关键字：function name?(...) { ... }
  if (/^function(\s|\()/.test(inner)) {
    const brace = inner.indexOf('{');
    if (brace !== -1) return { body: inner.slice(brace).trim(), isAsync };
  }
  // 其它（如裸表达式 (document.title)）保持原样
  return { body: code, isAsync: false };
}

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

  // harness：执行 code 并捕获其完成值（支持「直接 return」、「裸表达式」以及「整体 IIFE」三种写法）。
  // ⚠️ 全程不使用 eval / new Function —— 注入进目标页面的脚本若含 eval，会被严格 CSP
  // （script-src 'self' 无 unsafe-eval，如多数生产站点）直接拦截，导致「脚本执行错误」。
  // 因此用纯函数包裹 + 编译期 IIFE 拆解（tryUnwrapIIFE）来捕获 return 值，注入脚本内零 eval。
  // 顶层结果统一包成 { __wacResult } 或 { __wacError } 信封。
  const { body, isAsync } = tryUnwrapIIFE(code);
  const harnessHead = `
(function () {
  try {
    var __wacResult = (${isAsync ? 'async ' : ''}function () {
`;
  const harnessTail = `
    })();
    return { __wacResult: __wacResult === undefined ? null : __wacResult };
  } catch (__wacErr) {
    return { __wacError: String((__wacErr && __wacErr.message) || __wacErr) };
  }
})();
`;
  // 用字符串拼接（而非模板插值）拼接 body，避免用户代码里的反引号/${ } 破坏外层模板字面量
  const harnessCode = harnessHead + body + harnessTail;

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
  // 复用同一份 harnessCode（js 形式注入），注入的是整段脚本而非 new Function，
  // 因此同样不触发目标页面 CSP 的 unsafe-eval 限制。
  const fallbackWorld = world === USER_SCRIPT_WORLD ? ISOLATED_WORLD : world;
  let results;
  try {
    results = await withTimeout(chrome.scripting.executeScript({
      target: { tabId },
      world: fallbackWorld,
      js: [{ code: harnessCode }],
    }));
  } catch (e) {
    // chrome.scripting.executeScript 对特殊页面或已关闭标签页会抛出 "Cannot access contents of url..." / "No tab with id..."
    throw new Error(`页面注入失败：${e?.message || e || '未知错误'}`);
  }
  if (timeoutId) clearTimeout(timeoutId);
  return resolveInjection(results);
}
