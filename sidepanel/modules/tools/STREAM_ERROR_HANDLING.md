# 流式异常处理最佳实践

## 问题背景

在实现 OpenAI Tool Calling 时，我们遇到了两个关键问题：

1. **Tool 消息格式不符合 OpenAI 标准** - API 报错 `messages[5]: missing field 'tool_call_id'`
2. **错误信息展示不完整** - 只显示简单的 "❌ 错误"，丢失了关键的调试信息

## 业界最佳实践研究

### 1. Vercel AI SDK 的实现方式

Vercel AI SDK 采用 **fullStream** 模式，将不同类型的响应统一为 parts：

```typescript
// 错误作为流的一部分发送
{
  type: 'error',
  error: {
    message: string,
    code?: string,
    details?: any
  }
}
```

**核心原则**：
- ✅ 错误信息应该完整传递给前端和模型
- ✅ 保持流式响应的结构一致性
- ✅ 区分可恢复错误和不可恢复错误

### 2. OpenCode 的异常处理模式

OpenCode 强调 **ToolPart 状态一致性保证**：

```typescript
// Tool 执行结果必须包含完整的状态
{
  status: 'completed' | 'error',
  result?: any,
  error?: {
    message: string,
    stack?: string,
    originalError?: any
  }
}
```

**核心原则**：
- ✅ 工具执行失败也要作为 tool 消息发送给模型
- ✅ 保留完整的错误上下文（堆栈、原始错误）
- ✅ 流结束后清理未完成的 tool parts

### 3. OpenAI 官方标准要求

根据 [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create) 规范：

**Tool 消息必需字段**：
```json
{
  "role": "tool",
  "tool_call_id": "call_xxx",  // 必需！对应 tool_call 的 ID
  "name": "get_weather",        // 必需！工具名称
  "content": "{\"temp\": 20}"   // 必需！JSON 字符串
}
```

**常见错误**：
- ❌ 缺少 `tool_call_id` → API 拒绝请求
- ❌ 缺少 `name` → API 拒绝请求
- ❌ `content` 不是字符串 → API 拒绝请求

## 我们的修复方案

### 修复 1：保留 Tool 消息的必要字段

**问题代码**（`message-sender.js`）：
```javascript
// ❌ 之前 - 过滤掉了 tool_call_id 和 name
chatMessages = chatMessages.map(msg => {
  const cleanMsg = {
    role: msg.role,
    content: msg.content
  };
  return cleanMsg;
});
```

**修复后**：
```javascript
// ✅ 现在 - 保留所有必要字段
chatMessages = chatMessages.map(msg => {
  const cleanMsg = { role: msg.role };

  if (msg.role === 'assistant') {
    cleanMsg.content = msg.content || '';
    if (msg.tool_calls) {
      cleanMsg.tool_calls = msg.tool_calls;
    }
  } else {
    cleanMsg.content = msg.content;
  }

  // tool 消息的标准字段（OpenAI 要求必须包含）
  if (msg.role === 'tool') {
    if (msg.tool_call_id) cleanMsg.tool_call_id = msg.tool_call_id;
    if (msg.name) cleanMsg.name = msg.name;
  }

  if (msg.additional_kwargs) {
    cleanMsg.additional_kwargs = msg.additional_kwargs;
  }

  return cleanMsg;
});
```

### 修复 2：完整错误信息传递到气泡

**后端改进**（`stream-core.js`）：
```javascript
// ✅ 传递详细的错误信息
port.postMessage({ 
  type: 'error', 
  error: chunkData.error.message || JSON.stringify(chunkData.error),
  code: chunkData.error.code,
  status: chunkData.error.status,
  details: chunkData.error  // 保留完整错误对象
});
```

**前端改进**（`StreamMessageProcessor.js`）：
```javascript
// ✅ 构建详细的错误消息
const errorDetails = [
  `❌ API 错误`,
  '',
  `错误信息: ${msg.error}`,
];

if (msg.code) {
  errorDetails.push(`错误码: ${msg.code}`);
}
if (msg.status) {
  errorDetails.push(`HTTP 状态: ${msg.status}`);
}
if (msg.stack) {
  errorDetails.push('', '堆栈跟踪:', msg.stack);
}

const errorMessage = {
  role: 'assistant',
  content: errorDetails.join('\n')
};
```

**渲染改进**（`ChatMessageRenderer.js`）：
```javascript
// ✅ 显示详细错误信息，支持多行文本
resultContent.style.whiteSpace = 'pre-wrap'; // 保留换行和空格

const errorLines = [
  `工具类型: ${errorType}`,
  `错误信息: ${errorMessage}`,
];

if (errorInfo.stack) {
  errorLines.push('', '堆栈跟踪:', errorInfo.stack);
}
if (errorInfo.originalError) {
  errorLines.push('', '原始错误:', JSON.stringify(errorInfo.originalError, null, 2));
}

resultContent.textContent = errorLines.join('\n');
```

## 对比分析

| 维度 | 修复前 | 修复后 |
|------|--------|--------|
| **Tool 消息格式** | 缺少 `tool_call_id` 和 `name` | 完全符合 OpenAI 标准 |
| **错误信息展示** | 仅显示 "❌ 错误" | 显示完整错误详情（错误码、堆栈等） |
| **API 兼容性** | API 拒绝请求 | API 正常接受 |
| **调试体验** | 无法定位问题 | 快速定位根本原因 |
| **用户体验** | 不知道发生了什么 | 清楚了解错误原因 |

## 关键收获

### 1. 遵循标准的重要性

OpenAI API 对消息格式有严格要求，特别是 tool 消息：
- `tool_call_id` 是关联 assistant 和 tool 消息的关键
- `name` 帮助模型理解哪个工具返回了什么结果
- 缺少任何字段都会导致 API 拒绝整个请求

### 2. 错误处理的层次化设计

参考 Vercel AI SDK 的做法，我们应该分层处理错误：

```
Level 1: 网络层错误（超时、连接失败）
  ↓
Level 2: HTTP 层错误（401、429、500）
  ↓
Level 3: API 业务层错误（参数验证、配额限制）
  ↓
Level 4: 应用层错误（工具执行失败、解析错误）
```

每一层都应该保留足够的上下文信息。

### 3. 流式错误的特殊性

流式响应中的错误处理与普通请求不同：

**普通请求**：
```javascript
try {
  const response = await fetch(...);
  const data = await response.json();
} catch (error) {
  console.error(error);
}
```

**流式请求**：
```javascript
// 错误可能在流的任何位置出现
reader.on('data', (chunk) => {
  if (chunk.error) {
    // 需要将错误作为流的一部分传递给前端
    port.postMessage({ type: 'error', ...chunk.error });
  }
});
```

### 4. 消息清理的最佳实践

清理消息时应该：
- ✅ 按角色分别处理（user、assistant、tool、system）
- ✅ 保留 API 必需的字段
- ✅ 只删除内部使用的字段（如 `reasoning_content`）
- ❌ 不要盲目过滤所有额外字段

## 参考资料

1. [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create)
2. [Vercel AI SDK - Streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming)
3. [OpenCode - Tool Execution](https://github.com/opencode-ai/opencode)
4. [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)

## 后续优化建议

1. **增加错误重试机制** - 对于 5xx 错误自动重试
2. **添加错误监控** - 记录错误率和类型分布
3. **优化错误提示** - 根据错误类型提供用户友好的提示
4. **支持错误恢复** - 允许用户手动重试失败的请求
