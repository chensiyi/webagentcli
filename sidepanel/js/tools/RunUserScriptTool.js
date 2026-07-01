/**
 * RunUserScriptTool - 运行用户脚本
 * 使用油猴脚本方案：基于 chrome.scripting.executeScript() 在页面中执行脚本代码
 * 相比 chrome.userScripts API 更稳定，支持更好的隔离和控制
 */
import { Log } from '../../../kernel/services/Log.js';
import { IToolService } from '../../../kernel/services/IToolService.js';
import { ToolDefinition } from '../../../kernel/models/ToolDefinition.js';

class RunUserScriptTool extends IToolService {
  constructor() {
    super();
    const definition = new ToolDefinition({
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
      if (!chrome.scripting) throw new Error('chrome.scripting API not available (check permissions)');

      try {
        Log.info('RunUserScriptTool', 'Executing script, tabId:', context.tabId);
        const results = await chrome.scripting.executeScript({
          target: { tabId: context.tabId },
          world: 'MAIN',
          func: (userCode, userArgs) => {
            try {
              // 在 MAIN 世界执行脚本，有完整的 DOM 访问权限
              return new Function('args', userCode)(userArgs);
            } catch (e) {
              return { _error: e.message, _stack: e.stack };
            }
          },
          args: [args.code, args.args || {}]
        });
        
        const result = results[0]?.result;
        if (result && result._error) {
          Log.error('RunUserScriptTool', 'Script execution failed:', result._error);
          throw new Error(`脚本执行失败: ${result._error}`);
        }
        Log.info('RunUserScriptTool', 'Script execution succeeded');
        return result ?? null;
      } catch (error) {
        Log.error('RunUserScriptTool', 'Script execution failed:', error);
        throw error;
      }
    };
    this.register(definition, handler);
  }
}
export { RunUserScriptTool };
