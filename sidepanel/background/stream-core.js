// ==================== Stream Core Engine ====================
// 核心流式处理引擎，负责 API 请求和流式响应处理

import { 
  cleanReasoningContent, 
  convertToolMessagesToText, 
  hasImages,
  buildRequestBody,
  buildHeaders 
} from './message-transformer.js';

/**
 * 处理流式聊天端口连接
 */
export function handleStreamPort(port) {
  let isDisconnected = false;
  
  // 监听 port 断开
  port.onDisconnect.addListener(() => {
    isDisconnected = true;
    console.log('[Background] Port disconnected');
  });
  
  port.onMessage.addListener(async (data) => {
    const { messages, apiKey, apiEndpoint, model, temperature, maxTokens, toolsEnabled, tools, apiStandard, requestBody } = data;
    
    console.log('[Background] Stream chat:', model, 'apiStandard:', apiStandard, 'toolsEnabled:', toolsEnabled);
    
    try {
      // 如果前端已经构建了请求体，直接使用
      let finalRequestBody = requestBody;
      let messageCount = messages?.length || 0; // 用于错误日志
      
      // 否则使用默认方式构建（向后兼容）
      if (!finalRequestBody) {
        // 处理消息转换
        const processedMessages = processMessages(messages, toolsEnabled);
        messageCount = processedMessages.length;
        
        // 检查是否包含图片
        if (hasImages(processedMessages)) {
          console.log('[Background] Message contains images');
        }
        
        // 构建请求 - 根据 API 标准使用不同格式
        if (apiStandard === 'lm-studio') {
          // LM Studio 原生 API 格式
          finalRequestBody = buildLMStudioRequestBody(processedMessages, model, temperature, maxTokens);
        } else {
          // OpenAI 兼容格式
          finalRequestBody = buildRequestBody(processedMessages, model, temperature, maxTokens, tools);
        }
      }
      
      const headers = buildHeaders(apiKey);
      
      console.log('[Background] Request body preview:', {
        model,
        messageCount,
        requestBodyKeys: Object.keys(finalRequestBody),
        stream: finalRequestBody.stream
      });
      
      // 发送 API 请求
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalRequestBody)
      });
      
      if (!response.ok) {
        await handleError(response, port, isDisconnected, {
          model,
          apiEndpoint,
          messagesCount: messageCount,
          toolsEnabled
        });
        return;
      }
      
      // 处理流式响应
      await handleStreamResponse(response, port, isDisconnected);
      
    } catch (error) {
      console.error('[Background] Stream chat error:', error);
      if (!isDisconnected) {
        port.postMessage({ type: 'error', error: error.message });
      }
    }
  });
}

/**
 * 处理消息转换
 */
function processMessages(messages, toolsEnabled) {
  // 清理 reasoning_content
  let processedMessages = cleanReasoningContent(messages);
  
  // 如果工具未启用，将 assistant+tool 消息对转换为普通对话
  if (!toolsEnabled) {
    processedMessages = convertToolMessagesToText(processedMessages);
  }
  
  return processedMessages;
}

/**
 * 构建 LM Studio 原生 API 请求体
 * 参考: https://lmstudio.ai/docs/developer/rest/chat
 */
function buildLMStudioRequestBody(messages, model, temperature, maxTokens) {
  const requestBody = {
    model,
    input: messages, // LM Studio 使用 'input' 而不是 'messages'
    stream: true,
    ...(temperature !== undefined && { temperature }),
    ...(maxTokens && { max_output_tokens: maxTokens }) // LM Studio 使用 'max_output_tokens'
  };
  
  return requestBody;
}

/**
 * 处理错误响应
 */
async function handleError(response, port, isDisconnected, context) {
  const errorText = await response.text();
  let errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
  
  // 尝试解析 JSON 错误信息
  try {
    const errorJson = JSON.parse(errorText);
    console.error('[Background] Full API error response:', JSON.stringify(errorJson, null, 2));
    if (errorJson.error) {
      errorMessage = errorJson.error.message || JSON.stringify(errorJson.error);
    }
  } catch (e) {
    // 如果不是 JSON，使用原始文本
  }
  
  console.error('[Background] API request failed:', errorMessage);
  console.error('[Background] Request details:', context);
  
  // 打印最后几条消息的角色（安全访问）
  if (context && context.messages && Array.isArray(context.messages)) {
    console.error('[Background] Last 3 message roles:', 
      context.messages.slice(-3).map(m => m.role)
    );
  }
  
  if (!isDisconnected) {
    port.postMessage({ type: 'error', error: errorMessage });
  }
}

