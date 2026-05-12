# API 适配器架构

## 概述

本项目采用独立的 API 适配器架构，每个 API 标准都有自己独立的实现文件夹。这种设计使得：

1. **清晰的职责分离**：每个适配器只负责自己的 API 标准
2. **易于扩展**：添加新的 API 标准只需创建新文件夹
3. **独立维护**：修改某个适配器不会影响其他适配器
4. **统一的接口**：通过 AdapterManager 提供统一的管理接口

## 目录结构

```
adapters/
├── openai/              # OpenAI 标准适配器
│   └── OpenAIAdapter.js
├── lm-studio/          # LM Studio 适配器
│   └── LMStudioAdapter.js
├── ollama/             # Ollama 适配器
│   └── OllamaAdapter.js
├── openrouter/         # OpenRouter 适配器
│   └── OpenRouterAdapter.js
├── anthropic/          # Anthropic Claude 适配器
│   └── AnthropicAdapter.js
└── AdapterManager.js   # 统一的适配器管理器
```

## 适配器接口

每个适配器必须实现以下接口：

### 核心方法

- `configure(config)` - 配置适配器
- `buildUrl(path)` - 构建 API URL
- `buildHeaders(customHeaders)` - 构建请求头
- `formatMessages(messages)` - 格式化聊天消息
- `buildRequestBody(params)` - 构建请求体
- `parseResponse(data)` - 解析响应
- `parseStreamChunk(data)` - 解析流式片段

### 可选方法

- `getModelsEndpoint()` - 获取模型列表端点
- `fetchModels(apiEndpoint, apiKey)` - 拉取模型列表
- `detectCapabilities(modelName)` - 检测模型能力

## 使用示例

### 1. 通过 AdapterManager 选择适配器

```javascript
// 选择适配器
window.AdapterManager.select('openai');

// 配置适配器
window.AdapterManager.configure({
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  defaultModel: 'gpt-4'
});

// 拉取模型列表
const models = await window.AdapterManager.fetchModels(
  'https://api.openai.com/v1',
  'your-api-key'
);

// 检测模型能力
const capabilities = await window.AdapterManager.detectCapabilities('gpt-4');
```

### 2. 在 Agent 中使用

```javascript
const agent = new Agent();

// 注册提供商（自动使用适配器）
agent.registerProvider('default', {
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  defaultModel: 'gpt-4',
  adapterType: 'openai'  // 指定适配器类型
});

agent.setProvider('default');

// 发送请求（自动使用适配器）
const response = await agent.invoke([
  { role: 'user', content: 'Hello!' }
], {
  model: 'gpt-4',
  temperature: 0.7
});
```

### 3. 在 ModelManager 中使用

```javascript
const modelManager = new ModelManager();

// 拉取模型列表（自动使用对应的适配器）
const models = await modelManager.fetchModels(
  'your-api-key',
  'https://api.openai.com/v1',
  'openai'  // 指定 API 标准
);
```

## 支持的 API 标准

### 1. OpenAI (`openai`)

- **端点**: `https://api.openai.com/v1`
- **认证**: Bearer Token
- **模型端点**: `/v1/models`
- **聊天端点**: `/chat/completions`

### 2. LM Studio (`lm-studio`)

- **端点**: `http://localhost:1234/v1`
- **认证**: 无需认证
- **模型端点**: `/v1/models` 或 `/api/v1/models`
- **聊天端点**: `/v1/chat/completions`

### 3. Ollama (`ollama`)

- **端点**: `http://localhost:11434`
- **认证**: 无需认证
- **模型端点**: `/api/tags`
- **聊天端点**: `/api/chat`
- **特殊**: 使用不同的请求/响应格式

### 4. OpenRouter (`openrouter`)

- **端点**: `https://openrouter.ai/api/v1`
- **认证**: Bearer Token
- **额外头**: `HTTP-Referer`, `X-Title`
- **模型端点**: `/v1/models` 或 `/api/v1/models`
- **聊天端点**: `/chat/completions`

### 5. Anthropic (`anthropic`)

- **端点**: `https://api.anthropic.com/v1`
- **认证**: `x-api-key` 头
- **版本**: `anthropic-version: 2023-06-01`
- **模型端点**: 无公开 API（使用预定义列表）
- **聊天端点**: `/messages`
- **特殊**: System 消息单独处理，max_tokens 必需

## 添加新的适配器

要添加新的 API 标准适配器：

1. 在 `adapters/` 下创建新文件夹，如 `my-api/`
2. 创建适配器类文件 `MyApiAdapter.js`
3. 实现所有必需的接口方法
4. 导出到全局：`window.MyApiAdapter = MyApiAdapter;`
5. 在 `sidepanel.html` 中添加 script 引用
6. AdapterManager 会自动检测并注册

示例：

```javascript
class MyApiAdapter {
  constructor() {
    this.name = 'my-api';
    this.config = null;
  }

  configure(config) {
    this.config = config;
  }

  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  buildHeaders(customHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      ...customHeaders
    };
  }

  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  buildRequestBody(params) {
    return {
      model: params.model || this.config.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false
    };
  }

  parseResponse(data) {
    const choice = data.choices[0];
    return {
      content: choice.message.content,
      role: choice.message.role,
      finishReason: choice.finish_reason
    };
  }

  parseStreamChunk(data) {
    const choice = data.choices[0];
    if (!choice || !choice.delta) return null;
    
    return {
      content: choice.delta.content || '',
      role: choice.delta.role,
      finishReason: choice.finish_reason
    };
  }

  async fetchModels(apiEndpoint, apiKey) {
    // 实现模型列表拉取逻辑
    const response = await fetch(`${apiEndpoint}/models`);
    const result = await response.json();
    return result.data.map(m => m.id);
  }
}

window.MyApiAdapter = MyApiAdapter;
```

## 优势

1. **模块化**: 每个适配器完全独立，易于理解和维护
2. **可扩展**: 添加新适配器不影响现有代码
3. **类型安全**: 每个适配器有明确的接口契约
4. **测试友好**: 可以单独测试每个适配器
5. **向后兼容**: 保留了原有的回退机制

## 注意事项

- 确保在 HTML 中按正确顺序加载适配器文件（先加载各个适配器，再加载 AdapterManager）
- 适配器应该导出到全局 window 对象，以便 AdapterManager 自动检测
- 所有适配器必须实现相同的接口方法
- 错误处理应该在适配器内部完成，抛出有意义的错误信息
