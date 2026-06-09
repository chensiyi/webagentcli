# Web Agent Client 架构文档

> 与当前代码库（v0.3.3）保持同步 · 架构版本：MVC v2.0

## 项目概述

Web Agent Client 是一个基于 **Manifest V3** 的 Chrome Extension，为 AI Agent 提供网页端执行环境。采用 **MVC + EventBus** 架构：

- **View**（pages + components）只通过事件与 Controller 通信
- **Controller**（ChatController）作为 UI 与 Service 之间的"翻译层"，负责流式请求、Tool Calling 循环、运行时活动状态
- **Service**（ServiceCenter + 各类 Manager + Provider 实现）封装业务逻辑
- **Core**（Models + EventBus）提供基础设施（数据模型、全局事件总线）

### 核心特性

- 🎯 **MVC 分层**：View / Controller / Service / Core 职责单一、边界清晰
- 🔌 **插件化 Provider**：所有 AI 服务实现统一接口（`IProviderAPIService`），可热插拔
- 💬 **多会话 + 持久化**：基于 `chrome.storage.local` 的会话/消息/工具调用全持久化
- 🌊 **流式响应**：实时渲染 AI 回复，支持 `reasoning_content`（思考过程）单独展示
- 🛠️ **Tool Calling 闭环**：自动检测 → 执行 → 回填 → 续发，最多循环至模型无 tool call
- 📜 **用户脚本管理**：Tampermonkey 风格元数据解析、页面 MAIN 世界注入
- 🎨 **模块化主题**：CSS 按 UI 元素类型拆分子文件

### 架构设计原则

1. **Controller 协调**：ChatController 只管理"最小运行时状态"（当前请求、活动状态），不持有 Session 引用，所有持久化数据从 SessionManager 获取
2. **SessionManager 持久化**：SessionManager 是会话/消息的"唯一真相源"，Controller 仅做协调
3. **EventBus 解耦**：所有跨模块通信均走 EventBus，避免直接引用导致的循环依赖
4. **ServiceCenter 统一入口**：通过 `serviceCenter.getXxxManager()` 访问服务，延迟初始化减少启动开销
5. **协议隔离**：OpenAI 协议的 `tool_calls` 字段隔离在 `MessageContent.MessageStructure` 中，业务层只用内部 `ToolCall` 对象

## 架构分层

