# API 层使用指南

基于 MessageModels 的统一 API 服务层

## 架构概览

```
MessageModels (数据模型)
    ↓
BaseAdapter (适配器基类)
    ↓
具体适配器 (OpenAI, Anthropic, Ollama, etc.)
    ↓
UnifiedAPIService (统一服务)
    ↓
业务代码 (Chat, Agent, etc.)
```

## 快速开始

### 1. 配置 API

```javascript
// 创建 UnifiedAPIService 实例
const apiService = new window.UnifiedAPIService();

// 配置 API（自动选择适配器）
apiService.configure({
  apiStandard: 'openai',  // 或 'anthropic', 'ollama', 'lm-studio', 'openrouter'
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-...',
  defaultModel: 'gpt-4',
  logRawPayloads: false,
  logErrorTracebacks: true
});
```

### 2. 发送非流式请求

```javascript
const { Message, MessagesRequest } = window.MessageModels;

// 创建消息
const messages = [
  new Message('system', '你是一个有用的助手'),
  new Message('user', '你好')
];

// 创建请求
const request = new MessagesRequest({
  model: 'gpt-4',
  messages: messages,
  temperature: 0.7,
  max_tokens: 2000
});

// 发送请求
try {
  const response = await apiService.chat(request);
  console.log('Response:', response.content);
  console.log('Role:', response.role);
  console.log('Has tool calls:', response.hasToolCalls());
} catch (error) {
  console.error('Error:', error);
}
```

### 3. 发送流式请求

```javascript
let fullContent = '';

await apiService.chatStream(
  request,
  // onChunk 回调
  (chunk) => {
    if (chunk.content) {
      fullContent += chunk.content;
      console.log('Chunk:', chunk.content);
    }
    
    if (chunk.toolCalls && chunk.toolCalls.length > 0) {
      console.log('Tool calls:', chunk.toolCalls);
    }
  },
  // onComplete 回调
  () => {
    console.log('Stream completed');
    console.log('Full content:', fullContent);
  }
);
```

### 4. 获取模型列表

```javascript
try {
  const models = await apiService.listModels();
  console.log('Available models:', models);
  
  // 遍历模型
  models.forEach(model => {
    console.log(`- ${model.id}`);
  });
} catch (error) {
  console.error('Failed to fetch models:', error);
}
```

### 5. 检测模型能力

```javascript
const capabilities = await apiService.detectCapabilities('gpt-4-vision-preview');

console.log('Vision support:', capabilities?.vision);
console.log('Audio support:', capabilities?.audio);
console.log('Streaming support:', capabilities?.streaming);
console.log('Tools support:', capabilities?.tools);
```

## 适配器说明

### OpenAI 适配器

```javascript
apiService.configure({
  apiStandard: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-...'
});
```

### Anthropic 适配器

```javascript
apiService.configure({
  apiStandard: 'anthropic',
  endpoint: 'https://api.anthropic.com',
  apiKey: 'sk-ant-...'
});
```

### Ollama 适配器

```javascript
apiService.configure({
  apiStandard: 'ollama',
  endpoint: 'http://localhost:11434/api',
  defaultModel: 'llama2'
});
```

### LM Studio 适配器

```javascript
apiService.configure({
  apiStandard: 'lm-studio',
  endpoint: 'http://localhost:1234/v1',
  defaultModel: 'local-model'
});
```

### OpenRouter 适配器

```javascript
apiService.configure({
  apiStandard: 'openrouter',
  endpoint: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-...'
});
```

## 高级用法

### 使用工具调用

```javascript
const { Tool } = window.MessageModels;

// 定义工具
const searchTool = new Tool(
  'search',
  '搜索互联网获取信息',
  {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询'
      }
    },
    required: ['query']
  }
);

// 创建带工具的请求
const request = new MessagesRequest({
  model: 'gpt-4',
  messages: messages,
  tools: [searchTool],
  tool_choice: 'auto'
});

// 发送请求
const response = await apiService.chat(request);

// 检查是否有工具调用
if (response.hasToolCalls()) {
  const toolCalls = response.getToolCalls();
  console.log('Tool calls:', toolCalls);
  
  // 执行工具并返回结果...
}
```

### 多模态消息

```javascript
const { TextBlock, ImageBlock } = window.MessageModels;

// 创建包含图片的消息
const multimodalMessage = new Message('user', [
  new TextBlock('这张图片是什么？'),
  new ImageBlock({
    type: 'base64',
    media_type: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAA...'
  })
]);

const request = new MessagesRequest({
  model: 'gpt-4-vision-preview',
  messages: [multimodalMessage]
});

const response = await apiService.chat(request);
```

### 切换适配器

```javascript
// 切换到 Anthropic
apiService.selectAdapter('anthropic');
apiService.configure({
  endpoint: 'https://api.anthropic.com',
  apiKey: 'sk-ant-...'
});

// 切换到 Ollama
apiService.selectAdapter('ollama');
apiService.configure({
  endpoint: 'http://localhost:11434/api'
});
```

## 错误处理

```javascript
try {
  const response = await apiService.chat(request);
} catch (error) {
  if (error.message.includes('HTTP 401')) {
    console.error('Authentication failed. Check your API key.');
  } else if (error.message.includes('HTTP 429')) {
    console.error('Rate limit exceeded. Please wait.');
  } else if (error.message.includes('HTTP 500')) {
    console.error('Server error. Try again later.');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## 与 SessionManager 集成

```javascript
// 在 Chat 页面中
async function sendMessage(userInput) {
  // 1. 添加用户消息到会话
  const userMsg = new Message('user', userInput);
  SessionManager.addMessage(sessionId, userMsg);
  
  // 2. 创建 API 请求
  const session = SessionManager.getSession(sessionId);
  const request = new MessagesRequest({
    model: currentModel,
    messages: session.messages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens
  });
  
  // 3. 发送流式请求
  let assistantContent = '';
  
  await apiService.chatStream(
    request,
    (chunk) => {
      if (chunk.content) {
        assistantContent += chunk.content;
        // 实时更新 UI
        updateMessageDisplay(assistantContent);
      }
    },
    () => {
      // 4. 添加助手消息到会话
      const assistantMsg = new Message('assistant', assistantContent);
      SessionManager.addMessage(sessionId, assistantMsg);
      
      // 5. 保存会话
      SessionManager.saveConversations();
    }
  );
}
```

## 注意事项

1. **MessageModels 必须在 API 服务之前加载**
   - sidepanel.html 中已正确配置加载顺序

2. **适配器会自动格式化消息**
   - 传入 Message 对象，适配器会自动转换为对应 API 的格式

3. **流式响应需要正确处理**
   - onChunk 会被多次调用
   - onComplete 只在流结束时调用一次

4. **错误会抛出异常**
   - 始终使用 try-catch 包裹 API 调用

5. **配置可以随时更改**
   - 调用 configure() 可以更新配置
   - 调用 selectAdapter() 可以切换适配器
