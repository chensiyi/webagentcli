// 工具基础管理器
// 负责工具的注册、解析、执行调度

(function() {
  'use strict';

  /**
   * 工具管理器
   */
  class ToolManager {
    constructor() {
      this.tools = new Map();
      this.loadSettings();
      
      // 注册内置工具
      this.registerTool(window.SearchTool.config);
      this.registerTool(window.CodeTool.config);
      this.registerTool(window.FetchTool.config);
      this.registerTool(window.TerminalTool.config);
    }

    /**
     * 从 storage 加载设置
     */
    async loadSettings() {
      try {
        const result = await chrome.storage.local.get(['builtinTools', 'builtinToolsTimestamp']);
        
        // 检查缓存是否过期（1小时）
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const hasValidCache = result.builtinToolsTimestamp && 
                              (now - result.builtinToolsTimestamp < oneHour);
        
        if (result.builtinTools && hasValidCache) {
          // 缓存有效，应用设置
          // 先重置所有工具为关闭
          this.tools.forEach((tool) => {
            tool.enabled = false;
          });
          
          // 只启用缓存中记录的工具
          Object.keys(result.builtinTools).forEach(id => {
            if (this.tools.has(id)) {
              this.tools.get(id).enabled = true;
            }
          });
          
          console.log('[ToolManager] Settings loaded from cache, enabled tools:', 
                     Object.keys(result.builtinTools));
        } else {
          // 缓存过期或不存在，重置为默认值（所有关闭）
          this.tools.forEach((tool) => {
            tool.enabled = false;
          });
          console.log('[ToolManager] Cache expired or not found, reset to defaults (all disabled)');
          
          // 保存默认设置（空对象）
          await this.saveSettings();
        }
      } catch (error) {
        console.warn('[ToolManager] Failed to load settings:', error);
      }
    }

    /**
     * 保存设置到 storage
     */
    async saveSettings() {
      try {
        // 只保存启用的工具
        const enabledTools = {};
        this.tools.forEach((tool, id) => {
          if (tool.enabled) {
            enabledTools[id] = true;
          }
        });
        
        // 保存设置并更新时间戳（刷新缓存有效期）
        await chrome.storage.local.set({ 
          builtinTools: enabledTools,
          builtinToolsTimestamp: Date.now()
        });
        
        console.log('[ToolManager] Settings saved, enabled tools:', Object.keys(enabledTools));
      } catch (error) {
        console.warn('[ToolManager] Failed to save settings:', error);
      }
    }

    /**
     * 刷新缓存时间戳（在发送消息时调用）
     */
    async refreshCacheTimestamp() {
      try {
        const result = await chrome.storage.local.get(['builtinTools']);
        if (result.builtinTools) {
          // 只更新时间戳，不改变工具状态
          await chrome.storage.local.set({ 
            builtinToolsTimestamp: Date.now()
          });
          console.log('[ToolManager] Cache timestamp refreshed');
        }
      } catch (error) {
        console.warn('[ToolManager] Failed to refresh cache timestamp:', error);
      }
    }

    /**
     * 注册工具
     */
    registerTool(tool) {
      this.tools.set(tool.id, { ...tool });
    }

    /**
     * 获取工具
     */
    getTool(id) {
      return this.tools.get(id);
    }

    /**
     * 获取所有工具
     */
    getAllTools() {
      return Array.from(this.tools.values());
    }

    /**
     * 切换工具开关
     */
    async toggleTool(id, enabled) {
      const tool = this.tools.get(id);
      if (tool) {
        tool.enabled = enabled;
        await this.saveSettings();
        return true;
      }
      return false;
    }

    /**
     * 检查工具是否启用
     */
    isToolEnabled(id) {
      return this.tools.get(id)?.enabled ?? false;
    }

    /**
     * 获取所有启用的工具
     */
    getEnabledTools() {
      const enabled = [];
      this.tools.forEach((tool, id) => {
        if (tool.enabled) {
          enabled.push({ id, ...tool });
        }
      });
      return enabled;
    }

    /**
     * 生成系统提示
     */
    generateSystemPrompt() {
      const enabledTools = [];
      
      this.tools.forEach((tool) => {
        if (tool.enabled) {
          enabledTools.push(tool.systemPrompt);
        }
      });
      
      if (enabledTools.length === 0) {
        return null;
      }
      
      // 通用的工具使用说明
      const generalInstructions = `## Available Tools

You have access to these tools. To use any tool, output a code block in the specified format.

**Usage Pattern:**
\`\`\`<tool_name>
<parameters>
\`\`\`

The system will execute the tool and return results in the next message.

---

`;
      
      return generalInstructions + enabledTools.join('\n\n---\n\n');
    }

    /**
     * 解析消息中的工具调用
     */
    parseToolCalls(content) {
      const calls = [];
      let callIndex = 0;
        
      // 解析搜索调用
      const searchRegex = /```web_search\n([\s\S]*?)\n```/g;
      let match;
      while ((match = searchRegex.exec(content)) !== null) {
        const callId = `call_${callIndex++}`;
        calls.push({
          id: callId,
          type: 'function',
          function: {
            name: 'web_search',
            arguments: JSON.stringify({ query: match[1].trim() })
          },
          // 兼容旧代码
          query: match[1].trim()
        });
      }
        
      // 解析 Terminal 调用
      const terminalRegex = /```terminal\n([\s\S]*?)\n```/g;
      while ((match = terminalRegex.exec(content)) !== null) {
        const callId = `call_${callIndex++}`;
        calls.push({
          id: callId,
          type: 'function',
          function: {
            name: 'terminal',
            arguments: JSON.stringify({ code: match[1].trim() })
          },
          // 兼容旧代码
          code: match[1].trim()
        });
      }
        
      // 解析 JavaScript 代码
      const jsRegex = /```javascript\n([\s\S]*?)\n```/g;
      while ((match = jsRegex.exec(content)) !== null) {
        const callId = `call_${callIndex++}`;
        calls.push({
          id: callId,
          type: 'function',
          function: {
            name: 'js_code',
            arguments: JSON.stringify({ code: match[1].trim() })
          },
          // 兼容旧代码
          code: match[1].trim()
        });
      }
      
      // 解析网页访问调用
      const webfetchRegex = /```web_fetch\n([\s\S]*?)\n```/g;
      while ((match = webfetchRegex.exec(content)) !== null) {
        const callId = `call_${callIndex++}`;
        calls.push({
          id: callId,
          type: 'function',
          function: {
            name: 'web_fetch',
            arguments: JSON.stringify({ url: match[1].trim() })
          },
          // 兼容旧代码
          url: match[1].trim()
        });
      }
      
      return calls;
    }

    /**
     * 从消息内容中移除工具调用代码块
     */
    removeToolCallBlocks(content) {
      if (!content) return '';
      
      // 移除搜索调用代码块
      let cleaned = content.replace(/```web_search\n[\s\S]*?\n```/g, '');
      
      // 移除 JavaScript 代码块
      cleaned = cleaned.replace(/```javascript\n[\s\S]*?\n```/g, '');
      
      // 移除网页访问代码块
      cleaned = cleaned.replace(/```web_fetch\n[\s\S]*?\n```/g, '');
      
      // 清理多余的空行（最多保留一个空行）
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      
      return cleaned.trim();
    }

    /**
     * 执行工具调用
     */
    async executeTool(call) {
      // 兼容新旧格式：新格式使用 call.function.name，旧格式使用 call.type
      const toolType = call.function?.name || call.type;
      
      switch (toolType) {
        case 'web_search':
          // 兼容新旧格式：新格式参数在 function.arguments 中
          const searchArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          const query = searchArgs.query || call.query;
          return await window.SearchTool.execute(query);
        
        case 'js_code':
          const codeArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          const code = codeArgs.code || call.code;
          return await window.CodeTool.execute(code);
        
        case 'web_fetch':
          const fetchArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          const url = fetchArgs.url || call.url;
          return await window.FetchTool.execute(url);
        
        case 'terminal':
          const terminalArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          const terminalCode = terminalArgs.code || call.code;
          return await window.TerminalTool.execute(terminalCode);
        
        default:
          throw new Error(`Unknown tool type: ${toolType}`);
      }
    }
  }

  // 创建全局实例
  window.ToolManager = new ToolManager();
  
  console.log('[ToolManager] Initialized with tools:', 
    Array.from(window.ToolManager.tools.keys()));

})();
