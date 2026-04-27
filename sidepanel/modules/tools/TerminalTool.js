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

在指定网页中执行JavaScript操作DOM、表单等。

**用法：**
\`\`\`terminal
JavaScript代码
\`\`\`

**目标选择（第一行注释）：**
- 默认：当前活动标签页
- \`// @tab:URL\` - 精确匹配URL
- \`// @tab:关键词\` - 按URL或标题搜索

**重要：**
- 必须用 return 返回值
- \`// @tab:\` 是注释，不执行

**示例：**
\`\`\`terminal
return document.title;
\`\`\`

\`\`\`terminal
// @tab:baidu
return document.querySelector('h1')?.textContent;
\`\`\`

**提示：**
- 完全DOM访问权限
- 使用标准浏览器API
- 找不到目标时会列出可用标签页`
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
