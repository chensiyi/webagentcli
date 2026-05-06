# Tool-Call API 标准对照文档

## 概述

本项目支持多种 LLM API 提供商的工具调用功能。由于各家 API 标准存在差异，适配器层负责统一转换。

## OpenAI 标准（参考标准）

### 请求格式

```javascript
{
  model: "gpt-4",
  messages: [
    { role: "user", content: "查询天气" },
    { role: "assistant", tool_calls: [...] },
    { role: "tool", tool_call_id: "call_123", name: "get_weather", content: "..." }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "获取指定城市的天气信息",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "城市名称" }
          },
          required: ["city"]
        }
      }
    }
  ],
  tool_choice: "auto" // 或 "none" 或 { type: "function", function: { name: "get_weather" } }
}
```

### 响应格式

**非流式：**
```javascript
{
  choices: [{
    message: {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"city":"北京"}'
          }
        }
      ]
    }
  }]
}
```

**流式：**
```javascript
// 第一个 chunk
{
  choices: [{
    delta: {
      role: "assistant",
      tool_calls: [{
        index: 0,
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: "" }
      }]
    }
  }]
}

// 后续 chunks（参数增量）
{
  choices: [{
    delta: {
      tool_calls: [{
        index: 0,
        function: { arguments: '{"city"' }
      }]
    }
  }]
}

{
  choices: [{
    delta: {
      tool_calls: [{
        index: 0,
        function: { arguments: ':"北京"}' }
      }]
    }
  }]
}
```

---

## Anthropic Claude 标准

### 主要差异

1. **工具定义格式不同**：使用 `input_schema` 而非 `parameters`
2. **消息格式不同**：tool 结果作为 user 消息的 `tool_result` 内容块
3. **响应格式不同**：工具调用在 `content` 数组中，类型为 `tool_use`

### 请求格式

```javascript
{
  model: "claude-3-opus-20240229",
  system: "系统提示", // system 单独字段，不在 messages 中
  messages: [
    { role: "user", content: "查询天气" },
    { 
      role: "assistant", 
      content: [
        { type: "tool_use", id: "toolu_123", name: "get_weather", input: { city: "北京" } }
      ]
    },
    { 
      role: "user", 
      content: [
        { type: "tool_result", tool_use_id: "toolu_123", content: "晴天，25°C" }
      ]
    }
  ],
  tools: [
    {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      input_schema: { // 注意：不是 parameters
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" }
        },
        required: ["city"]
      }
    }
  ],
  max_tokens: 4096, // 必需参数
  temperature: 0.7
}
```

### 响应格式

**非流式：**
```javascript
{
  content: [
    {
      type: "tool_use",
      id: "toolu_123",
      name: "get_weather",
      input: { city: "北京" }
    }
  ],
  role: "assistant",
  stop_reason: "tool_use"
}
```

**流式：**
```javascript
// content_block_start
{
  type: "content_block_start",
  index: 0,
  content_block: {
    type: "tool_use",
    id: "toolu_123",
    name: "get_weather"
  }
}

// content_block_delta（参数增量）
{
  type: "content_block_delta",
  index: 0,
  delta: {
    type: "input_json_delta",
    partial_json: '{"city":'
  }
}

{
  type: "content_block_delta",
  index: 0,
  delta: {
    type: "input_json_delta",
    partial_json: '"北京"}'
  }
}

// message_delta
{
  type: "message_delta",
  delta: {
    stop_reason: "tool_use"
  }
}
```

### 适配器转换逻辑

**AnthropicAdapter.formatMessages():**
- 将 `role: "tool"` 转换为 `role: "user"` + `content: [{ type: "tool_result", ... }]`
- 提取 `system` 消息到单独的 `system` 字段

**AnthropicAdapter.convertToolsForAnthropic():**
- 将 `function.parameters` 转换为 `input_schema`
- 保持其他字段不变

**AnthropicAdapter.parseResponse():**
- 从 `content` 数组中提取 `type: "tool_use"` 的项
- 转换为 OpenAI 标准格式：`{ id, type: "function", function: { name, arguments } }`

---

## Ollama 标准

### 主要差异

Ollama 完全兼容 OpenAI 格式，但有一些额外字段：

1. 使用 `options.num_predict` 替代 `max_tokens`
2. 响应中的工具调用在 `message.tool_calls` 中

### 请求格式

```javascript
{
  model: "llama3.1",
  messages: [...], // 与 OpenAI 相同
  tools: [...], // 与 OpenAI 相同
  stream: true,
  options: {
    temperature: 0.7,
    num_predict: 2000 // 替代 max_tokens
  }
}
```

### 响应格式

**非流式：**
```javascript
{
  model: "llama3.1",
  message: {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        function: {
          name: "get_weather",
          arguments: '{"city":"北京"}'
        }
      }
    ]
  },
  done: true
}
```

**流式：**
```javascript
{
  model: "llama3.1",
  message: {
    role: "assistant",
    content: "",
    tool_calls: [...]
  },
  done: false
}
```

