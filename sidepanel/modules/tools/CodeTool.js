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

Execute JavaScript code in the target web page's MAIN world.

**Format:**
\`\`\`javascript
// your code
return value;
\`\`\`

**Examples:**
\`\`\`javascript
return document.title;
\`\`\`
Returns: Page title

\`\`\`javascript
return document.querySelector('h1').textContent;
\`\`\`
Returns: Heading text

\`\`\`javascript
return JSON.stringify({ links: document.querySelectorAll('a').length });
\`\`\`
Returns: JSON string

**Available APIs:**
Full access to page DOM: document, window, fetch, localStorage, etc.

**Notes:**
- Use 'return' statement to return values
- Code executes in page context (MAIN world)
- Can access all page APIs and DOM elements
- Use JSON.stringify() for complex objects`,
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
      
      // 使用 chrome.scripting.executeScript 在 MAIN world 执行
      // 通过 postMessage + 事件监听器获取结果
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (userCode) => {
          return new Promise((resolve) => {
            try {
              // 创建一个临时的结果容器
              window._codeExecResult = undefined;
              window._codeExecError = undefined;
              
              // 在 MAIN world 中执行代码
              // 使用 eval，但因为是在 chrome.scripting.executeScript 中，
              // 所以不受网页 CSP 限制
              const execCode = `
                (function() {
                  ${userCode}
                })()
              `;
              
              const result = eval(execCode);
              
              resolve({
                success: true,
                result: result,
                type: typeof result
              });
            } catch (error) {
              resolve({
                success: false,
                error: error.message,
                stack: error.stack
              });
            }
          });
        },
        args: [code],
        world: 'MAIN'
      });
      
      if (!result || result.length === 0) {
        throw new Error('脚本执行没有返回结果');
      }
      
      const executionResult = result[0].result;
      
      if (!executionResult.success) {
        return {
          success: false,
          error: executionResult.error,
          stack: executionResult.stack
        };
      }
      
      // 格式化结果
      let output = '';
      if (executionResult.result !== undefined) {
        if (typeof executionResult.result === 'object') {
          output = JSON.stringify(executionResult.result, null, 2);
        } else {
          output = String(executionResult.result);
        }
      }
      
      return {
        success: true,
        result: executionResult.result,
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