```
┌──────────────────────────────────────────────────────────────────┐
│                       View Layer (UI)                            │
│  pages/* (ChatPage / HistoryPage / SettingsPage / ...)          │
│  components/* (UI / Chat 通用组件)                              │
│  pages/*EventHandler.js (事件监听 → 调用 Controller)            │
└────────────┬─────────────────────────────────────────────────────┘
             │ ① 触发 UI 事件  ② 监听 EventBus 更新
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Controller Layer                              │
│  ChatController                                                   │
│  - 协调 SessionManager / ProviderService                          │
│  - 管理流式请求、Tool Calling 循环、活动状态                       │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Service Layer                                │
│  ServiceCenter (Facade / 单例管理)                                │
│  ├─ SessionManager (会话 / 消息持久化)                            │
│  ├─ SettingsManager (设置加载与保存)                              │
│  ├─ StorageManager (chrome.storage 封装 + 缓存)                   │
│  ├─ ScriptsManager (脚本 CRUD)                                   │
│  ├─ ModelManager (模型列表管理)                                   │
│  ├─ Tool Registry (内置工具注册)                                  │
│  └─ Provider Service (OpenAI / OpenRouter / LM Studio)            │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Core Layer                                 │
│  Models: BaseModel / Message / Session / Settings / Model /      │
│          ToolCall / ToolResult / ToolDefinition / MessageContent  │
│  Events: EventBus (单例) / Events (常量)                         │
└──────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
webagentcli/
├── manifest.json              # Chrome MV3 配置
├── sidepanel/                 # 侧边栏主目录
│   ├── sidepanel.html         # 入口 HTML（按固定顺序加载所有模块）
│   ├── js/
│   │   ├── app.js             # 应用入口：创建 ServiceCenter、加载设置、渲染页面
│   │   ├── background.js      # Service Worker：图标点击开侧边栏 + 脚本注入
│   │   ├── core/
│   │   │   ├── events/
│   │   │   │   ├── EventBus.js    # 全局事件总线单例
│   │   │   │   └── Events.js      # 事件常量 + MessageFormats
│   │   │   └── models/
│   │   │       ├── BaseModel.js        # 抽象基类：ID、touch、toJSON
│   │   │       ├── Message.js          # 消息（role、content、toolCalls[]）
│   │   │       ├── Session.js          # 会话（messages、reasoningEffort）
│   │   │       ├── Settings.js         # 设置（apiStandard、apiKey、model）
│   │   │       ├── Model.js            # AI 模型（capabilities、contextLength）
│   │   │       ├── ToolCall.js         # 工具调用意图（不可变）
│   │   │       ├── ToolResult.js       # 工具执行结果（不可变）
│   │   │       ├── ToolDefinition.js   # 工具契约（不可变）
│   │   │       ├── MessageContent.js   # 富媒体块 + ThinkingConfig + MessagesRequest
│   │   │       ├── Storage.js          # chrome.storage.local 封装 + 缓存
│   │   │       └── Scripts.js          # UserScript 元数据解析
│   │   ├── services/
│   │   │   ├── ServiceCenter.js        # ⭐ 服务中心（Facade）
│   │   │   ├── SessionManager.js       # 会话管理器（实现 ISessionManager）
│   │   │   ├── SettingsManager.js      # 设置管理器
│   │   │   ├── StorageManager.js       # 存储管理器
│   │   │   ├── ScriptsManager.js       # 脚本管理器
│   │   │   ├── ModelManager.js         # 模型管理器
│   │   │   ├── ScriptInjector.js       # 脚本注入器（background.js 使用）
│   │   │   ├── tools/
│   │   │   │   └── RunUserScriptTool.js    # 内置工具：在页面 MAIN 世界执行代码
│   │   │   ├── ProviderAPIServices/
│   │   │   │   ├── OpenAIService.js
│   │   │   │   ├── OpenRouterService.js
│   │   │   │   └── LMStudioService.js
│   │   │   ├── ISessionManager.js      # 接口
│   │   │   ├── IAppSettings.js         # 接口
│   │   │   ├── ISettings.js            # 接口
│   │   │   ├── IProviderAPIService.js  # Provider 抽象基类
│   │   │   ├── IStorageManager.js      # 接口
│   │   │   ├── IScriptsManager.js      # 接口
│   │   │   ├── IModelManager.js        # 接口
│   │   │   └── IToolService.js         # 工具抽象基类
│   │   ├── controllers/
│   │   │   └── ChatController.js       # 聊天控制器（协调者）
│   │   ├── pages/
│   │   │   ├── ChatPage.js / ChatEventHandler.js
│   │   │   ├── HistoryPage.js
│   │   │   ├── SettingsPage.js + SettingsPage_Base.js
│   │   │   ├── SettingsPage_OpenAI.js
│   │   │   ├── SettingsPage_OpenRouter.js
│   │   │   ├── SettingsPage_LMStudio.js
│   │   │   ├── SettingsEventHandler.js
│   │   │   ├── StoragePage.js / StorageEventHandler.js
│   │   │   └── ScriptsPage.js / ScriptsEventHandler.js
│   │   ├── components/
│   │   │   ├── UI.js           # 通用 UI 组件（按钮、卡片等）
│   │   │   └── Chat.js         # 聊天专用组件
│   │   └── utils/
│   │       ├── dom.js          # DOM 创建工具
│   │       ├── toast.js        # Toast 通知
│   │       ├── confirm.js      # 确认对话框
│   │       ├── time.js         # 时间格式化
│   │       ├── error-handler.js# 全局错误处理
│   │       ├── marked.min.js   # Markdown 渲染器
│   │       └── codemirror/     # 代码编辑器
│   └── theme/
│       ├── variables.css       # CSS 变量（颜色、间距、字号）
│       ├── utilities.css       # 工具类
│       ├── layout.css          # 布局
│       ├── buttons.css
│       ├── forms.css
│       ├── cards.css
│       ├── badges.css
│       ├── dialogs.css
│       ├── tooltips.css
│       ├── markdown.css
│       ├── chat-components.css # 聊天专用
│       ├── chat-demo.css
│       ├── search-results.css
│       ├── settings-ui.css
│       └── animations.css
└── docs/
    ├── ARCHITECTURE.md         # 本文件
    └── CORE_MODELS.md          # 数据模型说明
```

