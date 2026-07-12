/**
 * 用户脚本运行工具
 * 在用户当前活动标签页中执行 JS 脚本（Turing-complete）
 *
 * 运行在 Service Worker 中，直接调用 chrome API
 *
 * 优先使用 chrome.userScripts.execute()（Chrome 135+，不受 Trusted Types 限制）
 * 降级为 chrome.scripting.executeScript({ func }) + new Function
 */

import { Tool } from 'kernel/models/Tool.js';
import { USER_SCRIPT_WORLD, MAIN_WORLD, ISOLATED_WORLD } from '../keys.js';

class RunUserScriptTool extends Tool {
  constructor() {
    super({
      name: 'run_user_script',
      description: '在用户当前浏览的页面上执行 JavaScript 代码，可以读取或修改页面内容。\n适用场景：\n- 页面数据提取（标题/文本/表格/图片链接等）\n- 页面操作（点击按钮、填写表单、滚动等）\n- 页面状态检测（判断元素是否存在/可见等）\n⚠️ 返回值规则（务必遵守，否则模型看不到结果）：\n- 必须用 return 把结果回传给模型，例如：return document.title;\n- 多行逻辑请包成 IIFE 并 return：(() => { const x = document.body.innerText; return x.length; })();\n- 仅写一条裸表达式（如 document.body.innerText）也会作为返回值\n- 不写 return 将返回 undefined，模型无法获得任何结果\n注意事项：\n- 代码在目标页面上下文中执行，可访问完整 DOM 与页面全局变量\n- Chrome 限制：只能使用 requestAnimationFrame、setTimeout 之外的定时器\n- 返回值自动格式化：字符串/数字直接返回，对象/数组自动 JSON.stringify',
      danger: true,
      metadata: {
        dangerReason: '将在当前页面执行任意 JavaScript，可能读取/修改页面内容或账户状态，需人工确认',
      },
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要在当前页面执行的 JavaScript 代码。必须写 return 才能把结果回传给模型（见工具说明）；不写 return 模型将拿不到任何结果。'
          },
          world: {
            type: 'string',
            description: 'MAIN 表示在当前标签页面主世界执行，ISOLATED 表示在扩展隔离环境中执行。',
            enum: [MAIN_WORLD, ISOLATED_WORLD],
            default: MAIN_WORLD
          },
          timeout: {
            type: 'number',
            description: '执行超时时间（毫秒）,超过时间未返回结果则强制终止。',
            default: 300000
          }
        },
        required: ['code']
      },
      handler: async (args, context) => {
        const { code, world = MAIN_WORLD, timeout } = args || {};
        if (!code) {
          throw new Error('缺少 code 参数');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error('无法找到当前活动标签页');
        }
        if (world === MAIN_WORLD && !tab.url?.startsWith('http')) {
          throw new Error('当前标签页不支持 MAIN world 执行（仅支持 http/https 页面）');
        }

        const effectiveTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 300000;
        let timeoutId;

        const formatOutput = (data) => {
          if (data === undefined) return 'undefined';
          if (typeof data === 'object') return JSON.stringify(data, null, 2);
          return String(data);
        };

        // ─── 优先：chrome.userScripts.execute()（Chrome 135+）───
        if (typeof chrome.userScripts?.execute === 'function') {
          try {
            const wrappedCode = `(function() { ${code} })()`;
            const executePromise = chrome.userScripts.execute({
              target: { tabId: tab.id },
              js: [{ code: wrappedCode }],
              world: world === ISOLATED_WORLD ? USER_SCRIPT_WORLD : MAIN_WORLD,
              injectImmediately: true
            });

            const results = await Promise.race([
              executePromise,
              new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                  timeoutId = undefined;
                  reject(new Error(`脚本执行超时（${effectiveTimeout}ms）`));
                }, effectiveTimeout);
              })
            ]);

            if (timeoutId) clearTimeout(timeoutId);

            const result = results?.[0];
            if (result?.error) {
              throw new Error(`脚本执行错误：${result.error}`);
            }
            return formatOutput(result?.result);
          } catch (e) {
            console.warn('[RunUserScript] userScripts.execute failed, falling back:', e.message);
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        // ─── 降级：chrome.scripting.executeScript({ func }) ───
        const executePromise = chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: world,
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
          args: [code]
        });

        const results = await Promise.race([
          executePromise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              timeoutId = undefined;
              reject(new Error(`脚本执行超时（${effectiveTimeout}ms）`));
            }, effectiveTimeout);
          })
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        const result = results?.[0]?.result;
        if (!result) {
          return null;
        }
        if (!result.success) {
          throw new Error(`脚本执行错误：${result.error}`);
        }

        return formatOutput(result.data);
      }
    });
  }
}

export { RunUserScriptTool };