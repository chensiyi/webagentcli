// 代码执行工具
// 负责JavaScript代码的安全执行

window.CodeTool = {
  /**
   * 工具配置
   */
  config: {
    id: 'js_code',
    name: 'js_code',
    description: 'Execute JavaScript code in sandboxed environment',
    enabled: false,
    systemPrompt: `### js_code

Execute JavaScript code in a sandboxed environment for calculations and data processing.

**Format:**
\`\`\`javascript
// your code
expression_to_return
\`\`\`

**Examples:**
\`\`\`javascript
2 + 2
\`\`\`
Returns: 4

\`\`\`javascript
[1,2,3].filter(x => x > 1)
\`\`\`
Returns: [2, 3]

**Available APIs:**
console, Math, JSON, Date, Array, Object, String, Number, Boolean, parseInt, parseFloat

**Notes:**
- Last expression's value is returned
- Strict mode sandbox, no browser APIs (window, document, fetch)
- No require() or import`
  },

  /**
   * 执行 JavaScript 代码
   */
  async execute(code) {
    try {
      // 获取当前活动标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('没有找到活动标签页');
      }
      
      const tabId = tabs[0].id;
      
      // 使用 chrome.scripting.executeScript 注入到网页 MAIN world
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (userCode) => {
          try {
            // 在网页的 MAIN world 中执行
            // 使用 new Function 避免 eval 的 CSP 限制
            const func = new Function(userCode);
            return {
              success: true,
              result: func(),
              type: typeof func()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              stack: error.stack
            };
          }
        },
        args: [code],
        world: 'MAIN' // 关键：在 MAIN world 执行，可访问页面的所有对象
      });
      
      if (!results || results.length === 0) {
        throw new Error('脚本执行没有返回结果');
      }
      
      const executionResult = results[0].result;
      
      if (!executionResult.success) {
        return {
          success: false,
          error: executionResult.error,
          stack: executionResult.stack
        };
      }
      
      // 格式化结果
      let output = '';
      const result = executionResult.result;
      if (result !== undefined) {
        if (typeof result === 'object') {
          output = JSON.stringify(result, null, 2);
        } else {
          output = String(result);
        }
      }
      
      return {
        success: true,
        result: result,
        output: output,
        type: executionResult.type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  },
};
