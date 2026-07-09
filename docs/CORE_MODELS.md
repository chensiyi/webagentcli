# 数据模型文档

> 与当前代码库（v0.6.6）保持同步

## 概述

本文档描述 Web Agent Client 的核心数据模型，位于 `kernel/models/` 目录（TypeScript）。

**约定**：

- 所有模型类通过 `kernel/index.ts` 统一导出，可在任何 ES module 环境使用
- 业务层 **不使用** 任何特定 AI 协议的字段（如 OpenAI 的 `tool_calls` 数组）—— 协议转换在 `MessageContent.MessageStructure` 中隔离
- 持久化字段通过 `toJSON()` 输出
- 运行时状态（如 `Session.isStreaming`、`Session.port`）**不** 序列化

---

## BaseModel（基类）

**文件**：`kernel/models/BaseModel.ts`

所有持久化模型的抽象基类，**不可直接实例化**（`new.target === BaseModel` 时抛错）。

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | `generateId()` | 唯一标识符 |
| `createdAt` | number | `Date.now()` | 创建时间戳 |
| `updatedAt` | number | `this.createdAt` | 最后更新时间戳 |

### 方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `generateId()` | string | 生成 `prefix_<timestamp>_<random>` 格式 ID（子类可覆盖） |
| `touch()` | void | 更新 `updatedAt = Date.now()` |
| `toJSON()` | object | 序列化（子类覆盖以包含特定字段） |
| `static fromJSON(data)` | Instance | 反序列化（子类必须实现） |

---

## Message（消息）

**文件**：`kernel/models/Message.ts`

### 角色枚举

```typescript
export const Role = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
};
```

`role` 在构造时设定，**不可修改**（`get role()` 暴露）。

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 继承自 BaseModel |
| `role` | string | `Role.USER` | 只读 |
| `content` | string \| Block[] | `''` | 文本或富媒体块数组 |
| `timestamp` | number | `this.createdAt` | 时间戳 |
| `reasoning_content` | string \| null | `null` | 思考/推理内容（可与 content 并存） |
| `toolCallId` | string \| null | `null` | `role === TOOL` 时关联的 ToolCall.id |
| `toolCalls` | `ToolCall[]` | `[]` | **子对象**：assistant 消息携带的工具调用意图 |
| `metadata` | object | `{}` | 附加元数据 |

> ⚠️ **协议字段已隔离**：本模型不再有 `tool_calls`（OpenAI 协议字段名）等协议特定字段。发给 API 时由 `MessageStructure.toAPIFormat()` 转换。

### 方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `addToolCall(toolCall)` | void | 添加工具调用（自动去重：同 id 不重复添加；自动 `touch()`） |
| `getToolCall(id)` | `ToolCall \| null` | 按 id 查找 |
| `isRichContent()` | boolean | `content` 是否为块数组 |
| `getText()` | string | 提取所有 text 块（双换行拼接） |
| `hasToolCalls()` | boolean | `toolCalls.length > 0` |
| `isUser()` / `isAssistant()` / `isSystem()` / `isTool()` | boolean | 角色判断 |
| `toJSON()` | object | 序列化（`toolCalls` 嵌套展开为 `tc.toJSON()`） |
| `static fromJSON(data)` | `Message` | 反序列化 |

### 消息示例

**用户消息**：
```json
{
  "id": "message_1713369600000_abc123",
  "role": "user",
  "content": "帮我写一个 Python 脚本",
  "timestamp": 1713369600000,
  "reasoning_content": null,
  "toolCallId": null,
  "toolCalls": [],
  "metadata": {}
}
```

**助手消息（含工具调用）**：
```json
{
  "id": "message_1713369601000_def456",
  "role": "assistant",
  "content": "我来帮你搜索一下",
  "timestamp": 1713369601000,
  "reasoning_content": "用户需要一个 Python 脚本",
  "toolCallId": null,
  "toolCalls": [
    {
      "id": "call_abc123",
      "toolName": "search",
      "arguments": { "query": "Python script" }
    }
  ]
}
```

**工具结果消息**：
```json
{
  "id": "message_1713369602000_ghi789",
  "role": "tool",
  "content": "[搜索结果] ...",
  "timestamp": 1713369602000,
  "toolCallId": "call_abc123",
  "toolCalls": []
}
```

---

## Session（会话）

