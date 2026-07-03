/**
 * RunUserScriptTool - 运行用户脚本
 * 使用油猴脚本方案：基于 chrome.scripting.executeScript() 在页面中执行脚本代码
 * 相比 chrome.userScripts API 更稳定，支持更好的隔离和控制
 *
 * 目标页面选择：
 * - 不传 pattern：在当前活跃页面执行
 * - 传 pattern：按标题/URL 模糊匹配所有标签页，依次注入执行
 */
import { Log } from '../../../kernel/services/Log.js';
import { IToolService } from '../../../kernel/services/IToolService.js';
import { ToolDefinition } from '../../../kernel/models/ToolDefinition.js';

class RunUserScriptTool extends IToolService {
  constructor() {
    super();
    const definition = new ToolDefinition({
      name: 'run_user_script',
      description: '在浏览器标签页中执行一段 JavaScript（UserScript）代码，并返回执行结果。默认在当前活跃页面执行；可通过 pattern 参数按标题或 URL 模糊匹配目标标签页（支持多个匹配页面依次注入）',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 JavaScript 代码' },
          args: { type: 'object', description: '传递给脚本的参数（可选）' },
          pattern: { type: 'string', description: '目标标签页匹配模式（可选）。按标题或 URL 模糊匹配，不传则使用当前活跃页面。示例: "github.com" 会匹配所有 URL 包含 github.com 的标签页' }
        },
        required: ['code']
      },
      requiresApproval: true
    });
    const handler = async (args, context) => {
      if (!args.code) throw new Error('code is required');
      if (!chrome.scripting) throw new Error('chrome.scripting API not available (check permissions)');

      // 确定目标标签页列表
      let targetTabs = [];
      if (args.pattern) {
        // 按 pattern 模糊匹配标题或 URL
        const allTabs = await chrome.tabs.query({});
        const patternLower = args.pattern.toLowerCase();
        targetTabs = allTabs.filter(tab =>
          tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') &&
          !tab.url.startsWith('edge://') &&
          ((tab.title && tab.title.toLowerCase().includes(patternLower)) ||
           tab.url.toLowerCase().includes(patternLower))
        );
        if (targetTabs.length === 0) {
          throw new Error(`未找到匹配 pattern "${args.pattern}" 的标签页`);
        }
        Log.info('RunUserScriptTool', `Pattern matched ${targetTabs.length} tabs:`, targetTabs.map(t => ({ id: t.id, title: t.title, url: t.url })));
      } else {
        // 默认使用当前活跃标签页
        if (!context.tabId) throw new Error('tabId is required (no active tab available)');
        targetTabs = [{ id: context.tabId }];
      }

      // 依次在目标标签页中执行脚本
      const allResults = [];
      for (const tab of targetTabs) {
        try {
          Log.info('RunUserScriptTool', 'Executing script, tabId:', tab.id, tab.title || '');
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
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
            Log.error('RunUserScriptTool', `Script execution failed on tab ${tab.id}:`, result._error);
            allResults.push({ tabId: tab.id, tabTitle: tab.title, tabUrl: tab.url, error: result._error });
          } else {
            allResults.push({ tabId: tab.id, tabTitle: tab.title, tabUrl: tab.url, result: result ?? null });
          }
        } catch (tabError) {
          Log.error('RunUserScriptTool', `Script execution failed on tab ${tab.id}:`, tabError);
          allResults.push({ tabId: tab.id, tabTitle: tab.title, tabUrl: tab.url, error: tabError.message || String(tabError) });
        }
      }

      // 单标签页时直接返回结果（兼容旧行为）
      if (allResults.length === 1) {
        const single = allResults[0];
        if (single.error) throw new Error(`脚本执行失败: ${single.error}`);
        Log.info('RunUserScriptTool', 'Script execution succeeded');
        return single.result ?? null;
      }

      // 多标签页时返回汇总
      const hasError = allResults.some(r => r.error);
      Log.info('RunUserScriptTool', `Script execution completed on ${allResults.length} tabs, hasError: ${hasError}`);
      return {
        _multiTab: true,
        total: allResults.length,
        results: allResults
      };
    };
    this.register(definition, handler);
  }
}
export { RunUserScriptTool };