### 适配器说明

OllamaAdapter 直接使用 OpenAI 标准格式，无需特殊转换。

---

## LM Studio 标准

### 说明

LM Studio 完全兼容 OpenAI API 标准，无需任何转换。

- Endpoint: `http://localhost:1234/v1`
- 格式：与 OpenAI 完全相同
- 认证：通常不需要 API Key

---

## OpenRouter 标准

### 说明

OpenRouter 完全兼容 OpenAI API 标准，但需要额外的请求头：

```javascript
headers: {
  'Authorization': 'Bearer YOUR_API_KEY',
  'HTTP-Referer': 'https://your-site.com',
  'X-Title': 'Your App Name'
}
```

其他格式与 OpenAI 完全相同。

---

## 内部数据流

### 1. 前端准备阶段

```javascript
// BaseToolManager.getOpenAIToolsDefinition()
// 生成 OpenAI 标准格式的工具定义
{
  type: "function",
  function: {
    name: "web_search",
    description: "...",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  }
}
```

### 2. 适配器转换阶段

```javascript
// 根据选择的 API 标准，适配器进行转换

// OpenAI/OpenRouter/LM Studio/Ollama: 直接使用
tools = openaiTools

// Anthropic: 转换格式
tools = anthropicAdapter.convertToolsForAnthropic(openaiTools)
// 结果：
{
  name: "web_search",
  description: "...",
  input_schema: { ... } // parameters → input_schema
}
```

### 3. 消息格式化阶段

```javascript
// 普通消息（OpenAI 标准）
{ role: "user", content: "..." }
{ role: "assistant", tool_calls: [...] }
{ role: "tool", tool_call_id: "...", name: "...", content: "..." }

// Anthropic 转换后
{ role: "user", content: "..." }
{ role: "assistant", content: [{ type: "tool_use", ... }] }
{ role: "user", content: [{ type: "tool_result", tool_use_id: "...", content: "..." }] }
```

### 4. 响应解析阶段

```javascript
// OpenAI 标准响应
adapter.parseResponse(data)
// 返回：{ content, role, toolCalls: [...] }

// Anthropic 响应
anthropicAdapter.parseResponse(data)
// 从 content 数组中提取 tool_use
// 转换为：{ content, role, toolCalls: [...] }（OpenAI 格式）
```

### 5. 前端处理阶段

```javascript
// 所有适配器返回统一的 OpenAI 格式
// StreamMessageProcessor.handleToolCall()
currentMsg.tool_calls = msg.tool_calls // OpenAI 标准格式

// ToolExecutor.executeToolCalls()
const toolCalls = assistantMessage.tool_calls
toolCalls.forEach(call => {
  const toolName = call.function.name
  const args = JSON.parse(call.function.arguments)
  // 执行工具...
})
```

---

## 关键规则

### 1. 内部统一使用 OpenAI 格式

- 所有工具定义、消息、响应在内部都使用 OpenAI 标准格式
- 适配器只在与外部 API 通信时进行转换

### 2. 消息持久化

- Session 中保存的消息使用 OpenAI 标准格式
- 便于在不同 API 提供商之间切换

### 3. 工具执行

- ToolExecutor 始终接收 OpenAI 格式的 `tool_calls`
- 不关心底层使用的是哪个 API 提供商

### 4. 流式处理

- Background 层的流式处理器输出 OpenAI 格式
- 前端接收的是统一的格式

---

## 调试技巧

### 查看适配器转换日志

```javascript
console.log('[AnthropicAdapter] Converting tools:', openaiTools)
console.log('[AnthropicAdapter] Converted to:', anthropicTools)
```

### 查看请求体

```javascript
// 在 adapter.buildRequestBody() 后
console.log('Request body:', JSON.stringify(requestBody, null, 2))
```

### 查看原始响应

```javascript
// 在 adapter.parseResponse() 前
console.log('Raw API response:', JSON.stringify(data, null, 2))
```

---

## 常见问题

### Q1: 为什么 Anthropic 需要特殊处理？

A: Anthropic 使用了不同的设计理念：
- 工具调用是内容的一部分（content block），而不是独立字段
- 工具结果作为用户消息返回，而不是独立的 tool 角色
- 这是为了保持对话的自然流畅性

### Q2: 如何添加新的 API 提供商？

A: 
1. 创建新的适配器类（继承 BaseAdapter 或独立实现）
2. 实现 `formatMessages()`、`buildRequestBody()`、`parseResponse()` 方法
3. 如有必要，添加工具定义转换方法
4. 在 AdapterManager 中注册

### Q3: 工具调用失败怎么办？

A: 检查以下几点：
1. 工具定义是否正确传递给 API
2. 适配器是否正确转换了格式
3. API 返回的错误信息
4. 模型是否支持工具调用功能

---

## 更新记录

- 2026-05-06: 初始版本，完成 5 个适配器的 tool-call 标准化
