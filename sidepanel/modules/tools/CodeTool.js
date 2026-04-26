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
      const requestId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 注册用户脚本（动态注册，包含用户代码）
      await chrome.userScripts.register([{
        id: `webagentcli-temp-${requestId}`,
        matches: ['<all_urls>'],
        js: [{ code: this.buildUserScriptCode(code, requestId) }],
        world: 'MAIN',
        runAt: 'document_idle'
      }]);
      
      console.log('[CodeTool] 用户脚本已注册:', requestId);
      
      // 等待执行结果（最多 10 秒）
      const result = await this.waitForResult(requestId, 10000);
      
      // 清理临时用户脚本
      try {
        await chrome.userScripts.unregister({ ids: [`webagentcli-temp-${requestId}`] });
        console.log('[CodeTool] 临时用户脚本已清理');
      } catch (err) {
        console.warn('[CodeTool] 清理用户脚本失败:', err.message);
      }
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          stack: result.stack
        };
      }
      
      // 格式化结果
      let output = '';
      if (result.result !== undefined) {
        if (typeof result.result === 'object') {
          output = JSON.stringify(result.result, null, 2);
        } else {
          output = String(result.result);
        }
      }
      
      return {
        success: true,
        result: result.result,
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
  
  /**
   * 构建用户脚本代码
   */
  buildUserScriptCode(code, requestId) {
    return `
      (function() {
        try {
          // 在 MAIN world 中执行用户代码
          const result = (${code});
          
          // 通过 chrome.runtime.sendMessage 发送结果到扩展
          chrome.runtime.sendMessage({
            source: 'webagentcli-code-executor',
            requestId: '${requestId}',
            success: true,
            result: result,
            type: typeof result
          });
        } catch (error) {
          chrome.runtime.sendMessage({
            source: 'webagentcli-code-executor',
            requestId: '${requestId}',
            success: false,
            error: error.message,
            stack: error.stack
          });
        }
      })();
    `;
  },
  
  /**
   * 等待执行结果
   */
  waitForResult(requestId, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error('代码执行超时'));
      }, timeout);
      
      const listener = (message, sender, sendResponse) => {
        if (message.source === 'webagentcli-code-executor' && 
            message.requestId === requestId) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(listener);
          resolve(message);
          return true;
        }
      };
      
      chrome.runtime.onMessage.addListener(listener);
    });
  },
};
