# 核心业务模型层设计文档

> 本文档描述系统的核心业务模型设计，所有模型完全协议无关，不包含任何 API 标准相关的字段。

**最后更新**: 2026-05-12  
**版本**: v1.0.0

---

## 目录

- [1. 设计原则](#1-设计原则)
- [2. 模型概览](#2-模型概览)
- [3. 详细设计](#3-详细设计)
- [4. 使用示例](#4-使用示例)
- [5. 与 Adapter 层的协作](#5-与-adapter-层的协作)

---

## 1. 设计原则

### 1.1 协议无关性

所有业务模型**完全不包含**任何 API 标准相关的字段：

❌ **禁止的字段**：
- `tool_calls` (OpenAI)
- `tool_call_id` (OpenAI)
- `additional_kwargs` (LangChain)
- OpenAI 多模态格式 `{type: 'image_url', image_url: {...}}`

✅ **使用的字段**：
- `toolIntentions` (业务概念)
- `toolResultRef` (业务关联)
- `metadata` (通用元数据)
- `MediaContent` 数组 (业务模型)

### 1.2 职责分离

| 层级 | 职责 | 示例 |
|------|------|------|
| **Model 层** | 定义业务实体结构和行为 | Message, Session, Model, MediaContent, ToolIntention |
| **Adapter 层** | 业务模型 ↔ API 格式转换 | LMStudioAdapter, OpenAIAdapter |
| **Controller 层** | 编排业务流程 | ChatController, ToolController |

### 1.3 节流渲染机制

Message 模型内置节流渲染控制，避免流式响应时 UI 更新过于频繁：

```javascript
// 默认节流间隔：50ms（20fps）
message.setRenderThrottle(50);

// 在流式接收时检查是否应该渲染
if (message.shouldRender()) {
  renderCallback(); // 触发 UI 更新
}

// 最终更新时强制渲染
message.forceRender();
```

---

## 2. 模型概览

### 2.1 核心模型列表

| 模型 | 文件 | 职责 |
|------|------|------|
| **Model** | `Model.js` | AI 模型能力描述 |
| **MediaContent** | `MediaContent.js` | 多媒体内容 |
| **ToolIntention** | `ToolIntention.js` | 工具调用意图 |
| **Message** | `Message.js` | 聊天消息 |
| **Session** | `Session.js` | 对话会话 |

### 2.2 模型关系图

```
Session
  ├─ messages: Array<Message>
  ├─ enabledTools: { [toolName]: boolean }
  └─ _activeRequest - 用于取消请求

Message
  ├─ content: string | Array<MediaContent>
  ├─ toolIntentions: Array<ToolIntention>
  ├─ toolResultRef: string (关联的工具意图 ID)
  └─ metadata.thinkingProcess - 思考过程

ToolIntention
  ├─ toolName: string
  ├─ parameters: Object
  ├─ status: pending/executing/completed/failed
  └─ result/error - 执行结果

MediaContent
  ├─ type: text/image/audio/file
  ├─ dataUrl | url - 数据源
  └─ filename/mimeType/size - 元数据

Model
  ├─ capabilities: { vision, toolUse, streaming, reasoning }
  ├─ inputModalities: ['text', 'image', 'audio']
  ├─ outputModalities: ['text']
  ├─ contextLength: number
  ├─ quantization: string (Q4_K_M, 4bit, etc.)
  └─ state: loaded/not-loaded/loading
```

---

## 3. 详细设计

### 3.1 Model - AI 模型能力描述

**文件**: `sidepanel/modules/core/models/Model.js`

**设计依据**: 基于 LM Studio `/api/v1/models` 响应格式

**核心字段**:

```javascript
{
  id: 'qwen2-vl-7b-instruct',           // 模型唯一标识
  name: 'Qwen2-VL-7B-Instruct',         // 显示名称
  type: 'vlm',                          // 模型类型: llm | vlm | embeddings
  publisher: 'mlx-community',           // 发布者
  architecture: 'qwen2_vl',             // 架构类型
  capabilities: {
    vision: true,                       // 视觉支持
    toolUse: true,                      // 工具调用
    streaming: true,                    // 流式响应
    reasoning: false                    // 思考过程
  },
  inputModalities: ['text', 'image'],   // 输入模态
  outputModalities: ['text'],           // 输出模态
  contextLength: 32768,                 // 上下文长度（tokens）
  quantization: '4bit',                 // 量化等级
  compatibilityType: 'mlx',             // 兼容类型: gguf | mlx
  state: 'not-loaded',                  // 加载状态
  sizeBytes: 4294967296,                // 文件大小（字节）
  paramsString: '7B'                    // 参数字符串
}
```

**关键方法**:

```javascript
// 能力检查
model.isVisionModel()              // 是否为视觉语言模型
model.isEmbeddingModel()           // 是否为嵌入模型
model.isMultimodal()               // 是否为多模态模型
model.supportsToolUse()            // 是否支持工具调用
model.supportsStreaming()          // 是否支持流式
model.supportsInputModality('image') // 是否支持某种输入模态

// 状态查询
model.isLoaded()                   // 是否已加载到内存

// 格式化显示
model.getParamsString()            // "7B", "13B", "70B"
model.getQuantizationLabel()       // "4-bit", "8-bit", "FP16"
model.getSizeLabel()               // "4.0 GB", "512 MB"
```

---

### 3.2 MediaContent - 多媒体内容

**文件**: `sidepanel/modules/core/models/MediaContent.js`

**核心字段**:

```javascript
{
  type: 'image',                    // text | image | audio | file
  text: null,                       // 文本内容（type='text' 时必需）
  dataUrl: 'data:image/png;base64,...', // base64 数据 URL
  url: 'https://example.com/image.png', // 远程 URL
  filename: 'image.png',            // 文件名
  mimeType: 'image/png',            // MIME 类型
  size: 102400,                     // 文件大小（字节）
  metadata: {}                      // 额外元数据
}
```

**工厂方法**:

```javascript
// 创建文本
MediaContent.createText('Hello')

// 创建图片
MediaContent.createImage('data:image/png;base64,...', {
  filename: 'screenshot.png',
  mimeType: 'image/png'
})

// 创建音频
MediaContent.createAudio('https://example.com/audio.mp3', {
  filename: 'recording.mp3'
})
```

**实用方法**:

```javascript
media.isText()          // 判断类型
media.isImage()
media.isAudio()
media.isFile()

media.getDisplayText()  // 获取显示文本："图片: screenshot.png"
media.getSource()       // 获取数据源（优先 dataUrl，其次 url）
```

---

### 3.3 ToolIntention - 工具调用意图

**文件**: `sidepanel/modules/core/models/ToolIntention.js`

**核心字段**:

```javascript
{
  id: 'call_abc123',                // 唯一标识
  toolName: 'web_search',           // 工具名称
  parameters: { query: '美国新闻' }, // 工具参数
  status: 'pending',                // pending | executing | completed | failed
  result: null,                     // 执行结果（完成后填充）
  error: null,                      // 错误信息（失败时填充）
  createdAt: 1234567890,            // 创建时间戳
  completedAt: null                 // 完成时间戳
}
```

**状态流转**:

```
pending → executing → completed
                    ↘ failed
```

**生命周期方法**:

```javascript
intention.markAsExecuting()     // 标记为执行中
intention.markAsCompleted(result) // 标记为完成
intention.markAsFailed(error)   // 标记为失败

intention.isCompleted()         // 检查状态
intention.isFailed()
intention.isExecuting()
```

---

### 3.4 Message - 聊天消息

**文件**: `sidepanel/modules/core/models/Message.js`

**核心字段**:

```javascript
{
  id: 'msg_xyz789',               // 唯一标识
  role: 'assistant',              // user | assistant | system | tool
  content: 'Hello',               // string | Array<MediaContent>
  toolIntentions: [],             // Array<ToolIntention>
  toolResultRef: null,            // 关联的工具意图 ID（仅 tool 角色）
  metadata: {
    timestamp: 1234567890,        // 时间戳
    thinkingProcess: '...'        // 思考过程
  }
}
```

**节流渲染机制**:

```javascript
// 配置节流间隔（默认 50ms）
message.setRenderThrottle(50);

// 检查是否应该渲染
if (message.shouldRender()) {
  // 距离上次渲染已超过 50ms，可以渲染
  renderCallback();
} else {
  // 更新被节流，标记为待处理
  console.log('Update throttled');
}

// 强制渲染（忽略节流）
message.forceRender();

// 检查是否有待处理的更新
if (message.hasPendingUpdate()) {
  // 有被节流的更新，需要最终渲染
  message.forceRender();
  renderCallback();
}
```

**实用方法**:

```javascript
// 内容判断
message.isText()                  // 是否为纯文本
message.isMultimodal()            // 是否为多模态
message.hasToolIntentions()       // 是否包含工具调用意图
message.isToolResult()            // 是否为工具结果消息

// 内容提取
message.getTextContent()          // 获取纯文本内容
message.getMediaContents()        // 获取多媒体内容列表

// 序列化
message.toJSON()                  // 转换为普通对象
Message.fromJSON(obj)             // 从普通对象创建实例
```

---

### 3.5 Session - 对话会话

**文件**: `sidepanel/modules/core/models/Session.js`

**核心字段**:

```javascript
{
  id: 'session_001',              // 唯一标识
  title: '讨论 AI 技术',          // 会话标题
  messages: [],                   // Array<Message>
  isLoading: false,               // 是否正在接收响应
  enabledTools: {                 // 启用的工具集合
    web_search: true,
    code_execute: false
  },
  metadata: {
    createdAt: 1234567890,        // 创建时间
    updatedAt: 1234567890         // 更新时间
  }
}
```

**消息管理**:

```javascript
// 添加消息
session.addMessage(message);

// 删除消息（联动删除关联的 tool 消息）
const deletedIndices = session.deleteMessage(index);
// 如果删除的是 assistant 消息且有工具调用意图
// 会自动删除后续的 tool 结果消息

// 查询消息
session.getLastMessage()          // 最后一条消息
session.getLastAssistantMessage() // 最后一条助手消息
```

**请求管理**:

```javascript
// 设置活跃请求（用于取消）
session.setActiveRequest(port);

// 清除活跃请求
session.clearActiveRequest();

// 取消活跃请求
session.cancelActiveRequest();    // 调用 port.disconnect() 或 abort()
```

**工具管理**:

```javascript
// 启用/禁用工具
session.toggleTool('web_search', true);

// 检查工具状态
session.isToolEnabled('web_search');

// 获取所有启用的工具
session.getEnabledToolNames();    // ['web_search', ...]
```

---

## 4. 使用示例

### 4.1 创建多模态消息

```javascript
// 纯文本消息
const textMsg = new Message({
  role: 'user',
  content: '你好'
});

// 多模态消息（文本 + 图片）
const multimodalMsg = new Message({
  role: 'user',
  content: [
    MediaContent.createText('这张图片是什么？'),
    MediaContent.createImage('data:image/png;base64,...', {
      filename: 'screenshot.png'
    })
  ]
});

// 带工具调用意图的助手消息
const assistantMsg = new Message({
  role: 'assistant',
  content: '我来帮你搜索',
  toolIntentions: [
    new ToolIntention({
      id: 'call_001',
      toolName: 'web_search',
      parameters: { query: 'AI 技术' },
      status: 'pending'
    })
  ]
});

// 工具结果消息
const toolMsg = new Message({
  role: 'tool',
  content: '搜索结果：...',
  toolResultRef: 'call_001'
});
```

### 4.2 流式响应与节流渲染

```javascript
// 创建空的助手消息占位符
const assistantMsg = new Message({
  role: 'assistant',
  content: ''
});

session.addMessage(assistantMsg);

// 流式接收时
port.onMessage.addListener((chunk) => {
  // 更新消息内容
  assistantMsg.content += chunk.content;
  
  // 检查是否应该渲染（节流控制）
  if (assistantMsg.shouldRender()) {
    // 触发 UI 更新
    renderMessages();
  }
});

// 流结束时强制渲染
port.onDisconnect.addListener(() => {
  assistantMsg.forceRender();
  renderMessages();
});
```

### 4.3 工具调用流程

```javascript
// 1. AI 返回工具调用意图
const assistantMsg = session.getLastAssistantMessage();

// 2. 遍历工具意图并执行
for (const intention of assistantMsg.toolIntentions) {
  // 标记为执行中
  intention.markAsExecuting();
  renderMessages(); // 显示"执行中..."
  
  try {
    // 执行工具
    const tool = toolManager.getTool(intention.toolName);
    const result = await tool.execute(intention.parameters);
    
    // 标记为完成
    intention.markAsCompleted(result);
    
    // 创建工具结果消息
    const toolMsg = new Message({
      role: 'tool',
      content: typeof result === 'string' ? result : JSON.stringify(result),
      toolResultRef: intention.id
    });
    
    session.addMessage(toolMsg);
    renderMessages(); // 显示工具结果
    
  } catch (error) {
    // 标记为失败
    intention.markAsFailed(error);
    renderMessages(); // 显示错误信息
  }
}

// 3. 自动触发下一轮对话
await sendNextRound(session);
```

### 4.4 模型能力检查

```javascript
// 从 API 获取模型列表
const models = await adapter.fetchModels(apiEndpoint, apiKey);

// 过滤出支持视觉的模型
const visionModels = models.filter(m => m.isVisionModel());

// 过滤出支持工具调用的模型
const toolModels = models.filter(m => m.supportsToolUse());

// 获取已加载的模型
const loadedModels = models.filter(m => m.isLoaded());

// 显示模型信息
models.forEach(model => {
  console.log(`${model.name} (${model.getParamsString()}, ${model.getQuantizationLabel()}, ${model.getSizeLabel()})`);
  // 输出: "Qwen2-VL-7B-Instruct (7B, 4-bit, 4.0 GB)"
});
```

---

## 5. 与 Adapter 层的协作

### 5.1 业务模型 → API 格式

Adapter 负责将业务模型转换为特定 API 标准的格式：

```javascript
// LMStudioAdapter.buildRequestBody()
buildRequestBody(params) {
  // params.messages 是业务模型的 Message 数组
  
  // 转换为 LM Studio 原生格式
  const lmMessages = params.messages.map(msg => {
    const base = { role: msg.role };
    
    // 转换 content
    if (msg.isMultimodal()) {
      // MediaContent 数组 → LM Studio 格式
      base.input = msg.content.map(mc => this.convertMediaContent(mc));
    } else {
      base.input = [{ type: 'text', text: msg.content }];
    }
    
    // 转换工具调用意图
    if (msg.toolIntentions.length > 0) {
      base.tool_calls = msg.toolIntentions.map(ti => ({
        tool: ti.toolName,
        arguments: ti.parameters
      }));
    }
    
    return base;
  });
  
  return {
    model: params.model,
    input: lmMessages,
    stream: params.stream
  };
}
```

### 5.2 API 格式 → 业务模型

```javascript
// LMStudioAdapter.parseResponse()
parseResponse(data) {
  // LM Studio 原生格式 → 业务模型
  
  // 解析工具调用
  const toolCalls = data.output?.filter(item => item.type === 'tool_call') || [];
  const toolIntentions = toolCalls.map(tc => 
    new ToolIntention({
      id: tc.tool,
      toolName: tc.tool,
      parameters: tc.arguments,
      status: 'pending'
    })
  );
  
  // 解析内容
  const messageOutput = data.output?.find(item => item.type === 'message');
  const content = messageOutput?.content || '';
  
  // 创建业务模型
  return new Message({
    role: 'assistant',
    content: content,
    toolIntentions: toolIntentions,
    metadata: {
      thinkingProcess: data.output
        ?.filter(item => item.type === 'reasoning')
        .map(r => r.content)
        .join('')
    }
  });
}
```

### 5.3 模型列表转换

```javascript
// LMStudioAdapter.enrichModelData()
enrichModelData(lmsModel) {
  // LM Studio API 响应 → 业务 Model
  
  return new Model({
    id: lmsModel.key || lmsModel.id,
    name: lmsModel.display_name || lmsModel.name,
    type: lmsModel.type || 'llm',
    publisher: lmsModel.publisher || 'local',
    architecture: lmsModel.architecture,
    capabilities: {
      vision: lmsModel.capabilities?.vision || false,
      toolUse: lmsModel.capabilities?.trained_for_tool_use || false,
      reasoning: lmsModel.capabilities?.reasoning || false
    },
    inputModalities: lmsModel.architecture?.input_modalities || ['text'],
    outputModalities: lmsModel.architecture?.output_modalities || ['text'],
    contextLength: lmsModel.max_context_length || 8192,
    quantization: lmsModel.quantization,
    compatibilityType: lmsModel.compatibility_type,
    state: lmsModel.state || 'not-loaded',
    sizeBytes: lmsModel.size_bytes,
    paramsString: lmsModel.params_string
  });
}
```

---

## 附录

### A. 字段对照表

| 业务模型字段 | OpenAI 字段 | Anthropic 字段 | LM Studio 字段 |
|------------|------------|---------------|---------------|
| `toolIntentions` | `tool_calls` | N/A | `output[].type='tool_call'` |
| `toolResultRef` | `tool_call_id` | N/A | N/A |
| `metadata.thinkingProcess` | `additional_kwargs.reasoning_content` | `thinking` | `output[].type='reasoning'` |
| `MediaContent` (image) | `{type: 'image_url', ...}` | `{type: 'image', ...}` | 自定义格式 |
| `contextLength` | N/A | `max_tokens` | `max_context_length` |

### B. 相关文件

- `sidepanel/modules/core/models/Model.js`
- `sidepanel/modules/core/models/MediaContent.js`
- `sidepanel/modules/core/models/ToolIntention.js`
- `sidepanel/modules/core/models/Message.js`
- `sidepanel/modules/core/models/Session.js`
- `sidepanel/src/adapters/lm-studio/LMStudioAdapter.js`

---

**维护者**: Lingma  
**更新频率**: 每次模型结构调整后同步更新此文档