**文件**：`kernel/models/Session.ts`

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 继承自 BaseModel |
| `title` | string | `'新对话'` | 会话标题 |
| `messages` | `Message[]` | `[]` | 消息列表（**每条消息自带 `toolCalls`**） |
| `metadata` | object | `{}` | 附加元数据 |
| `reasoningEffort` | string | `'medium'` | 思考模式 `'off' \| 'low' \| 'medium' \| 'high'` |
| `port` | object \| null | `null` | 运行时端口（**不持久化**） |
| `isStreaming` | boolean | `false` | 是否正在流式（**不持久化**） |

### 消息管理方法

| 方法 | 说明 |
|------|------|
| `addMessage(message)` | 添加消息并 `touch()` |
| `removeMessage(messageId)` | 按 id 删除，返回 boolean |
| `updateMessage(messageId, updater)` | 函数式更新（`updater(msg)`；返回新对象会替换） |
| `getLastMessage()` | 返回最后一条消息或 null |
| `clearMessages()` | 清空所有消息 |
| `hasMessages()` | 是否存在消息 |

### ToolCall 视图方法（不存储，只查询）

`ToolCall` 始终作为 `Message.toolCalls` 的子对象存在；Session 仅提供查询视图：

| 方法 | 返回 | 说明 |
|------|------|------|
| `getAllToolCalls()` | `ToolCall[]` | 遍历所有消息收集全部 toolCalls |
| `getToolCallsOfMessage(messageId)` | `ToolCall[]` | 获取指定消息的 toolCalls |
| `findToolCall(toolCallId)` | `ToolCall \| null` | 跨消息查找 |
| `hasToolCalls()` | boolean | 是否存在任意 toolCall |
| `getToolResultMessages()` | `Message[]` | 所有 `role === TOOL` 的消息 |
| `getPendingToolCalls()` | `ToolCall[]` | **未** 被 ToolResult 消息回应的 ToolCall（用于判断是否需要继续轮询 AI） |

### 序列化

```typescript
toJSON() {
  return {
    ...super.toJSON(),
    title, messages: messages.map(m => m.toJSON()),
    metadata, reasoningEffort
    // port / isStreaming 不会输出
  };
}
```

---

## Settings（设置）

**文件**：`kernel/models/Settings.ts`

设置是单例（`id` 固定为 `'global_settings'`），由 `SettingsManager` 加载/保存。

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | `'global_settings'` | 固定 |
| `apiStandard` | string | `'openrouter'` | `'openai' \| 'openrouter' \| 'lm-studio' \| 'ollama' \| 'anthropic'` |
| `apiKey` | string | `''` | API 密钥 |
| `apiEndpoint` | string | `'https://openrouter.ai/api/v1'` | 端点 URL |
| `model` | string | `''` | 当前模型 id |
| `models` | array | `[]` | 已加载模型列表 |
| `temperature` | number | `0.7` | 温度 |
| `maxTokens` | number | `2000` | 最大生成长度 |
| `systemPrompt` | string | `''` | 系统提示词 |
| `autoContextTruncation` | boolean | `true` | 自动上下文截断 |
| `reasoningEffort` | string | `'medium'` | `'off' \| 'low' \| 'medium' \| 'high'` |
| `theme` | string | `'light'` | `'light' \| 'dark'` |

### 方法

| 方法 | 说明 |
|------|------|
| `isReasoningEnabled()` | `reasoningEffort !== 'off'` |
| `static getDefaultEndpoint(apiStandard)` | 返回标准默认端点 |

### 默认端点

| API 标准 | 默认端点 |
|----------|----------|
| `openai` | `https://api.openai.com/v1` |
| `openrouter` | `https://openrouter.ai/api/v1` |
| `lm-studio` | `http://localhost:1234` |
| `ollama` | `http://localhost:11434` |
| `anthropic` | `https://api.anthropic.com` |

---

## Model（AI 模型）

**文件**：`kernel/models/Model.ts`