## 核心模块详解

### 1. ServiceCenter（服务中心）

**位置**：`sidepanel/js/services/ServiceCenter.js`

ServiceCenter 是**整个应用的"门面（Facade）"**，通过 `app.js` 创建唯一实例，承载所有服务的懒加载与单例管理。

#### 核心职责

- 创建并管理 `SessionManager` / `SettingsManager` / `StorageManager` / `ScriptsManager` / `ModelManager` 实例
- 注册内置工具（`RunUserScriptTool`），暴露 `getTool(name)`、`getEnabledTools()`、`getToolDefinitionsForLLM()`
- 管理 **当前活跃的 Provider API 服务**（单例），通过 `updateProviderService(settings)` 切换/更新
- 提供 `ChatController` 单例
- 持有 EventBus 引用，供各服务/Controller 使用

#### 关键方法

| 方法 | 用途 |
|------|------|
| `initializeSessionManager()` | 异步初始化 SessionManager（必须先 await） |
| `getSessionManager()` | 获取 SessionManager（同步） |
| `getSettingsManager()` | 获取 SettingsManager（懒加载） |
| `getStorageManager()` | 获取 StorageManager（懒加载） |
| `getScriptsManager()` | 获取 ScriptsManager（懒加载） |
| `getModelManager()` | 获取 ModelManager（懒加载） |
| `getCurrentProviderService()` | 获取当前 Provider 服务 |
| `updateProviderService(settings)` | 根据 settings 创建/更新 Provider 服务 |
| `getChatController()` | 获取 ChatController 单例 |
| `getTool(name)` / `getEnabledTools()` / `getAllTools()` | 工具查询 |
| `getToolDefinitionsForLLM()` | 转为 OpenAI function calling 格式 |
| `getEventBus()` | 获取事件总线 |

### 2. ChatController（聊天控制器）

**位置**：`sidepanel/js/controllers/ChatController.js`

协调 SessionManager 与 ProviderService，是 Chat 模块的中枢。

#### 状态机

```
IDLE ──(sendMessage)──► WAITING ──(收到 reasoning)──► THINKING
                              └──(收到 content)──────► GENERATING
                                                          │
                              (toolCalls 存在)            ▼
                              ┌──► 执行 Tool ──► 续发 ──┘
                              ▼
                          COMPLETED ──(延时)──► IDLE

任意状态 ──(stopGeneration)──► STOPPED ──(延时)──► IDLE
任意状态 ──(错误)──► FAILED
```

状态值定义在 `Events.CHAT.STATE`：`IDLE / WAITING / THINKING / GENERATING / COMPLETED / FAILED / STOPPED`。

#### `sendMessage(params)` 核心流程

```javascript
async sendMessage({
  content,           // 用户消息文本
  sessionId,         // 目标会话 id（可选，不传则用当前会话）
  chatService,       // 自定义 Provider（可选）
  model,             // 自定义模型（可选）
  reasoningEffort,   // 思考模式强度 'off' | 'low' | 'medium' | 'high'
  isToolContinuation // 内部：是否工具续发（不写用户消息）
}) { ... }
```

