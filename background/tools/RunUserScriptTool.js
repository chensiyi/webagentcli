/**
 * 用户脚本运行工具
 * 在用户当前活动标签页中执行 JS 脚本（Turing-complete）
 *
 * 运行在 Service Worker 中，直接调用 chrome API
 *
 * 执行统一走 script-executor.executeInPage：
 * - 优先 chrome.userScripts.execute（不受 Trusted Types 限制，YouTube 等可正常执行）
 * - 结果经消息通道回传
 * - 降级 chrome.scripting.executeScript
 */

import { Tool } from 'kernel/models/Tool.js';
import { MAIN_WORLD, ISOLATED_WORLD } from '../keys.js';
import { executeInPage } from '../script-executor.js';

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

        // 目标标签页：优先用调用方传入的 tabId（来自当前活动会话），否则回退查活动标签
        let tabId = (context && context.tabId != null) ? Number(context.tabId) : null;
        if (tabId == null) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || tab.id == null) throw new Error('无法找到当前活动标签页');
          tabId = tab.id;
        }
        if (typeof tabId !== 'number') throw new Error('目标标签页 id 无效');

        // MAIN 世界仅支持 http/https 页面（特殊页面无法注入内容）
        if (world === MAIN_WORLD) {
          const info = await chrome.tabs.get(tabId).catch(() => null);
          if (info?.url && !info.url.startsWith('http')) {
            throw new Error('当前标签页不支持 MAIN world 执行（仅支持 http/https 页面）');
          }
        }

        // 统一执行原语：优先 userScripts.execute（绕 Trusted Types），结果经消息通道回传
        return await executeInPage({ tabId, code, world, timeout });
      }
    });
  }
}

export { RunUserScriptTool };
