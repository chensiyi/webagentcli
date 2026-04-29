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
    const toolResults = [];
    for (const call of assistantMessage.tool_calls) {
      // 检查是否请求停止
      if (window.ChatStreamState?.shouldStop()) {
        console.log('[ToolExecutor] Execution interrupted by stop request');
        break;
      }

      const toolType = call.function.name;

      if (this.toolManager.isToolEnabled(toolType)) {
        const result = await this.executeSingleTool(sessionId, call, toolType);
        if (result) {
          toolResults.push(result);
        }
      }
    }

    // 清理 assistant 消息 content 中的工具调用代码块
    assistantMessage.content = this.toolManager.removeToolCallBlocks(assistantMessage.content);
    
    await this.sessionManager.saveConversations();

    if (renderCallback) {
      renderCallback();
    }

    return {
      executed: true,
      toolResults: toolResults
    }; // 有工具被执行
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

      // 不持久化保存 tool 消息到 session
      // 工具结果用于后续 API 请求时动态生成 tool 消息
      console.log(`[ToolExecutor] Tool ${toolType} executed successfully`);
      
      // 返回结果供调用方使用
      return {
        success: true,
        tool_call_id: call.id,
        name: toolType,
        content: result.output || JSON.stringify(result)
      };
    } catch (error) {
      console.error(`[ToolExecutor] Tool execution error:`, error);

      // 返回错误结果
      return {
        success: false,
        tool_call_id: call.id,
        name: toolType,
        content: JSON.stringify({ 
          success: false, 
          error: error.message,
          type: toolType
        })
      };
    }
  }
}

// 导出
window.ToolExecutor = ToolExecutor;