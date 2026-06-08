/**
 * RunUserScriptTool - 运行用户脚本
 * 利用 chrome.userScripts API 在页面中执行用户编写的脚本代码
 * 权限要求：manifest.json 中已配置 "userScripts"
 */
class RunUserScriptTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
      name: 'run_user_script',
      description: '在页面中执行一段用户脚本代码，并返回执行结果',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 JavaScript 代码' },
          args: { type: 'object', description: '传递给脚本的参数（可选）' }
        },
        required: ['code']
      },
      requiresApproval: true
    });
    const handler = async (args, context) => {
      if (!args.code) throw new Error('code is required');
      if (!context.tabId) throw new Error('tabId is required');
      if (!chrome.userScripts) throw new Error('chrome.userScripts API not available (check permissions)');

      const results = await chrome.userScripts.execute({
        target: { tabId: context.tabId },
        func: (userCode, userArgs) => {
          try {
            return new Function('args', userCode)(userArgs);
          } catch (e) {
            return { _error: e.message };
          }
        },
        args: [args.code, args.args || {}]
      });
      const result = results[0]?.result;
      if (result && result._error) throw new Error(result._error);
      return result ?? null;
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.RunUserScriptTool = RunUserScriptTool;