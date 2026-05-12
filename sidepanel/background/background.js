// ==================== Background Service Worker ====================
// 后台服务协调器 - 负责连接各模块

import { handleStreamPort } from './stream-core.js';
import { updateUserScripts, injectScriptsToTab } from './script-injector.js';

console.log('[Background] Starting...');

// ==================== Stream Chat Port Handler ====================
// 处理流式聊天的长连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
    handleStreamPort(port);
  }
});

// ====================  User Scripts Management =====================
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