/**
 * 处理流式响应
 */
async function handleStreamResponse(response, port, isDisconnected) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  // 用于累积 tool_calls 片段
  let accumulatedToolCalls = {};
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 检查 port 是否已断开
      if (isDisconnected) {
        reader.cancel();
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (isDisconnected) break;
        
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        
        if (trimmed.startsWith('data: ')) {
          await processChunk(trimmed, port, isDisconnected, accumulatedToolCalls);
        }
      }
    }
  } catch (streamError) {
    console.error('[Background] Stream reading error:', streamError);
    if (!isDisconnected) {
      port.postMessage({ 
        type: 'error', 
        error: '流式读取失败: ' + streamError.message 
      });
    }
    return;
  }
  
  // 流式完成
  if (!isDisconnected) {
    port.postMessage({ type: 'complete' });
  }
}

/**
 * 处理单个数据块
 */
async function processChunk(trimmed, port, isDisconnected, accumulatedToolCalls) {
  try {
    const chunkData = JSON.parse(trimmed.slice(6));
    
    // 检查是否有错误信息
    if (chunkData.error) {
      console.error('[Background] API error in stream:', JSON.stringify(chunkData.error, null, 2));
      if (!isDisconnected) {
        port.postMessage({ 
          type: 'error', 
          error: chunkData.error.message || JSON.stringify(chunkData.error),
          code: chunkData.error.code,
          status: chunkData.error.status,
          details: chunkData.error
        });
      }
      return;
    }
    
    // 检查 choices 是否存在
    if (!chunkData.choices || !Array.isArray(chunkData.choices) || chunkData.choices.length === 0) {
      console.warn('[Background] Invalid chunk format:', chunkData);
      return;
    }
    
    const content = chunkData.choices[0]?.delta?.content || '';
    const reasoningContent = chunkData.choices[0]?.delta?.reasoning_content || 
                            chunkData.choices[0]?.delta?.thinking || '';
    const toolCallsDelta = chunkData.choices[0]?.delta?.tool_calls;
    
    // 发送思考内容
    if (reasoningContent && !isDisconnected) {
      port.postMessage({ 
        type: 'reasoning', 
        reasoning_content: reasoningContent 
      });
    }
    
    // 处理 tool_calls 增量更新
    if (toolCallsDelta && Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
      console.log('[Background] Received tool_calls delta:', JSON.stringify(toolCallsDelta));
      
      for (const delta of toolCallsDelta) {
        const index = delta.index;
        
        // 初始化该索引的 tool_call
        if (!accumulatedToolCalls[index]) {
          accumulatedToolCalls[index] = {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }
        
        const current = accumulatedToolCalls[index];
        
        // 累积字段
        if (delta.id) current.id = delta.id;
        if (delta.type) current.type = delta.type;
        if (delta.function?.name) current.function.name += delta.function.name;
        if (delta.function?.arguments) current.function.arguments += delta.function.arguments;
      }
      
      // 发送完整的 tool_calls 到前端
      if (!isDisconnected) {
        console.log('[Background] Sending tool_call message:', JSON.stringify(Object.values(accumulatedToolCalls)));
        port.postMessage({ 
          type: 'tool_call', 
          tool_calls: Object.values(accumulatedToolCalls)
        });
      }
    }
    
    // 发送普通文本
    if (content && !isDisconnected) {
      port.postMessage({ type: 'chunk', content });
    }
  } catch (e) {
    console.error('[Background] Failed to parse chunk:', e, 'Raw data:', trimmed);
    // 如果是解析错误，可能是 API 返回了错误响应
    if (trimmed.includes('error') || trimmed.includes('Error')) {
      try {
        const errorData = JSON.parse(trimmed.slice(6));
        if (!isDisconnected) {
          port.postMessage({ 
            type: 'error', 
            error: errorData.error?.message || 'API 请求失败',
            code: errorData.error?.code,
            status: errorData.error?.status,
            details: errorData.error
          });
        }
      } catch (parseError) {
        // 忽略解析错误
      }
    }
  }
}
