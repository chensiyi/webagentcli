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

在网页MAIN world中执行JavaScript代码。

**用法：**
\`\`\`javascript
// 你的代码
return value;
\`\`\`

**示例：**
\`\`\`javascript
return document.title;
\`\`\`

**提示：**
- 必须使用 return 返回值
- 可访问完整DOM（document、window等）
- 复杂对象用 JSON.stringify() 转换`
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