**协议无关** 的 AI 模型元数据，参考 LM Studio `/api/v1/models` 响应格式设计。

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | **必填** | 唯一标识符 |
| `name` | string | **必填** | 显示名称 |
| `type` | string | `'llm'` | `'llm' \| 'vlm' \| 'embeddings'` |
| `publisher` | string | `'unknown'` | 发布者 |
| `architecture` | string \| null | `null` | `'llama'`、`'qwen2_vl'`、`'nomic-bert'` 等 |
| `capabilities` | object | `{vision:false, toolUse:true, streaming:true, reasoning:true, jsonMode:false}` | 模型能力 |
| `inputModalities` | string[] | `['text']` | 输入模态 |
| `outputModalities` | string[] | `['text']` | 输出模态 |
| `contextLength` | number | `8192` | 最大上下文（tokens） |
| `maxOutputTokens` | number \| null | `null` | 最大单次输出 |
| `quantization` | string \| null | `null` | 量化等级（`'Q4_K_M'`、`'4bit'` 等） |
| `compatibilityType` | string \| null | `null` | `'gguf'`、`'mlx'` 等 |
| `state` | string | `'not-loaded'` | `'loaded' \| 'not-loaded' \| 'loading'` |
| `sizeBytes` | number \| null | `null` | 文件大小（字节） |
| `paramsString` | string \| null | `null` | 参数量（`'7B'`、`'13B'`、`'70B'`） |
| `description` | string | `''` | 描述 |
| `pricing` | object \| null | `null` | `{ prompt, completion }` |
| `metadata` | object | `{}` | 附加元数据 |

### 能力方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `supportsInputModality(modality)` | boolean | 是否支持某输入模态 |
| `isVisionModel()` | boolean | `type === 'vlm'` 或 vision / image 模态 |
| `isEmbeddingModel()` | boolean | `type === 'embeddings'` |
| `isMultimodal()` | boolean | 多种模态 |
| `supportsToolUse()` | boolean | `capabilities.toolUse && !isEmbedding` |
| `supportsStreaming()` | boolean | `capabilities.streaming` |
| `supportsJsonMode()` | boolean | `capabilities.jsonMode` |
| `supportsReasoning()` | boolean | `capabilities.reasoning` |
| `isLoaded()` | boolean | `state === 'loaded'` |
| `getParamsString()` | string | 参数量或 `'Unknown'` |
| `getQuantizationLabel()` | string | 标准化量化（`'4-bit'` / `'FP16'` / 原值） |
| `getSizeLabel()` | string | 人类可读大小（`'4.2 GB'` / `'512 MB'`） |

### 序列化

`toJSON()` 同时输出 camelCase 和 snake_case 字段以兼容现有 UI：

```json
{
  "id": "qwen2-vl-7b-instruct",
  "name": "Qwen2-VL 7B Instruct",
  "type": "vlm",
  "capabilities": { "vision": true, "toolUse": true, ... },
  "contextLength": 8192,
  "context_length": 8192,
  "input_modalities": ["text", "image"],
  "modality": "text,image->text",
  "supports_reasoning": true,
  "supports_tools": true,
  ...
}
```

---

## Tool（统一工具模型）

**文件**：`kernel/models/Tool.ts`

替代了原来的 `ToolDefinition.ts`、`ToolCall.ts`、`ToolResult.ts` 三个独立文件，整合为同一文件中的三个类。

### ToolCall（工具调用意图）

表示"AI 在某轮希望执行什么工具"，是 `Message.toolCalls` 的子对象。

#### 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识（`call_abc123`） |
| `toolName` | string | 工具名（对应 `Tool.name`） |
| `input` | object | 工具参数 |
| `status` | string | `'pending' \| 'running' \| 'completed' \| 'failed'` |
| `result` | any | 执行结果 |
| `error` | any | 错误信息 |
| `startedAt` | number \| null | 开始时间 |
| `completedAt` | number \| null | 完成时间 |

#### 方法

| 方法 | 说明 |
|------|------|
| `markStarted()` | 标记为运行中 |
| `markCompleted(result)` | 标记为已完成 |
| `markFailed(error)` | 标记为失败 |
| `toJSON()` | 序列化 |
| `static fromJSON(obj)` | 反序列化 |

### ToolResult（工具执行结果）

表示"工具执行得到什么结果"。由 `ToolsManager.invoke()` 统一构造。

#### 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolCallId` | string | 关联的 `ToolCall.id` |
| `status` | string | `'success' \| 'failed' \| 'pending'` |
| `output` | any | 执行输出（任意可序列化值） |
| `error` | string \| null | 错误消息 |
| `duration` | number | 执行耗时（毫秒） |
| `metadata` | object | 附加元数据 |

#### 方法