主要步骤：

1. **获取/创建 Session**：用现有 sessionId 或当前 session；若不存在则 `createSession`
2. **写用户消息**（仅当 `isToolContinuation=false`）
3. **构造 `MessagesRequest`**：注入 `thinking: ThinkingConfig` 和 `tools: ToolDefinition[]`
4. **占位 Assistant 消息**：先 `addMessage({ role: 'assistant', content: '' })`，获取 messageId
5. **发出 `STREAM_START`** 事件
6. **调用 `service.chatStream(request, onChunk)`**：
   - `onChunk({ content, reasoning_content })` → `streamChunkMessage()` 持久化 → 发出 `STREAM_CHUNK_APPEND`
   - 返回 `StandardResponse = { content, toolCalls: ToolCall[], reasoning_content, finishReason, usage, model }`
7. **把 toolCalls 写入 Assistant 消息**（如果有）
8. **发出 `STREAM_COMPLETE`**
9. **若存在 toolCalls** → 进入 `_executeToolCalls()` → 续发（`isToolContinuation=true`）→ 回到步骤 6
10. **错误路径**：写错误信息到 Assistant 消息，发出 `STREAM_ERROR`

#### Tool Calling 循环（`_executeToolCalls`）

```
result.toolCalls: [ToolCall, ...]
      │
      ▼
for each ToolCall:
      │
      ├── emit TOOL.EXECUTING
      ├── tool = serviceCenter.getTool(tc.toolName)
      ├── toolResult = await tool.invoke(tc, { sessionId, tabId })
      │       (invoke 内部：异常捕获 + 计时 + 返回 ToolResult)
      ├── emit TOOL.COMPLETED
      └── 写一条 role=tool 的 Message（content=output 或 error）
      │
      ▼
emit TOOL.ALL_COMPLETED
      │
      ▼
sendMessage({ sessionId, isToolContinuation: true })
//   └─> 再次走到 chatStream，AI 收到所有 tool result 后可继续
```

#### 其他方法

- `stopGeneration()`：调用 `service.cancel()`（AbortController），发出 `STREAM_STOP`
- `clearMessages()`：清空当前 session 的所有消息
- `deleteMessage(messageId)`：删除消息，发出 `MESSAGE_DELETED`
- `hasActiveActivities()`：判断是否有正在进行的活动
- `getQueueStatus()`：返回 `{ state, sessionId, hasActive }`

### 3. SessionManager（会话管理器）

**位置**：`sidepanel/js/services/SessionManager.js`

会话/消息的"唯一真相源"，负责持久化与运行时状态分离。

#### 核心职责

- 管理多个 `Session` 实例
- 提供会话/消息的 CRUD
- 处理流式分片（`streamChunkMessage`）
- 通过 EventBus 发布会话和消息变更事件

#### 关键方法

| 方法 | 用途 |
|------|------|
| `createSession({ title, reasoningEffort })` | 创建会话 |
| `getSession(sessionId)` | 按 id 获取 |
| `getCurrentSession()` | 获取当前会话 |
| `loadSession(sessionId)` | 加载并切换为当前会话 |
| `deleteSession(sessionId)` | 删除会话 |
| `updateSession(sessionId, updater)` | 函数式更新 |
| `getAllSessions()` | 获取所有会话 |
| `addMessage(message, sessionId)` | 添加消息到会话 |
| `updateMessage(messageId, updater, sessionId)` | 函数式更新消息 |
| `streamChunkMessage(messageId, { content, reasoning_content }, sessionId)` | 流式分片追加 |
| `deleteMessage(messageId, sessionId)` | 删除消息 |
| `clearMessages(sessionId)` | 清空消息 |

### 4. EventBus（事件总线）

**位置**：`sidepanel/js/core/events/EventBus.js`

