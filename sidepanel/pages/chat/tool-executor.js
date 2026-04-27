// 工具执行器
// 负责解析和执行工具调用

class ToolExecutor {
  constructor(sessionManager, toolManager) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
  }

  /**
   * 执行工具调用序列
   */
  async executeToolCalls(sessionId, assistantMessage, renderCallback) {
    if (!this.toolManager) {
      return false;
    }

    // 解析工具调用
    const toolCalls = this.toolManager.parseToolCalls(assistantMessage.content);
    
    if (toolCalls.length === 0) {
      return false;
    }

    console.log(`[ToolExecutor] Detected ${toolCalls.length} tool calls`);

    // 更新 assistant 消息，添加标准的 tool_calls 字段
    assistantMessage.tool_calls = toolCalls.map((call, idx) => ({
      id: call.id || `call_${Date.now()}_${idx}`,
      type: 'function',
      function: {
        name: call.function?.name || call.type,
        arguments: call.function?.arguments || JSON.stringify(call.query || call.code || {})
      }
    }));

    await this.sessionManager.saveConversations();
    
    if (renderCallback) {
      renderCallback();
    }

    // 依次执行工具
    for (const call of assistantMessage.tool_calls) {
      // 检查是否请求停止
      if (window.ChatStreamState?.shouldStop()) {
        console.log('[ToolExecutor] Execution interrupted by stop request');
        break;
      }

      const toolType = call.function.name;

      if (this.toolManager.isToolEnabled(toolType)) {
        await this.executeSingleTool(sessionId, call, toolType);
      }
    }

    // 清理 assistant 消息 content 中的工具调用代码块
    assistantMessage.content = this.toolManager.removeToolCallBlocks(assistantMessage.content);
    
    await this.sessionManager.saveConversations();

    if (renderCallback) {
      renderCallback();
    }

    return true; // 有工具被执行
  }

  /**
   * 执行单个工具
   */
  async executeSingleTool(sessionId, call, toolType) {
    try {
      console.log(`[ToolExecutor] Executing tool: ${toolType}`);

      const result = await this.toolManager.executeTool({
        ...call,
        type: toolType
      });

      // 检查是否请求停止
      if (window.ChatStreamState?.shouldStop()) {
        console.log('[ToolExecutor] Stopped after tool execution');
        return;
      }

      // 创建标准的 tool 消息
      const toolMessage = {
        role: 'tool',
        tool_call_id: call.id,
        name: toolType,
        content: result.output || JSON.stringify(result)
      };

      // 添加到会话历史
      this.sessionManager.addMessage(sessionId, toolMessage);
      await this.sessionManager.saveConversations();

      console.log(`[ToolExecutor] Tool ${toolType} executed successfully`);
    } catch (error) {
      console.error(`[ToolExecutor] Tool execution error:`, error);

      // 错误也作为 tool 消息保存
      const errorMessage = {
        role: 'tool',
        tool_call_id: call.id,
        name: toolType,
        content: JSON.stringify({ 
          success: false, 
          error: error.message,
          type: toolType
        })
      };

      this.sessionManager.addMessage(sessionId, errorMessage);
      await this.sessionManager.saveConversations();
    }
  }
}

// 导出
window.ToolExecutor = ToolExecutor;