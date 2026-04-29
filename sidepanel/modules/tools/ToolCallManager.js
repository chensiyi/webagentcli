// 工具调用管理器
// 按照 OpenAI Tool Calling 标准管理工具调用的完整生命周期

/**
 * 工具调用状态管理
 */
class ToolCallManager {
  constructor(sessionManager, toolManager) {
    this.sessionManager = sessionManager;
    this.toolManager = toolManager;
  }

  /**
   * 检查消息是否包含工具调用
   * @param {Object} message - 消息对象
   * @returns {boolean} 是否包含工具调用
   */
  hasToolCalls(message) {
    return message && 
           message.role === 'assistant' && 
           message.tool_calls && 
           message.tool_calls.length > 0;
  }

  /**
   * 检查消息是否是工具执行结果
   * @param {Object} message - 消息对象
   * @returns {boolean} 是否是 tool 消息
   */
  isToolMessage(message) {
    return message && message.role === 'tool';
  }

  /**
   * 查找 assistant 消息对应的所有 tool 结果
   * @param {Array} messages - 消息数组
   * @param {number} assistantIndex - assistant 消息的索引
   * @returns {Array} tool 结果数组
   */
  findToolResults(messages, assistantIndex) {
    if (assistantIndex < 0 || assistantIndex >= messages.length) {
      return [];
    }

    const assistantMsg = messages[assistantIndex];
    if (!this.hasToolCalls(assistantMsg)) {
      return [];
    }

    const toolCallIds = new Set(
      assistantMsg.tool_calls.map(tc => tc.id)
    );

    const results = [];
    
    // 查找后续的 tool 消息
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const msg = messages[i];
      
      // 遇到非 tool 消息，停止查找
      if (msg.role !== 'tool') {
        break;
      }
      
      // 如果 tool_call_id 匹配，添加到结果
      if (msg.tool_call_id && toolCallIds.has(msg.tool_call_id)) {
        results.push(msg);
      }
    }

    return results;
  }

  /**
   * 执行工具调用
   * @param {string} sessionId - 会话 ID
   * @param {Object} assistantMessage - 包含 tool_calls 的 assistant 消息
   * @param {Function} onProgress - 进度回调（每个工具执行后调用）
   * @returns {Promise<boolean>} 是否执行了工具
   */
  async executeToolCalls(sessionId, assistantMessage, onProgress) {
    if (!this.hasToolCalls(assistantMessage)) {
      return false;
    }

    const toolCalls = assistantMessage.tool_calls;
    console.log(`[ToolCallManager] Executing ${toolCalls.length} tool call(s)`);

    for (const call of toolCalls) {
      const toolType = call.function?.name;
      if (!toolType) {
        console.warn('[ToolCallManager] Invalid tool call, missing function name');
        continue;
      }

      if (!this.toolManager.isToolEnabled(toolType)) {
        console.log(`[ToolCallManager] Tool ${toolType} is disabled, skipping`);
        continue;
      }

      try {
        await this.executeSingleTool(sessionId, call, toolType);
        
        // 触发进度回调
        if (onProgress) {
          onProgress();
        }
      } catch (error) {
        console.error(`[ToolCallManager] Tool ${toolType} execution failed:`, error);
        
        // 创建错误 tool 消息
        this.createToolMessage(sessionId, call.id, toolType, `执行失败: ${error.message}`);
        
        if (onProgress) {
          onProgress();
        }
      }
    }

    // 保存会话
    await this.sessionManager.saveConversations();
    
    return true;
  }

  /**
   * 执行单个工具
   * @param {string} sessionId - 会话 ID
   * @param {Object} toolCall - tool_call 对象
   * @param {string} toolType - 工具类型
   */
  async executeSingleTool(sessionId, toolCall, toolType) {
    console.log(`[ToolCallManager] Executing tool: ${toolType}`);

    const args = toolCall.function?.arguments 
      ? JSON.parse(toolCall.function.arguments) 
      : {};

    // 调用工具执行器
    const tool = this.toolManager.getTool(toolType);
    if (!tool) {
      throw new Error(`Tool ${toolType} not found`);
    }

    const result = await tool.execute(args);
    
    // 创建 tool 消息
    this.createToolMessage(sessionId, toolCall.id, toolType, result);
    
    console.log(`[ToolCallManager] Tool ${toolType} executed successfully`);
  }

  /**
   * 创建 tool 消息
   * @param {string} sessionId - 会话 ID
   * @param {string} toolCallId - tool_call 的 ID
   * @param {string} toolName - 工具名称
   * @param {string} content - 工具执行结果
   */
  createToolMessage(sessionId, toolCallId, toolName, content) {
    const toolMessage = {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: typeof content === 'string' ? content : JSON.stringify(content)
    };

    this.sessionManager.addMessage(sessionId, toolMessage);
    console.log(`[ToolCallManager] Created tool message for ${toolName}`);
  }

  /**
   * 准备包含工具调用上下文的消息列表
   * 用于发送给 API 的第二轮对话
   * @param {string} sessionId - 会话 ID
   * @param {Object} settings - 设置对象
   * @returns {Array} 处理后的消息列表
   */
  prepareMessagesWithContext(sessionId, settings) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return [];
    }

    let messages = session.messages.map(msg => {
      const cleanMsg = { ...msg };
      
      // 清理 reasoning_content（不发送给 API）
      if (cleanMsg.additional_kwargs?.reasoning_content) {
        delete cleanMsg.additional_kwargs.reasoning_content;
      }
      
      // 清理空的 additional_kwargs
      if (cleanMsg.additional_kwargs && Object.keys(cleanMsg.additional_kwargs).length === 0) {
        delete cleanMsg.additional_kwargs;
      }
      
      return cleanMsg;
    });

    // 添加工具提示词到 system prompt
    if (this.toolManager) {
      const toolPrompt = this.toolManager.generateSystemPrompt();
      if (toolPrompt) {
        const timeInfo = `当前时间: ${this.getCurrentTimeString()}\n\n`;
        const fullSystemPrompt = settings.systemPrompt
          ? `${timeInfo}${toolPrompt}\n\n${settings.systemPrompt}`
          : `${timeInfo}${toolPrompt}`;

        messages = messages.filter(m => m.role !== 'system');
        messages = [{ role: 'system', content: fullSystemPrompt }, ...messages];
      }
    }

    return messages;
  }

  /**
   * 获取当前时间字符串
   */
  getCurrentTimeString() {
    const now = new Date();
    return now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  /**
   * 清理 assistant 消息 content 中的工具调用代码块
   * @param {string} content - 消息内容
   * @returns {string} 清理后的内容
   */
  cleanToolCallBlocks(content) {
    if (!content) return content;
    
    // 移除 ```tool_name ... ``` 格式的代码块
    return content.replace(/```(?:tool|function|code)\w*\n[\s\S]*?```/g, '').trim();
  }
}

// 导出到全局
window.ToolCallManager = ToolCallManager;