全局单例（`window.EventBus`），发布/订阅模式 + 消息历史 + window CustomEvent 转发。

#### 核心能力

| 方法 | 用途 |
|------|------|
| `on(event, callback)` | 订阅；返回 `unsubscribe` 函数 |
| `once(event, callback)` | 一次性订阅 |
| `off(event, callback)` | 取消订阅 |
| `emit(event, data)` | 发布事件；记录到历史；同时 `window.dispatchEvent` |
| `getHistory(event?)` | 获取最近 100 条事件历史（可按事件名过滤） |
| `clearHistory()` | 清空历史 |
| `getRegisteredEvents()` | 获取所有已注册事件名 |
| `getListenerCount(event)` | 监听器数量 |

#### 事件分类

详见 `Events.js`，主要分类：

- **CHAT.***：消息生命周期、用户交互、流式、状态枚举、会话管理
- **SETTINGS.***：设置生命周期、API 配置变更、模型管理
- **SERVICE.***：服务配置/切换/错误
- **UI.***：页面切换、主题、加载状态
- **STORAGE.***：存储加载/搜索/错误
- **SCRIPTS.***：脚本加载/错误
- **TOOL.***：工具执行生命周期

### 5. Provider API Service（AI 服务抽象）

**位置**：`sidepanel/js/services/IProviderAPIService.js`

所有 AI Provider 实现统一接口。**关键约定**：`chat()` 和 `chatStream()` 都返回 `Promise<StandardResponse>`，协议解析在 Provider 内部完成，Controller 直接操作内部 `ToolCall` 对象。

```typescript
type StandardResponse = {
  content: string,
  toolCalls: ToolCall[],            // 内部对象，非协议字段
  reasoning_content: string,
  finishReason: string | null,
  usage: object | null,
  model: string | null
}

interface IProviderAPIService {
  name: string,
  config: { endpoint, apiKey?, defaultModel? },
  configure(config): void,
  chat(request: MessagesRequest): Promise<StandardResponse>,
  chatStream(request, onChunk): Promise<StandardResponse>, // onChunk 接收 { content, reasoning_content }
  cancel(): void,                                         // 内部使用 AbortController
  listModels(): Promise<Array>,
  getModelDetails(modelId): Promise<Object>
}
```

**各 Provider 实现要点：**

- **OpenAIService**：原生支持 `tools`、`reasoning_content`（o-series）、流式 SSE
- **OpenRouterService**：复用 OpenAI 协议，支持 `HTTP-Referer` / `X-Title` 头
- **LMStudioService**：本地 HTTP，无 apiKey，适配 `GET /api/v1/models` 响应格式

#### Provider 端前缀缓存

所有 Provider 都实现 `_shouldApplyCache(request)` 接口，在 `buildRequestBody` 中动态决定是否添加缓存头。**ChatController** 在每次 `sendMessage` 注入 `service.cacheOptions.sessionCacheKey = 'webagentcli:session:<sessionId>'`。

| Provider | 缓存机制 | 触发条件 | 预期收益 |
|----------|---------|---------|---------|
| **OpenAI** | `prompt_cache_key` 字段 | o-series / gpt-4.1 / gpt-4o + messages >= 4 | token 成本 ×0.5、首 token 延迟 -80% |
| **OpenRouter** | `cache_control: { type: 'ephemeral' }` 加在 system 与前 1/3 历史 | messages >= 2 | 成本 ×0.1（10 倍节省） |
| **LM Studio** | `cache_prompt: true` | messages >= 1 | 本地零成本，多轮加速 |

各 Provider 的 `_shouldApplyCache` 独立判断，存储在 `this.cacheOptions`：

```javascript
{
  enabled: true,
  sessionCacheKey: 'webagentcli:session:<sessionId>', // 由 ChatController 注入
  ttlSeconds: 600,
  minPrefixTokens: 1024
}
```

