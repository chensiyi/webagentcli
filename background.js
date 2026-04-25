// ==================== Background Service Worker ====================
// Web Agent Runtime 核心 + User Scripts Manager

console.log('[WebAgent Client] Starting...');

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
      const { messages, apiKey, apiEndpoint, model, temperature, maxTokens } = data;
      
      console.log('[Background] Stream chat:', model);
      
      try {
        // 检查消息中是否包含图片
        const hasImages = messages.some(msg => 
          Array.isArray(msg.content) && 
          msg.content.some(item => item.type === 'image_url')
        );
        
        if (hasImages) {
          console.log('[Background] Message contains images');
        }
        
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
          let errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
          
          // 尝试解析 JSON 错误信息
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              errorMessage = errorJson.error.message || JSON.stringify(errorJson.error);
            }
          } catch (e) {
            // 如果不是 JSON，使用原始文本
          }
          
          console.error('[Background] API request failed:', errorMessage);
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
                    console.error('[Background] API error in stream:', chunkData.error);
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

// ==================== User Scripts Manager ====================
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
  
  console.log(`[Runtime] Received: ${type}`, payload);
  
  switch (type) {
    case 'GET_TOOLS':
      return { success: true, data: [] };
    
    case 'EXECUTE_TOOL':
      return { success: true, data: null };
    
    case 'CHAT_REQUEST':
      return await handleChatRequest(payload);
    
    case 'CHAT_STREAM_REQUEST':
      return await handleChatStreamRequest(payload);
    
    case 'GET_MODELS':
      return await handleGetModels(payload);
    
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
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
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

// 获取模型列表
async function handleGetModels(data) {
  const { apiKey, apiEndpoint } = data;
  
  console.log('[Background] Get models request:', { apiEndpoint });
  
  try {
    // 构建 models API URL
    let modelsEndpoint = apiEndpoint.replace('/chat/completions', '').replace(/\/$/, '') + '/models';
    
    // 构建请求头（API Key 可选）
    const headers = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(modelsEndpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    // 提取模型 ID 列表
    const models = result.data ? result.data.map(m => m.id) : [];
    
    return {
      success: true,
      models
    };
  } catch (error) {
    console.error('[Background] Get models error:', error);
    return {
      success: false,
      error: error.message,
      models: []
    };
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[WebAgent Client] Ready');
