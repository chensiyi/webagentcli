/**
 * 用户脚本运行工具
 * 在用户当前活动标签页中执行 JS 脚本（Turing-complete）
 *
 * 迁移自 sidepanel/js/tools/RunUserScriptTool.js
 */

import { IToolService } from 'kernel/services/IToolService.js';

class RunUserScriptTool extends IToolService {
  constructor() {
    super();
    this._enabled = true;
    this.definition = {
      name: 'run_user_script',
      description: '在当前活动标签页中执行 JS 脚本。这是一个通用 JavaScript 执行工具，可用于网页操作、数据提取、页面自动化等。',
      input_schema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要在当前页面执行的 JavaScript 代码。注意：1. 代码在目标页面上下文中执行，可访问 DOM；2. executeScript API 的限制：不能使用 requestAnimationFrame、setTimeout 之外的定时器；3. 代码应当做结构良好的匿名函数调用，不推荐声明全局变量。'
          }
        },
        required: ['code']
      }
    };
  }

  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = v; }

  enable() { this._enabled = true; }
  disable() { this._enabled = false; }

  async canHandle(toolCall) {
    return toolCall?.name === 'run_user_script';
  }

  async execute(toolCall, context) {
    const { code } = toolCall.input || {};
    if (!code) {
      return {
        content: '错误：缺少 code 参数',
        isError: true
      };
    }

    try {
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
        return {
          content: '错误：脚本执行未返回结果',
          isError: true
        };
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

      return {
        content: output
      };
    } catch (error) {
      return {
        content: `脚本执行失败：${error.message}`,
        isError: true
      };
    }
  }
}

export { RunUserScriptTool };