> 全局开关：设置 `service.cacheOptions.enabled = false` 可关闭某个 Provider 的缓存。

### 6. Tool System（工具系统）

**位置**：`sidepanel/js/services/IToolService.js`（抽象）+ `tools/`（内置实现）

每个工具实现 `IToolService` 接口，通过 `register(definition, handler)` 注入：

```typescript
interface IToolService {
  definition: ToolDefinition,        // 工具契约（名称、描述、参数 JSON Schema）
  enabled: boolean,
  invoke(toolCall, context): Promise<ToolResult>  // 统一封装：异常捕获 + 计时
}
```

- **ToolDefinition**（不可变）：声明工具名、描述、参数 JSON Schema，可被 LLM 识别
- **ToolCall**（不可变）：AI 调用意图 `{ id, toolName, arguments }`
- **ToolResult**（不可变）：执行结果 `{ toolCallId, status, output, error, duration }`

**内置工具**：`run_user_script` —— 在当前活动 tab 的 MAIN 世界执行用户提供的 JS 代码，AI 可借此操控网页。

`ServiceCenter` 在初始化时注册所有内置工具；`getToolDefinitionsForLLM()` 返回 OpenAI function calling 格式的工具列表，发给 LLM。

## 启动流程

```
1. 用户点击扩展图标
2. background.js 监听 chrome.action.onClicked → chrome.sidePanel.open(tabId)
3. sidepanel.html 加载，按顺序引入所有脚本（依赖关系见 <script> 顺序）
4. window.load → app.js 的 init() 执行
     │
     ├── new ServiceCenter()                     # 创建服务中心
     ├── await serviceCenter.initializeSessionManager()
     ├── 创建 EventHandlers（Chat / Settings / Storage / Scripts）
     ├── await settingsManager.loadSettings()    # 触发 SETTINGS.LOADED
     │     → SettingsEventHandler 监听 → updateProviderService()
     ├── 注册全局事件监听
     └── renderPage(root, serviceCenter)         # 渲染 ChatPage
5. 页面就绪，用户可交互
```

### `sidepanel.html` 脚本加载顺序

1. `utils/error-handler.js` → `utils/toast.js` → `utils/confirm.js` → `utils/dom.js` → `utils/time.js`
2. `components/UI.js` → `components/Chat.js`
3. CodeMirror、marked（第三方）
4. `core/events/EventBus.js` → `core/events/Events.js`
5. `core/models/BaseModel.js` → `Model.js` → `ToolDefinition.js` → `ToolCall.js` → `ToolResult.js` → `MessageContent.js` → `Message.js` → `Session.js` → `Settings.js` → `Storage.js` → `Scripts.js`
6. 服务接口（`ISessionManager.js` 等）+ `tools/RunUserScriptTool.js`
7. Provider 实现（`OpenAIService.js` / `OpenRouterService.js` / `LMStudioService.js`）
8. 服务实现（`StorageManager.js` / `SessionManager.js` / `SettingsManager.js` / `ScriptsManager.js` / `ModelManager.js`）
9. Settings 页面实现（`SettingsPage_*.js`）
10. `controllers/ChatController.js`
11. `services/ServiceCenter.js`
12. 页面 EventHandler → 页面本身
13. 最后 `app.js`

> ⚠️ 调整加载顺序会导致 `window.X` 引用为 `undefined`。新增模块时请遵循"被依赖者先加载"原则。

## 后台 Service Worker

**位置**：`sidepanel/js/background.js`（`type: module`）

负责：
- 监听 `chrome.action.onClicked` → `chrome.sidePanel.open()`
- 监听 `chrome.tabs.onActivated` / `onUpdated` → 调用 `injectScriptsForTab()` 注入匹配的用户脚本
- 监听 `chrome.storage.onChanged` → 当 `user_scripts` 变化时清空注入缓存并重新注入

脚本注入器在 `sidepanel/js/services/ScriptInjector.js`（ES Module），由 background.js 静态导入。

