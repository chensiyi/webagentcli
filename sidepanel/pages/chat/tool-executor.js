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

    // 从标准的 tool_calls 字段获取（OpenAI 格式）
    const toolCalls = assistantMessage.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      return false;
    }

    console.log(`[ToolExecutor] Detected ${toolCalls.length} tool calls`);

    await this.sessionManager.saveConversations();
    
    if (renderCallback) {
      renderCallback();
    }

    // 依次执行工具
    for (const call of toolCalls) {
      // 检查是否请求停止
      if (window.ChatStreamState?.shouldStop()) {
        console.log('[ToolExecutor] Execution interrupted by stop request');
        break;
      }

      const toolType = call.function?.name;
      if (!toolType) {
        console.warn('[ToolExecutor] Invalid tool call, missing function name');
        continue;
      }

      if (this.toolManager.isToolEnabled(toolType)) {
        await this.executeSingleTool(sessionId, call, toolType);
      }
    }

    // 清理 assistant 消息 content 中的工具调用代码块（如果存在）
    // 兼容处理：某些模型可能仍会在 content 中输出代码块格式
    if (this.toolManager && this.toolManager.removeToolCallBlocks) {
      assistantMessage.content = this.toolManager.removeToolCallBlocks(assistantMessage.content);
    }
    
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

      // 解析参数（OpenAI 标准格式）
      let args = {};
      if (call.function?.arguments) {
        try {
          args = JSON.parse(call.function.arguments);
        } catch (e) {
          console.error('[ToolExecutor] Failed to parse arguments:', e);
          args = {};
        }
      }

      const result = await this.toolManager.executeTool({
        ...call,
        type: toolType,
        ...args  // 展开参数
      });

      // 检查是否请求停止
      if (window.ChatStreamState?.shouldStop()) {
        console.log('[ToolExecutor] Stopped after tool execution');
        return;
      }

      // 创建标准的 tool 消息并持久化
      const toolMessage = {
        role: 'tool',
        tool_call_id: call.id,
        name: toolType,
        content: JSON.stringify(result)
      };

      // 添加到会话历史（持久化）
      this.sessionManager.addMessage(sessionId, toolMessage);
      await this.sessionManager.saveConversations();

      console.log(`[ToolExecutor] Tool ${toolType} executed successfully`);
    } catch (error) {
      console.error(`[ToolExecutor] Tool execution error:`, error);

      // 错误也作为 tool 消息持久化保存
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