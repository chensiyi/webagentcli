/**
 * GetPageContentTool - 获取当前页面内容
 * 通过 chrome.scripting.executeScript 注入脚本读取 DOM
 */
class GetPageContentTool extends window.IToolService {
  constructor() {
    super();

    const definition = new window.ToolDefinition({
      name: 'get_page_content',
      description: '获取当前页面的文本内容或选中区域的 HTML',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS 选择器（可选，默认获取 body.innerText）'
          }
        }
      },
      requiresApproval: false
    });

    const handler = async (args, context) => {
      if (!context.tabId) throw new Error('tabId is required');

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (selector) => {
          if (selector) {
            const el = document.querySelector(selector);
            return el ? el.innerText : `Element not found: ${selector}`;
          }
          return document.body.innerText;
        },
        args: [args.selector || null]
      });

      return result.result;
    };

    this.register(definition, handler);
  }
}

if (typeof window !== 'undefined') {
  window.GetPageContentTool = GetPageContentTool;
}