## 开发指南

### 添加新的 Provider

1. 在 `sidepanel/js/services/ProviderAPIServices/` 创建 `XxxService.js`
2. 继承 `IProviderAPIService`，实现 `configure / chat / chatStream / cancel / listModels / getModelDetails`
3. 在 `sidepanel/js/services/ServiceCenter.js` 的 `createProviderService()` `switch` 中加 case
4. 在 `sidepanel.html` 的 Provider 脚本区引入新文件
5. 在 `sidepanel/js/pages/SettingsPage_*.js` 添加对应的设置表单

### 添加新的工具

1. 在 `sidepanel/js/services/tools/` 创建 `XxxTool.js`
2. 继承 `IToolService`，在构造器中 `register(new ToolDefinition({...}), handler)`
3. 在 `ServiceCenter._registerBuiltInTools()` 数组中添加类引用
4. 在 `sidepanel.html` 中引入

### 添加新的事件

1. 在 `sidepanel/js/core/events/Events.js` 的对应分类下添加常量
2. 业务代码中 `window.EventBus.emit(Events.X.Y, data)` 发布
3. EventHandler 中 `window.EventBus.on(Events.X.Y, handler)` 订阅

### 添加新页面

1. 在 `sidepanel/js/pages/` 创建 `XxxPage.js`（暴露 `window.Pages.xxx`）和 `XxxEventHandler.js`（可选）
2. 在 `sidepanel.html` 中按依赖顺序引入
3. 在 `app.js` 的 `pages` 数组中注册 `{ id, icon, label }`
4. 在 `Services` 中按需添加对应 Manager

## 常见模式

### 1. Controller 协调模式

ChatController 不直接持久化消息，而是委托给 SessionManager：

```javascript
// ❌ 反模式：Controller 持有 Session 引用
this.currentSession = session;

// ✅ 正模式：每次需要时从 SessionManager 获取最新
const session = sessionManager.getSession(sessionId);
```

### 2. 协议隔离

业务层用 `ToolCall` 对象，OpenAI 协议字段只在 `MessageStructure.toAPIFormat()` 中转换：

```javascript
// Provider 内部
const toolCalls = MessageStructure.parseToolCallsFromOpenAI(response.tool_calls);
// → 返回 ToolCall[]

// 发给 API 时
const apiMessage = MessageStructure.toAPIFormat(message, 'openai');
// → tool_calls: [{ id, type: 'function', function: { name, arguments } }]
```

### 3. 事件驱动 UI 更新

```javascript
// ChatController 发布
eventBus.emit(Events.CHAT.STREAM_CHUNK_APPEND, { sessionId, messageId, content, reasoning_content });

// ChatEventHandler 订阅，调用 ChatPage 更新视图
eventBus.on(Events.CHAT.STREAM_CHUNK_APPEND, (data) => chatPage.appendChunk(data));
```

## 版本信息

- **扩展版本**：0.3.3
- **Manifest 版本**：3
- **架构版本**：MVC v2.0（Controller + SessionManager + Provider 插件化）

### 主要变更

#### v0.3.3

- ✅ Controller 负责协调 SessionManager 和 ProviderService
- ✅ SessionManager 负责会话和消息的持久化
- ✅ ServiceCenter 提供统一的服务访问入口
- ✅ EventBus 实现组件解耦通信
- ✅ 支持多种 AI Provider（OpenAI、OpenRouter、LM Studio）
- ✅ 工具调用（Tool Calling）闭环：检测 → 执行 → 回填 → 续发
- ✅ 思考模式（reasoning）配置（off / low / medium / high）
- ✅ 模块化 CSS 主题系统

---

**推荐阅读**：
- [CORE_MODELS.md](CORE_MODELS.md) — 数据模型详解
- [sidepanel/README.md](../sidepanel/README.md) — Side Panel 模块说明
- [README.md](../README.md) — 项目入口
