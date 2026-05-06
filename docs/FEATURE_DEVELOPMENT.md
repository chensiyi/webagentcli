# Web Agent Client - 功能开发文档

> 本文档从架构层面描述系统的功能模块，并关联到具体的代码对象和方法。用于快速理解系统功能和定位相关代码。

**最后更新**: 2026-05-06  
**版本**: v1.0.0

---

## 目录

- [1. 核心功能概览](#1-核心功能概览)
- [2. 会话管理功能](#2-会话管理功能)
- [3. AI 对话功能](#3-ai-对话功能)
- [4. 工具调用功能](#4-工具调用功能)
- [5. 多模态处理功能](#5-多模态处理功能)
- [6. 模型管理功能](#6-模型管理功能)
- [7. 用户脚本功能](#7-用户脚本功能)
- [8. 存储管理功能](#8-存储管理功能)
- [9. UI 渲染功能](#9-ui-渲染功能)
- [10. 扩展开发指南](#10-扩展开发指南)

---

## 1. 核心功能概览

### 1.1 功能模块地图

```
Web Agent Client
├─ 会话管理 (SessionManager)
│   ├─ 多会话支持
│   ├─ 消息持久化
│   └─ 流式请求绑定
│
├─ AI 对话 (StreamCore + Adapters)
│   ├─ 流式响应
│   ├─ 多 API 适配
│   └─ 思考模式
│
├─ 工具调用 (ToolManager + ToolExecutor)
│   ├─ 网络搜索
│   ├─ 网页抓取
│   ├─ 代码执行
│   └─ 终端命令
│
├─ 多模态处理 (MediaManager)
│   ├─ 图片上传
│   ├─ 音频录制
│   └─ 视频处理
│
├─ 模型管理 (ModelManager)
│   ├─ 模型列表获取
│   ├─ 能力检测
│   └─ 缓存管理
│
├─ 用户脚本 (UserScriptManager)
│   ├─ 脚本注册
│   ├─ URL 匹配
│   └─ MAIN world 执行
│
└─ UI 渲染 (ChatRenderer + Renderers)
    ├─ 文本渲染
    ├─ 媒体渲染
    └─ 工具卡片渲染
```

### 1.2 功能与代码映射表

| 功能 | 主要模块 | 关键类/方法 | 相关文件 |
|------|---------|------------|---------|
| 会话管理 | SessionManager | `createSession()`, `addMessage()` | `modules/agent/SessionManager.js` |
| 流式对话 | StreamCore | `handleStreamPort()`, `processChunk()` | `background/stream-core.js` |
| API 适配 | AdapterManager | `select()`, `buildRequestBody()` | `modules/agent/adapters/AdapterManager.js` |
| 工具执行 | ToolManager + ToolExecutor | `executeToolCalls()`, `execute()` | `modules/tools/BaseToolManager.js`, `pages/chat/tool-executor.js` |
| 模型管理 | ModelManager | `fetchModels()`, `detectCapabilities()` | `modules/models/ModelManager.js` |
| 用户脚本 | UserScriptManager | `registerScript()`, `unregisterScript()` | `modules/scripts/UserScriptManager.js` |
| 消息渲染 | ChatRenderer | `renderMessages()`, `updateMessageById()` | `pages/chat/components/ChatRenderer.js` |

---

## 2. 会话管理功能

### 2.1 功能描述

**目标**: 支持用户同时存在多个对话会话，每个会话独立维护消息历史和状态。

**核心价值**:
- 多任务并行：用户可以同时与 AI 讨论多个话题
- 状态隔离：切换会话不影响其他会话的进行中请求
- 数据持久化：会话数据自动保存到 `chrome.storage.local`

### 2.2 核心对象

#### SessionManager

**文件**: `sidepanel/modules/agent/SessionManager.js`

**职责**: 
- 管理所有会话的生命周期（创建、切换、删除）
- 维护会话状态（消息列表、加载状态、port 连接）
- 处理消息的增删改查

**关键方法**:

```javascript
// 创建新会话
createSession(sessionId, initialMessages = [])
// 参数: sessionId - 会话唯一标识
//       initialMessages - 初始消息数组（可选）
// 返回: session 对象

// 获取会话
getSession(sessionId)
// 参数: sessionId - 会话 ID
// 返回: session 对象或 null

// 设置当前会话
setCurrentSession(sessionId)
// 参数: sessionId - 要设为当前的会话 ID

// 开始流式请求
startStreamRequest(sessionId, port)
// 参数: sessionId - 会话 ID
//       port - chrome.runtime.Port 对象
// 说明: 将 port 绑定到会话，监听断开事件

// 完成流式请求
completeStreamRequest(sessionId)
// 参数: sessionId - 会话 ID
// 说明: 重置 isLoading 和 port

// 添加消息
addMessage(sessionId, message)
// 参数: sessionId - 会话 ID
//       message - 消息对象 { role, content, ... }
// 说明: 自动为消息生成唯一 ID

// 删除消息及关联 tool 消息
deleteMessageWithTools(sessionId, messageIndex)
// 参数: sessionId - 会话 ID
//       messageIndex - 消息在数组中的索引
// 说明: 
//   - 删除 assistant 消息时，自动删除对应的所有 tool 消息
//   - 删除 tool 消息时，向上查找对应的 assistant，删除整个工具调用组

// 保存所有会话到 storage
saveConversations()
// 说明: 将 this.sessions 序列化后存入 chrome.storage.local

// 从 storage 加载会话
loadConversations()
// 返回: Promise<sessions>
```

**数据结构**:

```javascript
session = {
  id: string,                    // 会话 ID
  messages: Array<Message>,      // 消息列表
  isLoading: boolean,            // 是否正在加载
  port: chrome.runtime.Port|null,// 当前活动的 port
  enabledTools: {                // 启用的工具
    [toolId]: boolean
  },
  createdAt: number,             // 创建时间戳
  updatedAt: number              // 更新时间戳
}

message = {
  id: string,                    // 消息唯一 ID
  role: 'user'|'assistant'|'system'|'tool',
  content: string|Array,         // 消息内容（支持多模态）
  tool_calls?: Array<ToolCall>,  // 工具调用（仅 assistant）
  tool_call_id?: string,         // 工具调用 ID（仅 tool）
  name?: string,                 // 工具名称（仅 tool）
  additional_kwargs?: Object     // 额外数据（如 reasoning_content）
}
```

### 2.3 使用示例

```javascript
// 创建会话
const session = SessionManager.createSession('session_123');

// 添加用户消息
SessionManager.addMessage('session_123', {
  role: 'user',
  content: '你好'
});

// 开始流式请求
const port = chrome.runtime.connect({ name: 'chat-stream' });
SessionManager.startStreamRequest('session_123', port);

// 接收响应时更新消息
SessionManager.updateLastMessage('session_123', 'AI 回复...');

// 完成后
SessionManager.completeStreamRequest('session_123');

// 保存
SessionManager.saveConversations();
```

### 2.4 注意事项

1. **单一数据源**: SessionManager 是会话状态的唯一来源，UI 层不应维护副本
2. **Port 绑定**: 每个会话的 port 独立，切换会话不会断开其他会话的请求
3. **消息联动删除**: 删除 assistant 消息时会自动删除对应的 tool 消息，避免数据不一致
4. **持久化时机**: 每次添加/更新消息后应调用 `saveConversations()`

---

## 3. AI 对话功能

### 3.1 功能描述

**目标**: 实现与 AI 的多轮对话，支持流式响应、思考模式、工具调用等高级特性。

**核心价值**:
- 实时反馈：流式响应让用户立即看到 AI 的思考过程
- 多 API 支持：通过适配器支持 OpenAI、Anthropic、Ollama 等多家提供商
- 智能路由：根据配置自动选择合适的 API 端点

### 3.2 核心对象

#### StreamCore (Background)

**文件**: `sidepanel/background/stream-core.js`

**职责**: 
- 接收前端发送的聊天请求
- 调用 AI API 并处理流式响应
- 将响应逐块转发给前端

**关键方法**:

```javascript
// 处理流式聊天端口连接
handleStreamPort(port)
// 参数: port - chrome.runtime.Port 对象
// 说明: 
//   - 监听 port.onMessage 接收请求参数
//   - 调用 processMessages 处理消息
//   - 调用 fetch 发送 API 请求
//   - 调用 handleStreamResponse 处理流式响应

// 处理消息转换
processMessages(messages, toolsEnabled)
// 参数: messages - 原始消息数组
//       toolsEnabled - 是否启用工具
// 返回: 处理后的消息数组
// 说明:
//   - 清理 reasoning_content（不发送给 API）
//   - 如果工具未启用，将 assistant+tool 消息对转换为普通对话

// 处理流式响应
handleStreamResponse(response, port, isDisconnected)
// 参数: response - fetch 返回的 Response 对象
//       port - 通信端口
//       isDisconnected - 是否已断开
// 说明:
//   - 读取 SSE 流
//   - 逐行解析
//   - 调用 processChunk 处理每个数据块

// 处理单个数据块
processChunk(trimmed, port, accumulatedToolCalls)
// 参数: trimmed - 解析后的 JSON 字符串
//       port - 通信端口
//       accumulatedToolCalls - 累积的 tool_calls 对象
// 说明:
//   - 提取 content、reasoning_content、tool_calls
//   - 累积 tool_calls 片段
//   - 通过 port.postMessage 转发给前端
```

**消息类型**:

```javascript
// chunk - 文本片段
{ type: 'chunk', content: string }

// reasoning - 思考内容
{ type: 'reasoning', reasoning_content: string }

// tool_call - 工具调用
{ type: 'tool_call', tool_calls: Array<ToolCall> }

// complete - 完成
{ type: 'complete' }

// error - 错误
{ type: 'error', error: string }
```

---

#### ProviderAdapter (Frontend)

**文件**: `sidepanel/modules/agent/adapters/AdapterManager.js`

**职责**: 
- 统一管理不同 API 提供商的适配器
- 提供统一的接口供上层调用
- 处理 API 特定的格式转换

**关键方法**:

```javascript
// 选择适配器
select(adapterType)
// 参数: adapterType - 'openai'|'anthropic'|'ollama'|'lm-studio'|'openrouter'

// 配置适配器
configure(config)
// 参数: config - { endpoint, apiKey, defaultModel }

// 构建 API URL
buildUrl(path)
// 参数: path - API 路径（如 '/chat/completions'）
// 返回: 完整的 URL

// 格式化消息
formatMessages(messages)
// 参数: messages - 内部消息数组（OpenAI 格式）
// 返回: API 特定格式的消息数组
// 说明: Anthropic 需要将 tool 消息转换为 user + tool_result

// 构建请求体
buildRequestBody(params)
// 参数: params - { model, messages, temperature, stream, maxTokens, tools, toolChoice }
// 返回: API 特定格式的请求体
// 说明: Anthropic 需要将 tools 转换为 input_schema 格式

// 解析响应
parseResponse(data)
// 参数: data - API 返回的 JSON 数据
// 返回: 统一格式的响应 { content, role, toolCalls, finishReason, usage }

// 解析流式片段
parseStreamChunk(data)
// 参数: data - SSE 数据块
// 返回: 统一格式的片段 { content, role, toolCalls, finishReason }
```

**适配器列表**:

| 适配器 | 文件 | 特殊处理 |
|--------|------|---------|
| OpenAIAdapter | `adapters/openai/OpenAIAdapter.js` | 无，参考标准 |
| AnthropicAdapter | `adapters/anthropic/AnthropicAdapter.js` | 工具定义转换、消息格式转换 |
| OllamaAdapter | `adapters/ollama/OllamaAdapter.js` | 无，兼容 OpenAI |
| LMStudioAdapter | `adapters/lm-studio/LMStudioAdapter.js` | 无，兼容 OpenAI |
| OpenRouterAdapter | `adapters/openrouter/OpenRouterAdapter.js` | 添加 HTTP-Referer 头 |

详见 [TOOL_CALL_STANDARDS.md](./adapters/TOOL_CALL_STANDARDS.md)

---

#### MessageSender (Frontend)

**文件**: `sidepanel/pages/chat/message-sender.js`

**职责**: 
- 协调消息发送流程
- 准备消息列表（包含 system prompt、工具定义）
- 建立与 Background 的连接
- 监听响应并触发渲染

**关键方法**:

```javascript
// 发送消息
sendMessage(sessionId, text, media, renderCallback, fullRenderCallback)
// 参数: sessionId - 会话 ID
//       text - 用户输入的文本
//       media - 媒体文件数组
//       renderCallback - 增量渲染回调
//       fullRenderCallback - 完整渲染回调
// 说明:
//   1. 构建用户消息（支持多模态）
//   2. 添加到会话
//   3. 调用 callAI

// 调用 AI
callAI(sessionId, renderCallback)
// 参数: sessionId - 会话 ID
//       renderCallback - 渲染回调
// 说明:
//   1. 加载设置
//   2. 准备消息列表（包含 system prompt）
//   3. 截断消息（控制上下文长度）
//   4. 添加 assistant 占位消息
//   5. 连接 Background
//   6. 监听响应
//   7. 发送请求

// 准备消息列表
prepareMessages(session, settings)
// 参数: session - 会话对象
//       settings - 设置对象
// 返回: 处理后的消息数组
// 说明:
//   - 清理消息（移除 internal 字段）
//   - 添加 system prompt（包含工具说明）
//   - 按时间顺序排列
```

---

### 3.3 数据流

```
用户输入
  ↓
MessageSender.sendMessage()
  ↓
SessionManager.addMessage(userMessage)
  ↓
MessageSender.callAI()
  ↓
prepareMessages() → 添加 system prompt、截断
  ↓
chrome.runtime.connect({ name: 'chat-stream' })
  ↓
port.postMessage({ messages, apiKey, apiEndpoint, model, tools })
  ↓
Background: handleStreamPort()
  ↓
processMessages() → 清理 reasoning_content
  ↓
buildRequestBody() → 构建 API 请求体
  ↓
fetch(apiEndpoint)
  ↓
AI Provider 返回 SSE 流
  ↓
handleStreamResponse() → 逐行解析
  ↓
processChunk() → 提取 content/tool_calls
  ↓
port.postMessage({ type: 'chunk' | 'tool_call' | 'complete' })
  ↓
Frontend: StreamMessageHandler.handleMessage()
  ↓
StreamMessageProcessor.processMessage()
  ↓
SessionManager.updateLastMessage() / addMessage(toolMessage)
  ↓
renderCallback() → ChatRenderer.renderMessages()
```

### 3.4 注意事项

1. **流式请求绑定**: port 绑定到特定会话，切换会话不会断开请求
2. **消息截断**: 使用 `ChatContext.truncateMessages` 控制上下文长度，避免超出模型限制
3. **工具定义**: 只在首次请求时发送工具定义，后续请求只需发送 tool 消息
4. **错误处理**: Background 层的错误会转发到前端，前端应显示友好的错误提示

---

## 4. 工具调用功能

### 4.1 功能描述

**目标**: 让 AI 能够调用外部工具执行任务，如网络搜索、网页抓取、代码执行等。

**核心价值**:
- 扩展 AI 能力：通过工具访问实时信息、执行代码
- 自动化任务：AI 可以自主完成复杂的多步操作
- 结果反馈：工具执行结果作为消息返回给 AI，形成闭环

### 4.2 核心对象

#### BaseToolManager

**文件**: `sidepanel/modules/tools/BaseToolManager.js`

**职责**: 
- 注册和管理所有工具
- 生成 OpenAI 标准格式的工具定义
- 检查工具的启用状态
- 生成系统提示（包含工具使用说明）

**关键方法**:

```javascript
// 注册工具
registerTool(tool)
// 参数: tool - 工具配置对象
// 说明: 将工具添加到 this.tools Map

// 获取工具
getTool(id)
// 参数: id - 工具 ID
// 返回: 工具配置对象

// 获取所有工具
getAllTools()
// 返回: 所有工具数组（含启用状态）
// 说明: 从 SessionManager 获取当前会话的启用状态

// 生成 OpenAI 标准格式的工具定义
getOpenAIToolsDefinition()
// 返回: Array<{ type: 'function', function: { name, description, parameters } }> | null
// 说明: 只包含启用的工具

// 构建工具的参数 Schema
buildToolParameters(tool)
// 参数: tool - 工具配置对象
// 返回: JSON Schema 格式的参数定义
// 说明: 根据不同工具返回不同的 parameters

// 切换工具开关
toggleTool(id, enabled)
// 参数: id - 工具 ID
//       enabled - 是否启用
// 返回: boolean
// 说明: 更新 SessionManager 中的会话状态

// 检查工具是否启用
isToolEnabled(id)
// 参数: id - 工具 ID
// 返回: boolean
// 说明: 从 SessionManager 获取当前会话的启用状态

// 获取所有启用的工具
getEnabledTools()
// 返回: 启用的工具数组

// 生成系统提示
generateSystemPrompt()
// 返回: string | null
// 说明: 将所有启用工具的 systemPrompt 拼接成字符串
```

**工具配置结构**:

```javascript
tool = {
  id: string,              // 工具唯一标识
  name: string,            // 工具显示名称
  description: string,     // 工具描述（发送给 AI）
  systemPrompt: string,    // 系统提示（告诉 AI 如何使用）
  icon: string,            // 图标（SVG 或 emoji）
  enabled: boolean,        // 是否默认启用
  execute: async (args) => any  // 执行函数
}
```

---

#### ToolExecutor

**文件**: `sidepanel/pages/chat/tool-executor.js`

**职责**: 
- 执行 AI 返回的工具调用
- 创建 tool 消息并添加到会话
- 处理执行错误

**关键方法**:

```javascript
// 执行工具调用序列
executeToolCalls(sessionId, assistantMessage, renderCallback)
// 参数: sessionId - 会话 ID
//       assistantMessage - 包含 tool_calls 的 assistant 消息
//       renderCallback - 渲染回调
// 返回: Promise<boolean> - 是否执行了工具
// 说明:
//   1. 从 assistantMessage.tool_calls 获取调用列表
//   2. 依次执行每个工具
//   3. 每个工具执行后触发渲染
//   4. 清理 assistant 消息 content 中的工具调用代码块

// 执行单个工具
executeSingleTool(sessionId, call, toolType)
// 参数: sessionId - 会话 ID
//       call - tool_call 对象 { id, function: { name, arguments } }
//       toolType - 工具类型（函数名）
// 说明:
//   1. 解析参数（JSON.parse）
//   2. 调用 ToolManager.getTool(toolType).execute(args)
//   3. 创建 tool 消息 { role: 'tool', tool_call_id, name, content }
//   4. 添加到会话并保存
//   5. 错误也作为 tool 消息保存
```

---

#### 具体工具实现

**SearchTool** - 网络搜索

**文件**: `sidepanel/modules/tools/SearchTool.js`

**功能**: 
- 双引擎支持（DuckDuckGo + 百度）
- 分页支持（通过 `|page=N` 参数）
- 结果格式化（标题、链接、摘要）

**关键方法**:
```javascript
execute(query)
// 参数: query - 搜索关键词
// 返回: { success, results: [{ title, link, snippet }], output }
```

---

**FetchTool** - 网页抓取

**文件**: `sidepanel/modules/tools/FetchTool.js`

**功能**: 
- 类 Readability 算法提取正文
- HTML 转 Markdown
- 媒体提取（链接、图片、视频）

**关键方法**:
```javascript
execute(url)
// 参数: url - 网页 URL
// 返回: { title, content, links, images, media, output }
```

---

**CodeTool** - 代码执行

**文件**: `sidepanel/modules/tools/CodeTool.js`

**功能**: 
- 执行 JavaScript 代码
- 捕获 stdout/stderr
- 返回执行结果

**关键方法**:
```javascript
execute(code)
// 参数: code - JavaScript 代码字符串
// 返回: { success, output, error }
```

---

**TerminalTool** - 终端命令

**文件**: `sidepanel/modules/tools/TerminalTool.js`

**功能**: 
- 执行系统命令
- 通过 TerminalManager 管理终端进程
- 返回命令输出

**关键方法**:
```javascript
execute(command)
// 参数: command - 终端命令字符串
// 返回: { success, output, error }
```

---

### 4.3 工具调用流程

```
AI 返回 tool_calls
  ↓
Background: processChunk() 累积 tool_calls
  ↓
Background: port.postMessage({ type: 'tool_call', tool_calls: [...] })
  ↓
Frontend: StreamMessageProcessor.handleToolCall()
  ↓
currentMsg.tool_calls = msg.tool_calls
  ↓
renderCallback() → UI 显示工具卡片（pending 状态）
  ↓
stream complete
  ↓
ToolExecutor.executeToolCalls()
  ↓
for each tool_call:
  ToolManager.getTool(toolType).execute(args)
  ↓
SessionManager.addMessage(toolMessage)
  ↓
renderCallback() → UI 显示工具结果
  ↓
等待用户输入（不再自动发送第二轮请求）
```

### 4.4 注意事项

1. **工具启用状态跟随会话**: 每个会话可以独立启用/禁用工具
2. **工具定义格式**: 内部统一使用 OpenAI 标准格式，适配器负责转换
3. **错误处理**: 工具执行失败也应创建 tool 消息，让 AI 知道执行结果
4. **非递归设计**: 工具执行完成后不自动发送第二轮请求，等待用户输入
5. **消息联动**: 删除 assistant 消息时自动删除对应的 tool 消息

---

## 5. 多模态处理功能

### 5.1 功能描述

**目标**: 支持用户上传和发送图片、音频、视频等多媒体内容，AI 能够理解和回应。

**核心价值**:
- 视觉理解：AI 可以"看到"图片并回答问题
- 语音交互：支持音频输入和输出（计划中）
- 统一处理：通过 MediaManager 统一管理所有媒体类型

### 5.2 核心对象

#### MediaManager

**文件**: `sidepanel/modules/agent/multimodal/MediaManager.js`

**职责**: 
- 统一处理图片、音频、视频的上传和预览
- 提供拖拽上传支持
- 管理媒体文件的状态

**关键方法**:

```javascript
// 添加媒体文件
addMedia(file, type)
// 参数: file - File 对象
//       type - 'image'|'audio'|'video'
// 返回: media 对象 { id, type, filename, dataUrl, ... }

// 移除媒体文件
removeMedia(mediaId)
// 参数: mediaId - 媒体文件 ID

// 获取所有媒体
getAllMedia()
// 返回: 媒体文件数组

// 清空所有媒体
clearAllMedia()

// 处理拖拽上传
handleDrop(event)
// 参数: event - drag & drop 事件
// 说明: 自动识别文件类型并添加
```

---

#### ImageHandler

**文件**: `sidepanel/modules/agent/multimodal/ImageHandler.js`

**职责**: 
- 图片压缩和格式转换
- 生成 base64 data URL
- 尺寸调整

**关键方法**:
```javascript
compressImage(file, maxWidth, maxHeight, quality)
// 参数: file - File 对象
//       maxWidth/maxHeight - 最大尺寸
//       quality - JPEG 质量 (0-1)
// 返回: Promise<dataUrl>
```

---

### 5.3 消息格式

**多模态消息结构**:

```javascript
// 简单文本
{ role: 'user', content: '你好' }

// 多模态内容
{
  role: 'user',
  content: [
    { type: 'text', text: '这张图片是什么？' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
    { type: 'input_audio', input_audio: { data: 'data:audio/webm;base64,...', format: 'webm' } }
  ]
}
```

### 5.4 注意事项

1. **图片压缩**: 上传前自动压缩图片，减少 API 请求大小
2. **Base64 编码**: 所有媒体文件转换为 base64 data URL
3. **尺寸限制**: 根据 API 提供商的限制调整图片尺寸
4. **格式支持**: 优先使用广泛支持的格式（PNG、JPEG、WebM）

---

## 6. 模型管理功能

### 6.1 功能描述

**目标**: 动态获取和管理 AI 模型列表，自动检测模型能力，提供智能的模型选择体验。

**核心价值**:
- 自动发现：从 API 获取最新模型列表，无需手动配置
- 能力检测：自动识别模型是否支持视觉、工具调用等功能
- 缓存优化：5分钟缓存，减少 API 请求

### 6.2 核心对象

#### ModelManager

**文件**: `sidepanel/modules/models/ModelManager.js`

**职责**: 
- 从 API 获取模型列表
- 检测模型能力
- 管理模型缓存
- 提供模型信息查询

**关键方法**:

```javascript
// 获取模型列表
fetchModels(apiKey, apiEndpoint)
// 参数: apiKey - API Key
//       apiEndpoint - API 端点
// 返回: Promise<Array<Model>>
// 说明:
//   1. 检查缓存（5分钟内有效）
//   2. 调用 API 获取模型列表
//   3. 更新缓存
//   4. 返回模型数组

// 检测模型能力
detectCapabilities(modelName)
// 参数: modelName - 模型名称
// 返回: Promise<{ vision, audio, streaming, tools } | null>
// 说明: 根据模型名称推断能力

// 获取模型详细信息
getModelInfo(modelId)
// 参数: modelId - 模型 ID
// 返回: Model 对象或 null

// 是否为视觉模型
isVisionModel(modelId)
// 参数: modelId - 模型 ID
// 返回: boolean

// 获取上下文窗口大小
getContextWindow(modelId)
// 参数: modelId - 模型 ID
// 返回: number（token 数量）

// 清除缓存
clearCache()
```

**模型数据结构**:

```javascript
model = {
  id: string,              // 模型 ID
  name: string,            // 显示名称
  description: string,     // 描述
  context_length: number,  // 上下文窗口大小
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text']
  },
  pricing: {
    prompt: number,        // 每 token 价格
    completion: number
  },
  capabilities: {
    vision: boolean,
    audio: boolean,
    streaming: boolean,
    tools: boolean
  }
}
```

---

#### ModelSelector

**文件**: `sidepanel/modules/agent/models/ModelSelector.js`

**职责**: 
- 渲染模型选择器 UI
- 显示模型能力和详情
- 处理模型切换

**关键方法**:
```javascript
render(container, currentModel, models, onSelect)
// 参数: container - DOM 容器
//       currentModel - 当前选中的模型 ID
//       models - 模型列表
//       onSelect - 选择回调

// 显示模型详情悬浮窗
showModelTooltip(model, element)
// 参数: model - 模型对象
//       element - 触发元素
```

---

### 6.3 缓存策略

```javascript
// localStorage 缓存
const cacheKey = `models_${apiEndpoint}`;
const cached = localStorage.getItem(cacheKey);
const cacheTime = localStorage.getItem(`${cacheKey}_time`);

if (cached && Date.now() - cacheTime < 5 * 60 * 1000) {
  return JSON.parse(cached); // 5分钟内使用缓存
}

// 获取新数据后更新缓存
localStorage.setItem(cacheKey, JSON.stringify(models));
localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
```

### 6.4 注意事项

1. **缓存时效**: 5分钟缓存，平衡实时性和性能
2. **能力推断**: 通过模型名称关键词推断能力（如 'vision'、'gpt-4o'）
3. **错误处理**: API 请求失败时使用缓存或默认模型列表
4. **悬停提示**: 模型选择器中的问号图标显示详细说明

---

## 7. 用户脚本功能

### 7.1 功能描述

**目标**: 允许用户编写和运行自定义 JavaScript 脚本，在网页的 MAIN world 中执行，绕过 CSP 限制。

**核心价值**:
- 灵活扩展：用户可以自定义页面行为
- MAIN world：直接访问页面 DOM 和 JS
- 动态注册：无需重新加载扩展即可生效

### 7.2 核心对象

#### UserScriptManager

**文件**: `sidepanel/modules/scripts/UserScriptManager.js`

**职责**: 
- 管理用户脚本的注册和卸载
- 处理脚本元数据解析
- 提供沙盒执行环境

**关键方法**:

```javascript
// 注册脚本
registerScript(script)
// 参数: script - { id, name, code, matches, enabled }
// 说明:
//   1. 解析元数据（@match、@name 等）
//   2. 调用 chrome.userScripts.register()
//   3. 保存到 storage

// 卸载脚本
unregisterScript(scriptId)
// 参数: scriptId - 脚本 ID
// 说明:
//   1. 调用 chrome.userScripts.unregister()
//   2. 从 storage 删除

// 启用/禁用脚本
toggleScript(scriptId, enabled)
// 参数: scriptId - 脚本 ID
//       enabled - 是否启用

// 获取所有脚本
getAllScripts()
// 返回: 脚本数组

// 解析元数据
parseMetadata(code)
// 参数: code - 脚本代码
// 返回: { name, description, match, ... }
```

---

#### UserScriptSandbox

**文件**: `sidepanel/modules/scripts/UserScriptSandbox.js`

**职责**: 
- 提供安全的脚本执行环境
- 限制危险 API 的访问
- 捕获执行错误

**关键方法**:
```javascript
executeInSandbox(code, context)
// 参数: code - 脚本代码
//       context - 执行上下文
// 返回: 执行结果
// 说明: 使用 Function 构造函数创建沙盒
```

---

### 7.3 脚本元数据格式

```javascript
// ==UserScript==
// @name         My Script
// @description  脚本描述
// @match        *://*.example.com/*
// @version      1.0
// @grant        none
// ==/UserScript==

// 脚本代码
console.log('Hello from user script!');
```

### 7.4 注意事项

1. **MAIN world**: 脚本在页面的 MAIN world 执行，可以访问页面 JS
2. **CSP 绕过**: 通过 chrome.userScripts API 注册的脚本不受 CSP 限制
3. **安全性**: 沙盒环境限制危险 API（如 eval、setTimeout）
4. **URL 匹配**: 使用 Chrome 的 URL patterns 语法（如 `*://*.example.com/*`）

---

## 8. 存储管理功能

### 8.1 功能描述

**目标**: 统一管理应用的持久化数据存储，包括会话历史、设置、模型缓存等。

**核心价值**:
- 集中管理：所有存储操作通过统一接口
- 自动同步：数据变更自动保存到 chrome.storage
- 版本控制：支持数据结构迁移和版本升级

### 8.2 核心对象

#### SettingsStorage

**文件**: `sidepanel/modules/storage/SettingsStorage.js`

**职责**: 
- 管理应用设置的存取
- 提供默认值
- 处理版本迁移

**关键方法**:

```javascript
// 加载设置
loadSettings()
// 返回: Promise<settings>
// 说明: 从 chrome.storage.local 读取，合并默认值

// 保存设置
saveSettings(settings)
// 参数: settings - 设置对象
// 返回: Promise<void>

// 获取单个设置项
get(key, defaultValue)
// 参数: key - 设置键
//       defaultValue - 默认值
// 返回: 设置值

// 设置单个设置项
set(key, value)
// 参数: key - 设置键
//       value - 设置值

// 重置为默认值
resetToDefaults()
```

**设置结构**:

```javascript
settings = {
  apiEndpoint: string,       // API 端点
  apiKey: string,            // API Key
  model: string,             // 当前模型
  apiStandard: string,       // API 标准（openai/anthropic/...）
  temperature: number,       // 温度参数
  maxTokens: number,         // 最大 token 数
  systemPrompt: string,      // 系统提示
  autoContextTruncation: boolean,  // 自动截断上下文
  theme: 'light'|'dark'      // 主题
}
```

---

#### SessionManager (存储部分)

**文件**: `sidepanel/modules/agent/SessionManager.js`

**关键方法**:

```javascript
// 保存所有会话
saveConversations()
// 说明: 将 this.sessions 序列化后存入 chrome.storage.local

// 加载会话
loadConversations()
// 返回: Promise<sessions>
// 说明: 从 chrome.storage.local 读取并反序列化
```

---

### 8.3 存储结构

```javascript
// chrome.storage.local
{
  conversations: {
    [sessionId]: session
  },
  settings: {
    apiEndpoint: '...',
    apiKey: '...',
    ...
  },
  models_cache: {
    [apiEndpoint]: {
      models: [...],
      timestamp: number
    }
  },
  user_scripts: {
    [scriptId]: script
  }
}
```

### 8.4 注意事项

1. **存储限制**: chrome.storage.local 有 5MB 限制，注意清理旧数据
2. **异步操作**: 所有存储操作都是异步的，返回 Promise
3. **版本迁移**: 数据结构变更时应提供迁移逻辑
4. **敏感数据**: API Key 等敏感信息应考虑加密存储

---

## 9. UI 渲染功能

### 9.1 功能描述

**目标**: 提供灵活、可扩展的消息渲染系统，支持文本、图片、音频、视频、文件、工具卡片等多种内容类型。

**核心价值**:
- 模块化渲染：每种媒体类型独立渲染器
- 增量更新：支持消息的局部更新（如流式响应）
- 主题支持：亮色/暗色主题自动适配

### 9.2 核心对象

#### ChatRenderer

**文件**: `sidepanel/pages/chat/components/ChatRenderer.js`

**职责**: 
- 协调所有渲染器
- 管理消息列表的渲染
- 处理增量更新

**关键方法**:

```javascript
// 渲染所有消息
renderMessages(container, messages)
// 参数: container - DOM 容器
//       messages - 消息数组
// 说明: 遍历消息，选择合适的渲染器

// 更新单条消息
updateMessageById(messageId)
// 参数: messageId - 消息 ID
// 说明: 找到对应消息并重新渲染

// 滚动到底部
scrollToBottom()

// 注册渲染器
registerRenderer(renderer)
// 参数: renderer - 渲染器对象 { canRender, render }
```

---

#### 渲染器列表

**TextRenderer** - 文本渲染

**文件**: `sidepanel/pages/chat/render/TextRenderer.js`

**功能**: 
- Markdown 渲染
- 代码高亮
- 链接自动识别

**关键方法**:
```javascript
canRender(message)
// 返回: message.role === 'assistant' || message.role === 'user'

render(message)
// 返回: DOM 元素
```

---

**ImageRenderer** - 图片渲染

**文件**: `sidepanel/pages/chat/render/ImageRenderer.js`

**功能**: 
- 显示图片
- 点击放大
- 懒加载

---

**AudioRenderer** - 音频渲染

**文件**: `sidepanel/pages/chat/render/AudioRenderer.js`

**功能**: 
- 音频播放器
- 波形可视化（计划中）

---

**VideoRenderer** - 视频渲染

**文件**: `sidepanel/pages/chat/render/VideoRenderer.js`

**功能**: 
- 视频播放器
- 自定义控件

---

**FileRenderer** - 文件渲染

**文件**: `sidepanel/pages/chat/render/FileRenderer.js`

**功能**: 
- 文件图标
- 下载链接
- 文件大小显示

---

**ToolCallRenderer** - 工具调用卡片渲染

**文件**: `sidepanel/modules/tools/ToolCallRenderer.js`

**功能**: 
- 显示工具调用状态（pending/executing/completed/error）
- 显示工具参数
- 显示执行结果
- 折叠/展开

**关键方法**:
```javascript
renderToolCall(toolCall, result)
// 参数: toolCall - tool_call 对象
//       result - 执行结果（可选）
// 返回: DOM 元素
```

---

### 9.3 渲染流程

```
ChatRenderer.renderMessages()
  ↓
for each message:
  for each renderer in renderers:
    if renderer.canRender(message):
      element = renderer.render(message)
      container.appendChild(element)
      break
```

### 9.4 注意事项

1. **渲染器优先级**: 按注册顺序匹配，第一个 canRender 返回 true 的渲染器生效
2. **增量更新**: 流式响应时只更新最后一条消息，避免全量重渲染
3. **性能优化**: 大量消息时使用虚拟滚动（计划中）
4. **主题适配**: 所有渲染器使用 CSS 变量，自动适配亮色/暗色主题

---

## 10. 扩展开发指南

### 10.1 添加工具

**步骤**:

1. **创建工具文件**

```javascript
// sidepanel/modules/tools/MyTool.js
window.MyTool = {
  config: {
    id: 'my_tool',
    name: 'My Tool',
    description: '工具描述（发送给 AI）',
    systemPrompt: `
## My Tool

当需要执行某任务时，调用此工具。

参数:
- param1: 参数1描述
- param2: 参数2描述

示例:
\`\`\`json
{
  "param1": "value1",
  "param2": "value2"
}
\`\`\`
`,
    icon: '🔧',
    enabled: true,
    execute: async (args) => {
      // 执行逻辑
      const result = await doSomething(args.param1, args.param2);
      return result;
    }
  }
};
```

2. **注册工具**

在 `BaseToolManager.js` 构造函数中添加：
```javascript
this.registerTool(window.MyTool.config);
```

3. **添加参数 Schema**

在 `buildToolParameters(tool)` 方法中添加：
```javascript
case 'my_tool':
  return {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数1描述' },
      param2: { type: 'number', description: '参数2描述' }
    },
    required: ['param1']
  };
```

4. **测试**

- 启用工具
- 发送相关请求
- 观察 AI 是否正确调用工具

---

### 10.2 添加 API 适配器

**步骤**:

1. **创建适配器类**

```javascript
// sidepanel/modules/agent/adapters/new-api/NewApiAdapter.js
class NewApiAdapter {
  constructor() {
    this.name = 'new-api';
    this.config = null;
  }

  configure(config) {
    this.config = {
      endpoint: config.endpoint || 'https://api.new-api.com/v1',
      apiKey: config.apiKey || '',
      defaultModel: config.defaultModel || 'default-model',
      ...config
    };
  }

  buildUrl(path) {
    const cleanBase = this.config.endpoint.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  buildHeaders(customHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...customHeaders
    };
  }

  formatMessages(messages) {
    // 转换为 API 特定格式
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
      stream: params.stream ?? false,
      ...(params.tools && { tools: params.tools })
    };
  }

  parseResponse(data) {
    const choice = data.choices[0];
    return {
      content: choice.message.content,
      role: choice.message.role,
      toolCalls: choice.message.tool_calls || [],
      finishReason: choice.finish_reason,
      usage: data.usage,
      model: data.model
    };
  }

  parseStreamChunk(data) {
    const choice = data.choices[0];
    if (!choice || !choice.delta) return null;
    
    return {
      content: choice.delta.content || '',
      role: choice.delta.role,
      toolCalls: choice.delta.tool_calls || [],
      finishReason: choice.finish_reason
    };
  }

  async fetchModels(apiEndpoint, apiKey) {
    // 实现模型列表获取
    const response = await fetch(apiEndpoint + '/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const result = await response.json();
    return result.data || [];
  }

  async detectCapabilities(modelName) {
    // 实现能力检测
    return {
      vision: false,
      audio: false,
      streaming: true,
      tools: true
    };
  }
}

window.NewApiAdapter = NewApiAdapter;
```

2. **注册适配器**

在 `AdapterManager.js` 中添加：
```javascript
import NewApiAdapter from './new-api/NewApiAdapter.js';

this.adapters.set('new-api', new NewApiAdapter());
```

3. **添加工具转换（如需要）**

如果 API 的工具定义格式与 OpenAI 不同，添加转换方法：
```javascript
convertToolsForNewApi(openaiTools) {
  // 转换逻辑
  return openaiTools.map(tool => ({
    // 新 API 格式
  }));
}
```

4. **更新设置页面**

在设置页面的 API 标准下拉框中添加选项。

5. **测试**

- 配置新 API 的端点和 Key
- 测试普通对话
- 测试工具调用
- 测试流式响应

---

### 10.3 添加渲染器

**步骤**:

1. **创建渲染器类**

```javascript
// sidepanel/pages/chat/render/CustomRenderer.js
class CustomRenderer {
  canRender(message) {
    // 判断是否可以渲染此消息
    return message.type === 'custom';
  }

  render(message) {
    // 创建 DOM 元素
    const div = document.createElement('div');
    div.className = 'custom-message';
    div.textContent = message.content;
    return div;
  }
}

window.CustomRenderer = CustomRenderer;
```

2. **注册渲染器**

在 `ChatRenderer.js` 中添加：
```javascript
this.renderers.push(new window.CustomRenderer());
```

3. **添加样式**

在 `theme.css` 中添加：
```css
.custom-message {
  /* 样式 */
}
```

4. **测试**

发送包含 `type: 'custom'` 的消息，观察渲染效果。

---

### 10.4 调试技巧

**日志级别**:
```javascript
console.log('[Module] Message')  // 普通日志
console.warn('[Module] Warning') // 警告
console.error('[Module] Error')  // 错误
```

**调试入口**:
- Background: `chrome://extensions/` → Service Worker
- Side Panel: 右键 → 检查
- Content Script: F12 → Console

**常用调试命令**:
```javascript
// 查看会话状态
console.log(SessionManager.sessions);

// 查看工具定义
console.log(ToolManager.getOpenAIToolsDefinition());

// 查看模型列表
console.log(await ModelManager.fetchModels(apiKey, apiEndpoint));
```

---

## 附录

### A. 关键术语表

| 术语 | 解释 |
|------|------|
| Session | 会话，一组相关的对话 |
| Port | Chrome Extension 长连接对象 |
| Tool Call | AI 调用外部工具的请求 |
| Adapter | API 适配器，统一不同 API 标准 |
| Renderer | 渲染器，负责将消息转换为 DOM |
| MAIN world | Chrome Extension 的执行环境，可访问页面 JS |
| SSE | Server-Sent Events，服务器推送技术 |

### B. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构文档
- [TOOL_CALL_STANDARDS.md](../sidepanel/modules/agent/adapters/TOOL_CALL_STANDARDS.md) - 工具调用 API 标准对照
- [README.md](../README.md) - 项目总览

### C. 版本历史

- v1.0.0 (2026-05-06) - 初始版本，完成功能开发文档

---

**维护者**: Lingma  
**更新频率**: 每次新增功能模块后同步更新此文档