| 方法 | 说明 |
|------|------|
| `isSuccess()` / `isFailed()` / `isPending()` | 状态判断 |
| `toJSON()` | 序列化 |
| `static fromJSON(obj)` | 反序列化 |
| `static success(toolCallId, output, duration)` | 工厂方法：创建成功结果 |
| `static failed(toolCallId, error, duration)` | 工厂方法：创建失败结果 |

### Tool（工具定义 + 执行器）

**核心工具类**。一个 `Tool` 对象即包含工具定义（供 LLM 识别），也包含执行能力（handler）。替代了原来的 `ToolDefinition` + `IToolService` 组合。

#### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | `''` | 工具唯一名 |
| `description` | string | `''` | 工具描述（LLM 可见） |
| `capabilities` | string[] | `[]` | 能力标签 |
| `inputSchema` | object | `null` | JSON Schema（OpenAI function calling 格式） |
| `outputSchema` | object | `null` | 输出 schema |
| `enabled` | boolean | `true` | 是否启用 |
| `handler` | function | `null` | 工具执行函数 `(args, context) => Promise<output>` |
| `metadata` | object | `{}` | 附加元数据 |

#### 方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `toOpenAIFunction()` | object | 序列化为 OpenAI 协议格式 `{ type: 'function', function: { name, description, parameters } }` |

#### 工具实现示例

```typescript
class MyTool extends Tool {
  constructor() {
    super({
      name: 'my_tool',
      description: '我的工具',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: '参数1' }
        },
        required: ['param1']
      },
      handler: async (args, context) => {
        // args = 从 LLM 传入的参数
        // context = { sessionId, tabId, kernel }
        return `处理结果: ${args.param1}`;
      }
    });
  }
}
```

---

## Process（进程）

**文件**：`kernel/models/Process.ts`

表示一个可管理的子任务/进程，具有完整的生命周期状态机。

### 状态枚举

```typescript
export const ProcessState = {
  CREATED: 'created',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};
```

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 继承自 BaseModel |
| `goal` | string | **必填** | 任务目标描述 |
| `state` | string | `'created'` | 当前状态 |
| `parentProcessId` | string \| null | `null` | 父进程 ID（支持子任务层级） |
| `sessionId` | string \| null | `null` | 关联的会话 ID |
| `output` | any | `null` | 任务输出 |
| `error` | string \| null | `null` | 错误信息 |
| `startedAt` | number \| null | `null` | 开始时间戳 |
| `completedAt` | number \| null | `null` | 完成时间戳 |

### 状态机

```
CREATED → RUNNING → COMPLETED
                 → FAILED
                 → CANCELLED
```

### 方法

| 方法 | 说明 |
|------|------|
| `start()` | 启动（CREATED → RUNNING，记录 startedAt） |
| `complete(output?)` | 完成（RUNNING → COMPLETED，记录 output + completedAt） |
| `fail(error)` | 失败（RUNNING → FAILED，记录 error） |
| `cancel()` | 取消（任意状态 → CANCELLED） |
| `isActive()` | `state === 'created' \|\| state === 'running'` |
| `isTerminal()` | `state === 'completed' \|\| state === 'failed' \|\| state === 'cancelled'` |
| `toJSON()` | 序列化 |
| `static fromJSON(data)` | 反序列化 |

---

## MessageContent（消息内容与请求）

**文件**：`kernel/models/MessageContent.ts`

**所有内容导出到 `MessageContent` 命名空间**。

### 内容块（Block）

| 类 | 字段 | 用途 |
|----|------|------|
| `TextBlock` | `type='text'`, `text` | 纯文本 |
| `ImageBlock` | `type='image'`, `source` | 图片（`{ type, media_type, data }`） |
| `ToolUseBlock` | `type='tool_use'`, `id`, `name`, `input` | 工具调用意图 |
| `ToolResultBlock` | `type='tool_result'`, `tool_use_id`, `content` | 工具结果 |
| `ThinkingBlock` | `type='thinking'`, `thinking`, `signature` | 思考内容 |

### `ThinkingConfig`（思考模式配置）

```typescript
new ThinkingConfig('medium') // 'off' | 'low' | 'medium' | 'high'
// .effort = 'medium'
// .enabled = true (when effort !== 'off')
// .toAPIFormat() → { type: 'enabled', budget_tokens: 4000 } 或 null
```

### `MessagesRequest`（统一请求对象）

