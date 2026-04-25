# 扩展能力使用指南

本文档展示如何使用新添加的 RAG、思考模式、代码执行等能力。

## 目录

- [RAG (检索增强生成)](#rag-检索增强生成)
- [思考模式](#思考模式)
- [代码执行](#代码执行)
- [JavaScript 执行](#javascript-执行)
- [引用标注](#引用标注)

---

## RAG (检索增强生成)

### 消息格式

```javascript
// 用户发送问题
const userMessage = {
  role: 'user',
  content: '什么是 React？'
};

// AI 返回带 RAG 的回答
const assistantMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: 'React 是一个用于构建用户界面的 JavaScript 库...' },
    {
      type: 'rag_source',
      sources: [
        {
          title: 'React 官方文档',
          url: 'https://react.dev',
          domain: 'react.dev',
          relevance: 0.95
        },
        {
          title: 'React 入门教程',
          url: 'https://example.com/react-tutorial',
          domain: 'example.com',
          relevance: 0.82
        }
      ]
    },
    {
      type: 'rag_context',
      context: 'React 是由 Facebook 开发的开源 JavaScript 库，用于构建用户界面...'
    }
  ]
};
```

### 后端集成示例

```javascript
// 在 background.js 中处理 RAG
async function handleRagQuery(query) {
  // 1. 检索相关文档
  const searchResults = await searchKnowledgeBase(query);
  
  // 2. 构建上下文
  const context = searchResults.map(r => r.content).join('\n\n');
  
  // 3. 调用 LLM
  const response = await callLLM({
    messages: [
      { role: 'system', content: `基于以下上下文回答问题：\n${context}` },
      { role: 'user', content: query }
    ]
  });
  
  // 4. 构建响应
  return {
    role: 'assistant',
    content: [
      { type: 'text', text: response.text },
      {
        type: 'rag_source',
        sources: searchResults.map(r => ({
          title: r.title,
          url: r.url,
          domain: new URL(r.url).hostname,
          relevance: r.score
        }))
      }
    ]
  };
}
```

---

## 思考模式

### 消息格式

```javascript
// 流式响应中的思考过程
const streamChunk = {
  type: 'reasoning',
  reasoning_content: '让我先分析一下这个问题...\n首先，我需要考虑...'
};

// 完整的思考 + 回答
const assistantMessage = {
  role: 'assistant',
  content: [
    {
      type: 'thinking',
      thinking: '问题分析：\n1. 用户想要了解...\n2. 关键点包括...\n3. 最佳解释方式是...'
    },
    {
      type: 'text',
      text: '基于以上分析，我来详细解释...'
    }
  ]
};
```

### 启用思考模式

```javascript
// 调用 API 时启用思考
const response = await fetch(apiEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'deepseek-r1',
    messages: [...],
    extra_body: {
      enable_thinking: true  // 某些 API 需要此参数
    }
  })
});
```

---

## 代码执行

### 消息格式

```javascript
// AI 生成代码并执行
const assistantMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: '我来计算一下这个表达式：' },
    {
      type: 'code',
      code: {
        language: 'python',
        code: 'print(2 + 3 * 4)',
        result: '14'
      }
    },
    { type: 'text', text: '结果是 14。' }
  ]
};
```

### 沙箱执行示例

```javascript
// 在前端安全地执行 Python 代码（使用 Pyodide）
async function executePython(code) {
  try {
    const pyodide = await loadPyodide();
    const result = await pyodide.runPythonAsync(code);
    return { success: true, result: String(result) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 或者在后端使用 Docker 沙箱
async function executeCodeSandbox(code, language) {
  const container = await docker.createContainer({
    Image: `${language}-sandbox`,
    Cmd: ['run', code]
  });
  
  await container.start();
  const output = await container.wait();
  await container.remove();
  
  return output;
}
```

---

## JavaScript 执行

### 消息格式

```javascript
// 执行 JavaScript 代码
const assistantMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: '让我运行这段 JavaScript：' },
    {
      type: 'js_code',
      code: 'Array.from({length: 5}, (_, i) => i * 2)'
    },
    {
      type: 'code_result',
      code: 'Array.from({length: 5}, (_, i) => i * 2)',
      result: [0, 2, 4, 6, 8]
    }
  ]
};
```

### 安全执行 JS

```javascript
// 使用 SafeEvaluator 执行（限制全局对象）
function safeExecuteJS(code) {
  const sandbox = {
    console: { log: () => {} },
    Math: Math,
    Array: Array,
    Object: Object,
    // ... 其他安全的内置对象
  };
  
  const context = Object.create(null);
  Object.assign(context, sandbox);
  
  try {
    const result = new Function(
      ...Object.keys(context),
      `"use strict"; return (${code})`
    )(...Object.values(context));
    
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 或者使用 Web Worker 隔离执行
function executeInWorker(code) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(URL.createObjectURL(
      new Blob([`
        self.onmessage = (e) => {
          try {
            const result = eval(e.data);
            self.postMessage({ success: true, result });
          } catch (error) {
            self.postMessage({ success: false, error: error.message });
          }
        };
      `], { type: 'application/javascript' })
    ));
    
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    
    worker.onerror = (error) => {
      reject(error);
      worker.terminate();
    };
    
    worker.postMessage(code);
  });
}
```

---

## 引用标注

### 消息格式

```javascript
const assistantMessage = {
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: '根据研究[1]，深度学习在图像识别领域取得了显著进展。另一项研究[2]表明...'
    },
    {
      type: 'citation',
      citations: [
        {
          text: '深度学习在计算机视觉中的应用综述',
          source: 'CVPR 2023'
        },
        {
          text: 'Transformer 架构的最新发展',
          source: 'NeurIPS 2023'
        }
      ]
    }
  ]
};
```

---

## 自定义扩展

### 添加新的内容类型

1. **在 messageTypes.js 中添加枚举**

```javascript
const ContentType = {
  // ... 现有类型
  MY_CUSTOM_TYPE: 'my_custom_type'
};
```

2. **创建渲染器**

```javascript
class MyCustomRenderer {
  render(data) {
    const container = document.createElement('div');
    container.className = 'my-custom-container';
    container.textContent = data.value;
    return container;
  }
}
```

3. **注册处理器**

```javascript
window.MessageTypes.MessageHandlerRegistry.register(
  ContentType.MY_CUSTOM_TYPE,
  (contentItem) => {
    const renderer = new MyCustomRenderer();
    return renderer.render(contentItem);
  }
);
```

4. **添加 CSS 样式**

```css
.my-custom-container {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
```

---

## 能力检测

### 检查模型是否支持某功能

```javascript
const capabilities = window.MessageTypes.CapabilityManager.getModelCapabilities('gpt-4o');

if (capabilities.vision) {
  // 可以发送图片
}

if (capabilities.thinking) {
  // 可以启用思考模式
}

if (capabilities.rag) {
  // 可以使用 RAG
}

if (capabilities.code_execution) {
  // 可以执行代码
}
```

### 注册自定义检测器

```javascript
// 为特定模型添加自定义检测逻辑
window.MessageTypes.CapabilityManager.registerDetector(
  'my_custom_capability',
  (modelName) => {
    return modelName.includes('my-special-model');
  }
);
```

---

## 最佳实践

1. **渐进增强**: 始终检查模型能力，提供降级方案
2. **错误处理**: 代码执行可能失败，要妥善处理异常
3. **安全性**: 在前端执行代码时使用沙箱或 Web Worker
4. **性能**: RAG 检索可能耗时，考虑缓存和异步加载
5. **用户体验**: 思考过程和代码执行结果应该可折叠/展开

---

## 完整示例

```javascript
// 综合使用多种能力
async function sendEnhancedMessage(question) {
  // 1. 检查模型能力
  const model = getCurrentModel();
  const capabilities = window.MessageTypes.CapabilityManager.getModelCapabilities(model);
  
  let messages = [{ role: 'user', content: question }];
  
  // 2. 如果支持 RAG，先检索
  if (capabilities.rag) {
    const ragResults = await retrieveFromKnowledgeBase(question);
    messages.unshift({
      role: 'system',
      content: `基于以下知识回答问题：\n${ragResults.context}`
    });
  }
  
  // 3. 如果支持思考，启用思考模式
  const requestOptions = {
    model,
    messages,
    extra_body: capabilities.thinking ? { enable_thinking: true } : {}
  };
  
  // 4. 发送请求并处理流式响应
  const port = chrome.runtime.connect({ name: 'chat-stream' });
  
  port.onMessage.addListener(async (chunk) => {
    if (chunk.type === 'reasoning') {
      // 显示思考过程
      showThinking(chunk.reasoning_content);
    } else if (chunk.type === 'chunk') {
      // 显示回答
      appendToResponse(chunk.content);
    } else if (chunk.type === 'tool_call') {
      // 处理工具调用
      const result = await executeToolCall(chunk.tool_calls[0]);
      port.postMessage({ type: 'tool_result', tool_call_id: chunk.tool_calls[0].id, result });
    }
  });
  
  port.postMessage(requestOptions);
}
```
