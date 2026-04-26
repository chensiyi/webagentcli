// Terminal 工具 - AI操作网页的接口
// 提供类似终端的命令执行能力

window.TerminalTool = {
  /**
   * 工具配置
   */
  config: {
    id: 'terminal',
    name: 'terminal',
    description: 'Execute JavaScript code in web pages to interact with DOM, forms, and page content',
    enabled: false,  // 默认关闭
    systemPrompt: `### terminal

Execute JavaScript code in web pages to interact with DOM, forms, and page content.

**Format:**
\`\`\`terminal
JavaScript code here
\`\`\`

**Target Tab Selection (include in code as first line):**
- Default: executes on current active tab
- To specify target, add as first line: \`// @tab:TARGET\`
  - \`// @tab:https://example.com\` - exact URL match
  - \`// @tab:keyword\` - search by URL or title keyword from available tabs

**IMPORTANT:**
- ALWAYS use 'return' to return values
- Example: \`return document.title;\` NOT \`document.title\`
- Return value will be shown as execution result
- The \`// @tab:\` line is a comment, NOT executed as code

**Examples:**

1. **Get page title (current tab):**
\`\`\`terminal
return document.title;
\`\`\`

2. **Execute on specific URL:**
\`\`\`terminal
// @tab:https://www.google.com
return document.title;
\`\`\`

3. **Search by keyword:**
\`\`\`terminal
// @tab:baidu
return document.title;
\`\`\`

4. **Get element text:**
\`\`\`terminal
return document.querySelector('h1')?.textContent;
\`\`\`

5. **Click button:**
\`\`\`terminal
document.querySelector('#submit').click();
return 'clicked';
\`\`\`

6. **Fill form:**
\`\`\`terminal
document.querySelector('#username').value = 'john';
return 'filled';
\`\`\`

7. **Extract multiple items:**
\`\`\`terminal
return Array.from(document.querySelectorAll('a')).map(a => a.textContent).slice(0, 10);
\`\`\`

8. **Get page info:**
\`\`\`terminal
return { title: document.title, url: location.href };
\`\`\`

**Notes:**
- Code executes in MAIN world with full DOM access
- Use standard browser APIs (document, window, fetch, etc.)
- For multi-line code, ensure final statement has 'return'
- If target not found, error will include available tabs list
- Errors will be returned with stack traces`,
  },

  /**
   * 执行终端命令
   * @param {string} code - JavaScript代码（可能包含 @tab: 指令）
   */
  async execute(code) {
    try {
      console.log(`[TerminalTool] Executing code (${code.length} chars)`);
  
      // 解析代码，提取目标标签页指令
      const { targetQuery, actualCode } = this.parseTarget(code);
      
      let tabResult;
      
      // 根据目标查询获取标签页
      if (!targetQuery || targetQuery === 'current') {
        // 默认使用当前活动标签页
        tabResult = await window.TerminalManager.getActiveTab();
      } else {
        // 根据 URL 或关键字查找标签页
        console.log(`[TerminalTool] Finding tab: ${targetQuery}`);
        tabResult = await window.TerminalManager.findTabByQuery(targetQuery);
      }
        
      if (!tabResult.success) {
        let errorMsg = `Cannot get target tab: ${tabResult.error}`;
        
        // 如果有可用标签页列表，附加到错误信息
        if (tabResult.availableTabs) {
          errorMsg += '\n\nAvailable tabs:';
          tabResult.availableTabs.forEach(tab => {
            errorMsg += `\n- [${tab.id}] ${tab.title || 'Untitled'} (${tab.url})`;
          });
        }
        
        return {
          success: false,
          error: tabResult.error,
          output: errorMsg
        };
      }
  
      const tabId = tabResult.data.id;
      console.log(`[TerminalTool] Target tab: ${tabId} - ${tabResult.data.url}`);
  
      // 执行代码
      const result = await window.TerminalManager.execute(tabId, actualCode);
  
      if (result.success) {
        console.log(`[TerminalTool] Execution successful, type: ${result.type}`);
          
        // 格式化输出
        const output = this.formatOutput(result.data, result.type);
          
        return {
          success: true,
          data: result.data,
          type: result.type,
          tabId: tabId,
          tabUrl: tabResult.data.url,
          tabTitle: tabResult.data.title,
          output: output
        };
      } else {
        console.error('[TerminalTool] Execution failed:', result.error);
          
        // 检查是否是 TrustedScript 错误
        if (result.error && result.error.includes('TrustedScript')) {
          return {
            success: false,
            error: result.error,
            output: `TrustedScript 错误：此页面启用了 Trusted Types 安全策略

解决方法：开启 Tampermonkey 的“允许用户脚本”权限

操作步骤：
1. 右键点击 Tampermonkey 图标
2. 选择“管理扩展程序”
3. 找到并启用“允许用户脚本”开关

或启用开发者模式：
1. 地址栏输入：chrome://extensions
2. 右上角开启“开发者模式”

详细说明：https://www.tampermonkey.net/faq.php#Q209

或者尝试更简单的代码，例如：return document.title;`
          };
        }
          
        return {
          success: false,
          error: result.error,
          stack: result.stack,
          output: `Error: ${result.error}${result.stack ? '\n' + result.stack.split('\n')[0] : ''}`
        };
      }
    } catch (error) {
      console.error('[TerminalTool] Terminal error:', error);
      return {
        success: false,
        error: error.message,
        output: `Error: ${error.message}`
      };
    }
  },

  /**
   * 解析代码中的目标标签页指令
   * @param {string} code - 原始代码
   * @returns {Object} { targetQuery, actualCode }
   */
  parseTarget(code) {
    const lines = code.split('\n');
    const firstLine = lines[0].trim();
    
    // 检查第一行是否是 // @tab: 指令（注释格式）
    const tabMatch = firstLine.match(/^\/\/\s*@tab:(.+)$/);
    
    // 也支持旧的 @tab: 格式（不带 // ）
    const oldTabMatch = firstLine.match(/^@tab:(.+)$/);
    
    if (tabMatch) {
      // 提取目标查询，返回剩余代码
      return {
        targetQuery: tabMatch[1].trim(),
        actualCode: lines.slice(1).join('\n').trim()
      };
    }
    
    if (oldTabMatch) {
      // 兼容旧格式
      return {
        targetQuery: oldTabMatch[1].trim(),
        actualCode: lines.slice(1).join('\n').trim()
      };
    }
    
    // 没有指令，默认使用当前标签页
    return {
      targetQuery: 'current',
      actualCode: code
    };
  },

  /**
   * 格式化输出结果
   */
  formatOutput(data, type) {
    if (data === null) {
      return 'null';
    }
      
    if (data === undefined) {
      return 'undefined (no return value)';
    }
  
    if (type === 'string') {
      if (data === '') {
        return '(empty string)';
      }
      return data;
    }
      
    if (type === 'number' || type === 'boolean') {
      return String(data);
    }
  
    if (type === 'object') {
      try {
        // 如果是数组且长度较大，只显示前几个
        if (Array.isArray(data)) {
          if (data.length > 10) {
            return `Array(${data.length} items):\n${JSON.stringify(data.slice(0, 10), null, 2)}\n... and ${data.length - 10} more`;
          }
          return JSON.stringify(data, null, 2);
        }
          
        // 对象直接JSON格式化
        return JSON.stringify(data, null, 2);
      } catch (e) {
        return String(data);
      }
    }
  
    if (type === 'function') {
      return '[Function]';
    }
      
    if (type === 'symbol') {
      return data.toString();
    }
  
    return String(data);
  }
};
