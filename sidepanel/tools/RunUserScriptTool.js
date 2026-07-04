/**
 * 用户脚本运行工具
 * 在用户当前活动标签页中执行 JS 脚本（Turing-complete）
 *
 * 迁移自 sidepanel/js/tools/RunUserScriptTool.js
 */

import { Tool } from 'kernel/models/Tool.js';

class RunUserScriptTool extends Tool {
  constructor() {
    super({
      name: 'run_user_script',
      description: '在用户当前浏览的页面上执行 JavaScript 代码，可以读取或修改页面内容。\n适用场景：\n- 页面数据提取（获取文本/表格/图片链接等）\n- 页面操作（点击按钮、填写表单、滚动等）\n- 页面状态检测（判断元素是否存在/可见等）\n注意事项：\n- 代码在目标页面上下文中执行，可访问 DOM\n- 不能使用 requestAnimationFrame、setTimeout 之外的定时器（Chrome 限制）\n- 建议使用 IIFE (() => { ... })() 包裹代码，避免污染全局变量\n- 返回值会被自动格式化：字符串直接返回，对象自动 JSON.stringify',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要在当前页面执行的 JavaScript 代码。return 的值会被作为工具结果返回。'
          },
          world: {
            type: 'string',
            description: 'MAIN 表示在当前标签页面主世界执行，ISOLATED 表示在扩展隔离环境中执行。',
            enum: ['MAIN', 'ISOLATED'],
            default: 'MAIN'
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
        const { code, world = 'MAIN', timeout } = args || {};
        if (!code) {
          throw new Error('缺少 code 参数');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id || world === 'MAIN' && !tab.url?.startsWith('http')) {
          throw new Error('无法找到当前活动标签页或当前标签页不支持 MAIN world 执行（仅支持 http/https 页面）');
        }

        // 超时控制
        const effectiveTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 300000;
        let timeoutId;

        const executePromise = chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: world,
          func: (execCode) => {
            try {
              // 先尝试作为表达式执行（用 return 捕获 IIFE 等的返回值）
              // 去除末尾分号和空白，避免 return (code;) 语法错误
              const trimmed = execCode.replace(/[;\s]+$/, '');
              const result = new Function(`return ${trimmed}`)();
              return { success: true, data: result };
            } catch (e) {
              // 如果表达式化求值失败（例如纯语句块），降级为无 return 执行
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

        // 清除超时计时器（如果脚本正常返回）
        if (timeoutId) clearTimeout(timeoutId);

        const result = results?.[0]?.result;
        if (!result) {
          return null;
        }
        if (!result.success) {
          throw new Error(`脚本执行错误：${result.error}`);
        }

        // 格式化为字符串
        const output = result.data !== undefined
          ? typeof result.data === 'object'
            ? JSON.stringify(result.data, null, 2)
            : String(result.data)
          : 'undefined';

        return output;
      }
    });
  }
}

export { RunUserScriptTool };