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
      description: '在当前活动标签页中执行 JS 脚本。这是一个通用 JavaScript 执行工具，可用于网页操作、数据提取、页面自动化等。',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要在当前页面执行的 JavaScript 代码。注意：1. 代码在目标页面上下文中执行，可访问 DOM；2. executeScript API 的限制：不能使用 requestAnimationFrame、setTimeout 之外的定时器；3. 代码应当做结构良好的匿名函数调用，不推荐声明全局变量。'
          }
        },
        required: ['code']
      },
      handler: async (args, context) => {
        const { code } = args || {};
        if (!code) {
          throw new Error('缺少 code 参数');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          return {
            content: '错误：无法找到当前活动标签页',
            isError: true
          };
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (execCode) => {
            try {
              const result = new Function(execCode)();
              return { success: true, data: result };
            } catch (e) {
              return { success: false, error: e.message };
            }
          },
          args: [code]
        });

        const result = results?.[0]?.result;
        if (!result) {
          return null;
        }
        if (!result.success) {
          return {
            content: `脚本执行错误：${result.error}`,
            isError: true
          };
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