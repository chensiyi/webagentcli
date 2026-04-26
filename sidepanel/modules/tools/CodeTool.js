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
      
      // 使用 TerminalManager 执行代码
      const result = await window.TerminalManager.execute(tabId, code);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          stack: result.stack
        };
      }
      
      // 格式化输出
      let output = '';
      if (result.data !== undefined) {
        if (typeof result.data === 'object') {
          output = JSON.stringify(result.data, null, 2);
        } else {
          output = String(result.data);
        }
      }
      
      return {
        success: true,
        output: output,
        type: result.type
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
