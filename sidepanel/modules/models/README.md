# 标准化消息数据模型使用指南

基于 free-claude-code 项目的 Anthropic 格式消息结构。

## 核心类

### Message - 标准消息类

```javascript
import { Message, Role } from './modules/models/MessageModels.js';

// 创建用户消息
const userMsg = new Message(Role.USER, '你好');

// 创建助手消息（带工具调用）
const assistantMsg = new Message(Role.ASSISTANT, [
  new TextBlock('让我搜索一下'),
  new ToolUseBlock('call_123', 'search', { query: 'AI news' })
]);

// 创建工具结果消息
const toolMsg = new Message(Role.TOOL, '搜索结果...', {
  tool_call_id: 'call_123'
});
```

### 内容块类型

```javascript
import { 
  TextBlock, 
  ImageBlock, 
  ToolUseBlock, 
  ToolResultBlock,
  ThinkingBlock 
} from './modules/models/MessageModels.js';

// 文本块
const text = new TextBlock('Hello');

// 图片块
const image = new ImageBlock({
  type: 'base64',
  media_type: 'image/png',
  data: 'iVBORw0KGgo...'
});

// 工具调用块
const toolUse = new ToolUseBlock('call_1', 'search', { query: 'test' });

// 工具结果块
const toolResult = new ToolResultBlock('call_1', 'Results...');

// 思考块
const thinking = new ThinkingBlock('Let me think...');
```

### Tool - 工具定义

```javascript
import { Tool } from './modules/models/MessageModels.js';

const searchTool = new Tool(
  'search',
  'Search the web',
  {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query']
  }
);
```

## 格式转换

### OpenAI ↔ Anthropic

```javascript
// OpenAI 格式转 Anthropic
const openaiMsg = {
  role: 'assistant',
  content: '',
  tool_calls: [{
    id: 'call_1',
    type: 'function',
    function: {
      name: 'search',
      arguments: '{"query":"test"}'
    }
  }]
};

const anthropicMsg = Message.fromOpenAIMessage(openaiMsg);

// Anthropic 格式转 OpenAI
const backToOpenAI = anthropicMsg.toOpenAIFormat();
```

### 请求构建

```javascript
import { MessagesRequest, ThinkingConfig } from './modules/models/MessageModels.js';

const request = new MessagesRequest({
  model: 'gpt-4',
  messages: [userMsg, assistantMsg],
  system: 'You are a helpful assistant',
  max_tokens: 2000,
  temperature: 0.7,
  tools: [searchTool],
  thinking: new ThinkingConfig(true, 1000)
});

// 验证请求
request.validate();

// 转换为 API 请求体
const body = request.toRequestBody();
```

## 实用方法

```javascript
// 检查是否包含工具调用
if (msg.hasToolCalls()) {
  const calls = msg.getToolCalls();
  console.log('Tool calls:', calls);
}

// 序列化工具结果
const serialized = ToolResultBlock.serializeContent(result);
```

## 与现有代码集成

### 在 message-sender.js 中使用

```javascript
import { Message, MessagesRequest } from '../modules/models/MessageModels.js';

async function sendMessage(text) {
  const userMsg = new Message('user', text);
  
  const request = new MessagesRequest({
    model: settings.model,
    messages: [userMsg],
    max_tokens: settings.maxTokens,
    temperature: settings.temperature
  });
  
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.toRequestBody())
  });
}
```

### 在 chat-refactored.js 中使用

```javascript
import { Message } from '../modules/models/MessageModels.js';

// 添加消息到会话
const msg = new Message('assistant', response.content, {
  tool_calls: response.tool_calls
});

sessionManager.addMessage(sessionId, msg);
```

## 优势

1. **类型安全** - 明确的类定义，避免字段拼写错误
2. **格式统一** - 支持 Anthropic 和 OpenAI 双向转换
3. **易于扩展** - 新增内容块类型只需添加新类
4. **完整验证** - 请求验证确保数据完整性
5. **清晰语义** - 类名和方法名表达明确意图

## 迁移计划

逐步将现有代码迁移到新模型：

1. ✅ 创建 MessageModels.js
2. ⏳ 在 message-sender.js 中使用新模型
3. ⏳ 在 chat-refactored.js 中使用新模型
4. ⏳ 在 tool-executor.js 中使用新模型
5. ⏳ 移除旧的 utils/messageTypes.js
