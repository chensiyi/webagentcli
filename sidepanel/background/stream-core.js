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
    const { messages, apiKey, apiEndpoint, model, temperature, maxTokens, toolsEnabled } = data;
    
    console.log('[Background] Stream chat:', model, 'toolsEnabled:', toolsEnabled);
    
    try {
      // 处理消息转换
      let processedMessages = processMessages(messages, toolsEnabled);
      
      // 检查是否包含图片
      if (hasImages(processedMessages)) {
        console.log('[Background] Message contains images');
      }
      
      // 构建请求
      const requestBody = buildRequestBody(processedMessages, model, temperature, maxTokens);
      const headers = buildHeaders(apiKey);
      
      console.log('[Background] Request body preview:', {
        model,
        messagesCount: processedMessages.length,
        toolsEnabled,
        firstMessageRole: processedMessages[0]?.role,
        lastMessageRole: processedMessages[processedMessages.length - 1]?.role
      });
      
      // 发送 API 请求
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        await handleError(response, port, isDisconnected, {
          model,
          apiEndpoint,
          messagesCount: processedMessages.length,
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
  
  // 打印最后几条消息的角色
  console.error('[Background] Last 3 message roles:', 
    context.messages.slice(-3).map(m => m.role)
  );
  
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
          await processChunk(trimmed, port, isDisconnected);
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
async function processChunk(trimmed, port, isDisconnected) {
  try {
    const chunkData = JSON.parse(trimmed.slice(6));
    
    // 检查是否有错误信息
    if (chunkData.error) {
      console.error('[Background] API error in stream:', JSON.stringify(chunkData.error, null, 2));
      if (!isDisconnected) {
        port.postMessage({ 
          type: 'error', 
          error: chunkData.error.message || JSON.stringify(chunkData.error) 
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
    // TODO: 预留接口 - 提取 reasoning/thinking 内容
    const reasoningContent = chunkData.choices[0]?.delta?.reasoning_content || 
                            chunkData.choices[0]?.delta?.thinking || '';
    // TODO: 预留接口 - 提取 tool_calls
    const toolCalls = chunkData.choices[0]?.delta?.tool_calls;
    
    // TODO: 预留接口 - 发送思考内容到 sidepanel
    // 发送思考内容
    if (reasoningContent && !isDisconnected) {
      port.postMessage({ 
        type: 'reasoning', 
        reasoning_content: reasoningContent 
      });
    }
    
    // TODO: 预留接口 - 发送工具调用到 sidepanel
    // 发送工具调用
    if (toolCalls && toolCalls.length > 0 && !isDisconnected) {
      port.postMessage({ 
        type: 'tool_call', 
        tool_calls: toolCalls 
      });
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
            error: errorData.error?.message || 'API 请求失败' 
          });
        }
      } catch (parseError) {
        // 忽略解析错误
      }
    }
  }
}
