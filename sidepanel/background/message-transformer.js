// ==================== Message Transformer ====================
// 负责消息格式转换和处理

/**
 * 清理消息中的 reasoning_content
 */
export function cleanReasoningContent(messages) {
  return messages.map(msg => {
    const cleanMsg = { ...msg };
    
    // 清理 reasoning_content（本地思考过程，不发送给 API）
    if (cleanMsg.additional_kwargs?.reasoning_content) {
      delete cleanMsg.additional_kwargs.reasoning_content;
    }
    if (cleanMsg.additional_kwargs && Object.keys(cleanMsg.additional_kwargs).length === 0) {
      delete cleanMsg.additional_kwargs;
    }
    
    return cleanMsg;
  });
}

/**
 * 将 assistant+tool 消息对转换为普通对话（当工具未启用时）
 */
export function convertToolMessagesToText(messages) {
  const convertedMessages = [];
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (msg.role === 'assistant') {
      let assistantContent = msg.content || '';
      
      // 如果有 tool_calls，将其转换为可读文本
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolCallsText = msg.tool_calls.map(tc => {
          const toolName = tc.function?.name || tc.type || 'unknown';
          const args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          
          // 根据不同工具生成可读描述
          let description = '';
          if (toolName === 'js_code' || toolName === 'terminal') {
            description = `执行 JavaScript 代码: ${args.code || '...'}`;
          } else if (toolName === 'web_search') {
            description = `搜索: ${args.query || '...'}`;
          } else if (toolName === 'web_fetch') {
            description = `访问网页: ${args.url || '...'}`;
          } else {
            description = `调用工具 ${toolName}`;
          }
          
          return `- ${description}`;
        }).join('\n');
        
        assistantContent += '\n\n[已禁用工具调用]\n' + toolCallsText;
      }
      
      // 添加 assistant 消息（包含转换后的工具调用信息）
      convertedMessages.push({
        role: 'assistant',
        content: assistantContent
      });
      
      // 检查后续是否有连续的 tool 消息
      const toolResults = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        const toolMsg = messages[j];
        const toolName = toolMsg.name || 'unknown';
        toolResults.push(`[${toolName}] ${toolMsg.content}`);
        j++;
      }
      
      // 如果有工具结果，添加一条用户消息说明执行结果
      if (toolResults.length > 0) {
        convertedMessages.push({
          role: 'user',
          content: `[工具执行结果]\n${toolResults.join('\n\n')}`
        });
      }
      
      // 跳过已处理的 tool 消息
      i = j - 1;
    } else if (msg.role !== 'tool') {
      // 非 tool 消息直接添加
      convertedMessages.push(msg);
    }
    // tool 消息已经在上面处理过了，跳过
  }
  
  return convertedMessages;
}

/**
 * 检查消息中是否包含图片
 */
export function hasImages(messages) {
  return messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some(item => item.type === 'image_url')
  );
}

/**
 * 检查是否需要 tools 定义
 */
export function needsToolsDefinition(messages) {
  const hasToolCalls = messages.some(msg => msg.tool_calls && msg.tool_calls.length > 0);
  const hasToolMessages = messages.some(msg => msg.role === 'tool');
  return hasToolCalls || hasToolMessages;
}

/**
 * 构建 API 请求体
 */
export function buildRequestBody(messages, model, temperature, maxTokens) {
  const requestBody = {
    model,
    messages,
    stream: true,
    temperature,
    ...(maxTokens && { max_tokens: maxTokens })
  };
  
  return requestBody;
}

/**
 * 构建请求头
 */
export function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
  };
}