```typescript
new MessagesRequest({
  model: 'gpt-4o',
  messages: [Message, Message, ...],   // Message[] 内部对象
  system: '...',                       // 可选
  maxTokens: 2000,
  temperature: 0.7,
  stream: true,
  thinking: ThinkingConfig | null,     // 思考模式
  tools: [...],                        // OpenAI function calling 格式
  metadata: {}
})
// .validate() 校验 model 与 messages 非空
```

### `MessageStructure`（协议转换工厂）

业务层和 API 层之间的**唯一转换边界**：

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `toAPIFormat(message, standard='openai')` | `Message` | OpenAI 协议字段 | 把 `toolCalls[]` 转为 `tool_calls`，把 `content` 数组转字符串等 |
| `toOpenAIToolCall(toolCall)` | `ToolCall` | `{ id, type, function: { name, arguments } }` | 单个转换 |
| `parseToolCallsFromOpenAI(openAIToolCalls)` | OpenAI `tool_calls` | `ToolCall[]` | 反向解析 |

```typescript
// 示例：组装 API 请求
const apiMessages = session.messages.map(m => MessageStructure.toAPIFormat(m, 'openai'));
const apiRequest = { model, messages: apiMessages, stream: true, tools: [...] };
```

### `MediaContent`（多媒体内容模型）

```typescript
MediaContent.createText('hello')
MediaContent.createImage('data:image/png;base64,...')
MediaContent.createImage('https://example.com/a.png') // 自动识别 data URL
new MediaContent({ type, text, dataUrl, url, filename, mimeType, size, metadata })
// .fromJSON(obj)
```

---

## Scripts（用户脚本）

**文件**：`kernel/models/Scripts.ts`

用户脚本模型，支持 Tampermonkey 风格的元数据解析。

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 唯一标识符 |
| `name` | string | `''` | 脚本名称 |
| `namespace` | string | `'user'` | 命名空间 |
| `version` | string | `'1.0.0'` | 版本号 |
| `description` | string | `''` | 描述 |
| `author` | string | `''` | 作者 |
| `match` | string[] | `[]` | 匹配 URL 规则 |
| `grant` | string[] | `[]` | 授权 API |
| `enabled` | boolean | `true` | 是否启用 |
| `code` | string | `''` | 脚本代码 |
| `createdAt` | number | `Date.now()` | 创建时间 |
| `updatedAt` | number | `this.createdAt` | 更新时间 |

### 方法

| 方法 | 说明 |
|------|------|
| `static parseMetadata(code)` | 解析 `==UserScript==` 块，提取元数据 |
| `toJSON()` | 序列化 |
| `static fromJSON(data)` | 反序列化 |

---

## 模型关系图

```
                    Session (id, title, messages, reasoningEffort)
                       │
                       │ 1
                       │
                       │ N
                       ▼
                    Message (id, role, content, reasoning_content, toolCallId)
                       │
                       │ 0..N (子对象)
                       ▼
                    ToolCall[] (id, toolName, input, status, ...)
                       │
                       │ 1
                       │
                       │ 0..1
                       ▼
                    ToolResult (toolCallId, status, output, error, duration)
                    ⚠️ 不直接挂在 Session 上，由 orchestration/session.ts 按"消息流"
                       写一条 role=tool 的 Message 来表达结果

独立单例：
  Settings   ──── 全局一份（id='global_settings'）
  Model      ──── 来自 Provider /api/v1/models
  Process    ──── 由 ProcessManager 管理生命周期
```

---

## 序列化与持久化

### 流程

```
Model 实例
   │  toJSON()
   ▼
纯 JSON 对象（去除运行时字段）
   │
   ▼
chrome.storage.local.set({ key: json })
   │
   ▼ （重启后）
chrome.storage.local.get(key)
   │
   ▼
Model.fromJSON(json)  // 或 new Model(json)
   │
   ▼
Model 实例
```

### 注意事项

1. **Message**、**Session**、**Settings**、**Model**、**Process**、**Tool**、**ToolCall**、**ToolResult** 全部支持双向序列化
2. **运行时字段**（`Session.isStreaming` / `Session.port`）和 **未设置的 null 字段**（如空字符串的 `reasoning_content`）**不会** 出现在 `toJSON()` 中
3. **Settings** 在 Shell 层初始化时通过 `SettingsManager.loadSettings()` 加载
4. **Session** 在 `SessionManager` 中管理持久化
5. **Process** 在 `ProcessManager` 中管理生命周期
6. **Tool** 由 `ToolsManager` 管理注册和调用