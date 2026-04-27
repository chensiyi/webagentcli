// ==================== Background Service Worker ====================
// 后台接收聊天数据 + 标签页监听与自动注入脚本

console.log('[Background] Starting...');

// ==================== Stream Chat Port Handler ====================
// 处理流式聊天的长连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
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
        // 处理消息：清理 reasoning_content 和转换 tool 相关字段
        let processedMessages = messages.map(msg => {
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
        
        // 如果工具未启用，将 assistant+tool 消息对转换为普通对话
        if (!toolsEnabled) {
          const convertedMessages = [];
          
          for (let i = 0; i < processedMessages.length; i++) {
            const msg = processedMessages[i];
            
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
              while (j < processedMessages.length && processedMessages[j].role === 'tool') {
                const toolMsg = processedMessages[j];
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
          
          processedMessages = convertedMessages;
        }
        
        // 检查消息中是否包含图片
        const hasImages = processedMessages.some(msg => 
          Array.isArray(msg.content) && 
          msg.content.some(item => item.type === 'image_url')
        );
        
        if (hasImages) {
          console.log('[Background] Message contains images');
        }
        
        const requestBody = {
          model,
          messages: processedMessages,
          stream: true,
          temperature,
          ...(maxTokens && { max_tokens: maxTokens })
        };
        
        // 如果启用了工具且有tool_calls，需要添加tools定义
        // 注意：即使没有实际的tool_calls，只要消息中有role='tool'的消息，也需要tools定义
        const hasToolCalls = processedMessages.some(msg => msg.tool_calls && msg.tool_calls.length > 0);
        const hasToolMessages = processedMessages.some(msg => msg.role === 'tool');
        
        console.log('[Background] Request body preview:', {
          model,
          messagesCount: processedMessages.length,
          hasToolCalls,
          hasToolMessages,
          toolsEnabled,
          firstMessageRole: processedMessages[0]?.role,
          lastMessageRole: processedMessages[processedMessages.length - 1]?.role
        });
        
        // 构建请求头（API Key 可选）
        const headers = {
          'Content-Type': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
        };
        
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
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
          console.error('[Background] Request details:', {
            model,
            apiEndpoint,
            messagesCount: processedMessages.length,
            toolsEnabled,
            hasToolCalls: processedMessages.some(msg => msg.tool_calls && msg.tool_calls.length > 0),
            hasToolMessages: processedMessages.some(msg => msg.role === 'tool')
          });
          
          // 打印最后几条消息的角色
          console.error('[Background] Last 3 message roles:', 
            processedMessages.slice(-3).map(m => m.role)
          );
          
          if (!isDisconnected) {
            port.postMessage({ type: 'error', error: errorMessage });
          }
          return;
        }
        
        // 读取流式响应并实时发送
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
                    continue;
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
        
      } catch (error) {
        console.error('[Background] Stream chat error:', error);
        if (!isDisconnected) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
    });
  }
});

// ====================  resgister user scripts =====================
// 监听 storage 变化，自动注册/注销用户脚本
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.installedScripts) {
    console.log('[Background] installedScripts changed, updating user scripts...');
    await updateUserScripts();
  }
});

// 扩展安装或更新时，重新注册脚本
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed/updated:', details.reason);
  await updateUserScripts();
});

// 监听标签页更新，自动注入脚本
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 页面加载完成时
  if (changeInfo.status === 'complete' && tab.url) {
    await injectScriptsToTab(tabId, tab.url);
  }
});

/**
 * 更新用户脚本（由 Side Panel 的 UserScriptManager 处理）
 * Background 只负责监听安装/卸载事件
 */
async function updateUserScripts() {
  console.log('[Background] Scripts managed by UserScriptManager in Side Panel');
}

/**
 * 向标签页注入匹配的脚本
 */
