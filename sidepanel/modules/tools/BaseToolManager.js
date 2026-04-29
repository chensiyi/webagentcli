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
      
      // 注册内置工具
      this.registerTool(window.SearchTool.config);
      this.registerTool(window.CodeTool.config);
      this.registerTool(window.FetchTool.config);
      this.registerTool(window.TerminalTool.config);
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
      // 从当前会话获取启用的工具列表
      let sessionEnabledTools = {};
      if (window.SessionManager && window.SessionManager.getSessionEnabledTools) {
        sessionEnabledTools = window.SessionManager.getSessionEnabledTools();
        console.log('[ToolManager] Current session enabled tools:', sessionEnabledTools);
      }
      
      const tools = [];
      this.tools.forEach((tool, id) => {
        const enabled = !!sessionEnabledTools[id];
        tools.push({
          ...tool,
          enabled: enabled // 动态计算启用状态
        });
        console.log(`[ToolManager] Tool ${id}: enabled=${enabled}`);
      });
      return tools;
    }

    /**
     * 生成 OpenAI 标准格式的工具定义
     */
    getOpenAIToolsDefinition() {
      const enabledTools = this.getEnabledTools();
      
      if (enabledTools.length === 0) {
        return null;
      }

      return enabledTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name || tool.id,
          description: tool.description || '',
          parameters: this.buildToolParameters(tool)
        }
      }));
    }

    /**
     * 构建工具的参数 Schema
     */
    buildToolParameters(tool) {
      // 根据工具类型构建不同的参数 schema
      switch (tool.id) {
        case 'web_search':
          return {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词'
              }
            },
            required: ['query']
          };
        case 'js_code':
          return {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: '要执行的 JavaScript 代码'
              }
            },
            required: ['code']
          };
        case 'terminal':
          return {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的终端命令'
              }
            },
            required: ['command']
          };
        case 'web_fetch':
          return {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '要访问的网页 URL'
              }
            },
            required: ['url']
          };
        default:
          return {
            type: 'object',
            properties: {},
            required: []
          };
      }
    }

    /**
     * 切换工具开关
     */
    toggleTool(id, enabled) {
      // 只更新会话状态，不维护内部状态
      if (window.SessionManager && window.SessionManager.toggleSessionTool) {
        const result = window.SessionManager.toggleSessionTool(id, enabled);
        if (result) {
          window.SessionManager.saveConversations();
        }
        return result;
      }
      return false;
    }

    /**
     * 检查工具是否启用
     */
    isToolEnabled(id) {
      // 从当前会话获取启用的工具列表
      let sessionEnabledTools = {};
      if (window.SessionManager && window.SessionManager.getSessionEnabledTools) {
        sessionEnabledTools = window.SessionManager.getSessionEnabledTools();
      }
      
      return sessionEnabledTools[id] ?? false;
    }

    /**
     * 获取所有启用的工具
     */
    getEnabledTools() {
      const enabled = [];
      
      // 从当前会话获取启用的工具列表
      let sessionEnabledTools = {};
      if (window.SessionManager && window.SessionManager.getSessionEnabledTools) {
        sessionEnabledTools = window.SessionManager.getSessionEnabledTools();
      }
      
      this.tools.forEach((tool, id) => {
        if (sessionEnabledTools[id]) {
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