async function injectScriptsToTab(tabId, url) {
  try {
    // 先清理该标签页中已注入的所有用户脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const scripts = document.querySelectorAll('script[id^="userscript-"]');
        scripts.forEach(script => script.remove());
      }
    });
    
    const result = await chrome.storage.local.get('installedScripts');
    const scripts = result.installedScripts || [];
    
    for (const script of scripts) {
      if (!script.enabled) continue;
      
      // 检查 URL 是否匹配
      if (!matchesURL(url, script)) continue;
      
      // 获取脚本代码
      const codeResult = await chrome.storage.local.get(`script_code_${script.id}`);
      const code = codeResult[`script_code_${script.id}`];
      
      if (!code) continue;
      
      // 包装代码（简化版，不含 GM API）
      const wrappedCode = `
(function() {
  'use strict';
  ${code}
})();
`;
      
      // 注入到页面
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (code, scriptId) => {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.textContent = code;
          script.id = `userscript-${scriptId}`;
          (document.head || document.documentElement).appendChild(script);
        },
        args: [wrappedCode, script.id]
      });
      
      console.log('[Background] Injected script:', script.name);
    }
  } catch (error) {
    console.error('[Background] Failed to inject scripts:', error);
  }
}

/**
 * 检查 URL 是否匹配脚本规则
 */
function matchesURL(url, scriptInfo) {
  if (!scriptInfo.matches || scriptInfo.matches.length === 0) {
    return true;
  }
  
  // 检查排除规则
  if (scriptInfo.excludes) {
    for (const pattern of scriptInfo.excludes) {
      if (matchPattern(url, pattern)) {
        return false;
      }
    }
  }
  
  // 检查包含规则
  for (const pattern of scriptInfo.matches) {
    if (matchPattern(url, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 匹配 URL 模式
 */
function matchPattern(url, pattern) {
  if (pattern === '*://*/*') {
    return true;
  }
  
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '\\?');
  
  const fullRegex = new RegExp('^' + regex + '$');
  return fullRegex.test(url);
}

// ==================== Message Handler ====================
// 监听来自 Side Panel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(error => {
    console.error('[Runtime Error]', error);
    sendResponse({ success: false, error: error.message });
  });
  
  return true; // 保持消息通道开放（异步响应）
});

/**
 * 处理消息
 */
async function handleMessage(message, sender) {
  const { type, payload } = message;
  
  console.log(`[Background] Received: ${type}`, payload);
  
  switch (type) {
    case 'CHAT_REQUEST':
      return await handleChatRequest(payload);
    
    case 'CHAT_STREAM_REQUEST':
      return await handleChatStreamRequest(payload);
    
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

// 处理聊天请求
async function handleChatRequest(data) {
  const { messages, apiKey, apiEndpoint, model } = data;
  
  console.log('[Background] Chat request:', { apiEndpoint, model });
  
  try {
    // 构建请求头（API Key 可选）
    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    };
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    });
    
    console.log('[Background] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] API error response:', errorText);
      
      // 尝试解析为 JSON
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error?.message || 'API request failed');
      } catch (e) {
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
    }
    
    const result = await response.json();
    return {
      success: true,
      content: result.choices[0].message.content
    };
  } catch (error) {
    console.error('[Background] Chat error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 处理流式聊天请求
async function handleChatStreamRequest(data) {
  const { messages, apiKey, apiEndpoint, model, temperature, maxTokens } = data;
  
  console.log('[Background] Stream chat request:', { apiEndpoint, model, hasApiKey: !!apiKey });
  
  try {
    const requestBody = {
      model,
      messages,
      stream: true,
      temperature
    };
    
    if (maxTokens) requestBody.max_tokens = maxTokens;
    
    // 构建请求头（API Key 可选）
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    // 读取流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const content = data.choices[0]?.delta?.content || '';
            fullContent += content;
          } catch (e) {
            console.warn('[Background] Failed to parse chunk:', e);
          }
        }
      }
    }
    
    return {
      success: true,
      content: fullContent
    };
  } catch (error) {
    console.error('[Background] Stream chat error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[Background] Ready');
