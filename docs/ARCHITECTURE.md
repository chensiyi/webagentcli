# Web Agent Client 架构文档

## 项目概述

Web Agent Client 是一个基于 **Manifest V3** 的 Chrome Extension，为 AI Agent 提供网页端执行环境。采用 **MVC（Model-View-Controller）分层架构**，通过**事件总线（EventBus）**实现组件解耦，支持多会话对话、流式响应、工具调用、思考模式等核心功能。

### 核心特性

- 🎯 **MVC 架构**：清晰的分层设计，职责明确
- 🔌 **插件化 Provider**：支持 OpenAI、LM Studio、OpenRouter 等多种 AI 服务
- 💬 **多会话管理**：独立的会话上下文与持久化存储
- 🌊 **流式响应**：实时渲染 AI 回复，支持思考过程展示
- 🛠️ **工具系统**：可扩展的工具注册与调用机制
- 🎨 **主题化 UI**：模块化 CSS 设计，支持深色/浅色模式
- 📦 **去中心化服务管理**：ServiceRegistry + ServiceCenter 的服务装配体系

## 架构分层

项目采用 **MVC 分层架构**，通过**事件总线**实现跨层解耦，通过**服务注册中心**实现 Provider 插件化。

### 分层架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        View Layer (UI)                            │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │  ChatPage   │ │ History  │ │ Settings │ │ Storage  │         │
│  │ + EventHandler│ │  Page   │ │   Page   │ │   Page   │         │
│  └──────┬──────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│         │              │             │             │              │
│         ▼              ▼             ▼             ▼              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EventBus (发布/订阅)                         │    │
│  │  SESSION.*, CHAT.*, SETTINGS.*, UI.* 等事件              │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 监听事件 & 调用 Controller
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Controller Layer (业务协调)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │   Chat       │ │   Session    │ │   Settings   │             │
│  │ Controller   │ │ Controller   │ │ Controller   │             │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           ServiceCenter (Facade 装配)                     │    │
│  │  • 从 ServiceRegistry 获取 API 实例                       │    │
│  │  • 混入 IChatService 的 UI 回调                           │    │
│  │  • 返回统一的 ChatService Facade                          │    │
│  └────────────────────┬──────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────────┘
                        │ 调用 API 方法
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Service Layer (API 适配)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          ServiceRegistry (去中心化注册)                    │    │
│  │  • Provider 自注册: registerProvider()                   │    │
│  │  • 按需实例化: registerChatService()                     │    │
│  └────────────────────┬──────────────────────────────────┘    │
│                       │                                        │
│  ┌────────────────────┼──────────────────────────────────┐    │
│  │  IProviderAPIService (抽象基类)                         │    │
│  │  ├─ OpenAIService                                      │    │
│  │  ├─ LMStudioService                                    │    │
│  │  └─ OpenRouterService                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 读写数据 & 发布事件
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Core Layer (基础设施)                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Stores (状态管理)                         │    │
│  │  • SessionManager: 会话 CRUD + 持久化                     │    │
│  │  • ToolRegistry: 工具注册与启用/禁用                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Models (数据结构)                         │    │
│  │  Message | Session | Settings | Model | ...              │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EventBus (全局事件总线)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 关键设计要点

#### 1. 双向通信机制

- **View → Controller**: 通过 EventHandler 调用 Controller 方法
- **Controller → View**: 通过 EventBus 发布事件，View 层订阅并更新 UI
- **优势**: 避免循环依赖，支持异步操作

#### 2. ServiceCenter 的 Facade 模式

```
Controller 请求 ChatService
        ↓
ServiceCenter.createChatService(providerId, config)
        ↓
   ┌────────────────────────┐
   │  1. 从 Registry 获取    │
   │     原始 API 实例        │
   │  2. 混入 IChatService   │
   │     的 UI 回调方法      │
   │  3. 返回 Facade 对象    │
   └────────────────────────┘
        ↓
Controller 获得统一接口
(API 能力 + UI 交互)
```

#### 3. 去中心化的服务注册

- **传统方式**: 中央管理器维护所有 Provider（耦合度高）
- **本项目**: Provider 在各自文件中调用 `ServiceRegistry.registerProvider()`
- **优势**: 新增 Provider 无需修改现有代码（开闭原则）

#### 4. 数据流向

```
用户操作 
  → View (EventHandler)
  → Controller (业务逻辑)
  → ServiceCenter (Facade 装配)
  → Service (API 调用)
  → Core (数据持久化)
  → EventBus (事件通知)
  → View (UI 更新)
```

## 目录结构

```
webagentcli/
├── manifest.json              # Chrome Extension 配置 (Manifest V3)
├── background.js              # Service Worker 入口
├── content.js                 # 内容脚本（预留）
├── sidepanel/                 # 侧边栏主目录
│   ├── sidepanel.html         # 入口 HTML，按顺序加载所有模块
│   ├── js/                    # JavaScript 代码
│   │   ├── app.js             # 应用初始化与页面路由
│   │   ├── core/              # 核心层
│   │   │   ├── events/        # 事件系统
│   │   │   │   ├── EventBus.js       # 全局事件总线单例
│   │   │   │   └── Events.js         # 事件常量定义
│   │   │   ├── models/        # 数据模型
│   │   │   │   ├── index.js          # 模型统一导出
│   │   │   │   ├── Message.js        # 消息模型
│   │   │   │   ├── Session.js        # 会话模型
│   │   │   │   ├── Settings.js       # 设置模型
│   │   │   │   ├── Model.js          # AI 模型元数据
│   │   │   │   ├── ModelManager.js   # 模型管理器
│   │   │   │   ├── ModelCache.js     # 模型缓存
│   │   │   │   ├── MediaContent.js   # 多媒体内容模型
│   │   │   │   ├── ToolIntention.js  # 工具意图识别
│   │   │   │   ├── Scripts.js        # 脚本模型
│   │   │   │   ├── Storage.js        # 存储模型
│   │   │   │   └── MessageModels.js  # 消息类型扩展
│   │   │   └── stores/        # 状态存储管理
│   │   │       ├── SessionManager.js # 会话管理器（CRUD + 持久化）
│   │   │       └── ToolRegistry.js   # 工具注册表
│   │   ├── services/          # 服务层
│   │   │   ├── IProviderAPIService.js    # Provider API 抽象基类
│   │   │   ├── IChatService.js           # UI 交互回调接口
│   │   │   ├── ISettings.js              # 设置接口定义
│   │   │   ├── ServiceRegistry.js        # 服务注册中心（去中心化）
│   │   │   └── ProviderAPIServices/      # 具体 Provider 实现
│   │   │       ├── OpenAIService.js      # OpenAI 标准 API
│   │   │       ├── LMStudioService.js    # LM Studio 原生 API
│   │   │       └── OpenRouterService.js  # OpenRouter API
│   │   ├── controllers/       # 控制器层
│   │   │   ├── ServiceCenter.js          # 框架服务管理中心 ⭐
│   │   │   ├── ChatController.js         # 聊天逻辑控制
│   │   │   ├── SessionController.js      # 会话管理协调
│   │   │   ├── SettingsController.js     # 设置管理
│   │   │   ├── StorageController.js      # 存储管理
│   │   │   └── ScriptsController.js      # 脚本管理
│   │   ├── pages/             # UI 页面层（View）
│   │   │   ├── ChatPage.js               # 对话页面渲染
│   │   │   ├── ChatEventHandler.js       # 对话页面事件处理
│   │   │   ├── HistoryPage.js            # 历史页面
│   │   │   ├── SettingsPage.js           # 设置页面主文件
│   │   │   ├── SettingsPage_Base.js      # 设置页面基类
│   │   │   ├── SettingsPage_LMStudio.js  # LM Studio 设置
│   │   │   ├── SettingsPage_OpenAI.js    # OpenAI 设置
│   │   │   ├── SettingsPage_OpenRouter.js# OpenRouter 设置
│   │   │   ├── SettingsEventHandler.js   # 设置页面事件处理
│   │   │   ├── StoragePage.js            # 存储页面
│   │   │   ├── StorageEventHandler.js    # 存储页面事件处理
│   │   │   ├── ScriptsPage.js            # 脚本页面
│   │   │   └── ScriptsEventHandler.js    # 脚本页面事件处理
│   │   └── utils/             # 工具函数
│   │       ├── dom.js                  # DOM 创建工具
│   │       ├── time.js                 # 时间格式化
│   │       ├── marked.min.js           # Markdown 解析库
│   │       ├── toast.js                # Toast 通知
│   │       ├── confirm.js              # 确认对话框
│   │       └── error-handler.js        # 全局错误处理
│   └── theme/                 # CSS 主题样式（模块化）
│       ├── variables.css      # CSS 变量定义（深色/浅色主题）
│       ├── layout.css         # 布局样式
│       ├── buttons.css        # 按钮组件
│       ├── forms.css          # 表单组件
│       ├── cards.css          # 卡片组件
│       ├── chat-components.css# 聊天专用组件 ⭐
│       ├── settings-ui.css    # 设置界面样式
│       ├── markdown.css       # Markdown 渲染样式
│       ├── tooltips.css       # Tooltip 样式
│       ├── dialogs.css        # 对话框样式
│       ├── badges.css         # 徽章样式
│       ├── search-results.css # 搜索结果样式
│       ├── animations.css     # 动画效果
│       └── utilities.css      # 通用工具类
├── assets/                    # 静态资源（图标等）
└── docs/                      # 项目文档
    ├── ARCHITECTURE.md        # 架构文档（本文件）
    └── CORE_MODELS.md         # 核心数据模型详解
```

## 核心模块详解

### 1. 事件系统 (EventBus)

**位置**: `js/core/events/`

提供应用内所有组件的解耦通信机制，基于发布-订阅模式。

#### EventBus.js
全局事件总线单例，提供以下功能：
- **订阅/发布**: `on(event, callback)` / `emit(event, data)`
- **一次性事件**: `once(event, callback)` - 触发后自动移除监听器
- **消息历史**: 记录最近的事件，新订阅者可获取历史记录
- **取消订阅**: `off(event, callback)` - 移除指定监听器

#### Events.js
事件常量定义，统一管理所有事件名称，避免硬编码字符串。

**主要事件分类**:
- `CHAT.*`: 消息生命周期、流式请求、会话管理
  - `CHAT.MESSAGE_SENT` - 消息发送
  - `CHAT.STREAM_START` - 流式响应开始
  - `CHAT.STREAM_UPDATE` - 流式内容更新
  - `CHAT.STREAM_COMPLETE` - 流式响应完成
  - `CHAT.STREAM_ERROR` - 流式响应错误
- `SESSION.*`: 会话 CRUD 操作
  - `SESSION_CREATED` - 会话创建
  - `SESSION_LOADED` - 会话加载
  - `SESSION_DELETED` - 会话删除
  - `CURRENT_SESSION_CHANGED` - 当前会话切换
- `SETTINGS.*`: 设置加载/保存、API 配置变更
  - `SETTINGS.LOADED` - 设置加载完成
  - `SETTINGS.UPDATED` - 设置更新
  - `SETTINGS.MODEL_CHANGED` - 模型切换
- `SERVICE.*`: 服务配置/切换/错误
  - `SERVICE.CONFIGURED` - 服务配置完成
  - `SERVICE.ERROR` - 服务错误
- `UI.*`: 页面切换、主题变更
  - `UI.PAGE_CHANGED` - 页面切换
  - `UI.THEME_CHANGED` - 主题变更
- `STORAGE.*`: 存储操作
- `SCRIPTS.*`: 脚本管理
- `TOOL.*`: 工具注册与启用/禁用

### 2. 数据模型 (Models)

**位置**: `js/core/models/`

定义应用的核心数据结构，所有模型均提供 `toJSON()` 和 `fromJSON()` 方法用于持久化。

#### 核心模型

- **Message**: 消息模型
  - 支持角色: `user` / `assistant` / `system` / `tool`
  - 字段: `id`, `role`, `content`, `tool_calls`, `reasoning_content`, `timestamp`, `metadata`
  - 支持多媒体内容（图片、音频）嵌入
  
- **Session**: 会话模型
  - 管理消息列表与元数据
  - 字段: `id`, `title`, `messages[]`, `created_at`, `updated_at`, `reasoningEnabled`
  - 提供 `addMessage()`, `updateMessage()`, `deleteMessage()` 等方法
  
- **Settings**: 设置模型
  - API 配置: `apiStandard`, `apiEndpoint`, `apiKey`, `model`
  - UI 配置: `theme`, `language`
  - 功能开关: `enableReasoning`, `enableTools`
  
- **Model**: AI 模型元数据
  - 字段: `id`, `name`, `provider`, `capabilities`, `context_length`, `max_tokens`
  - 能力检测: `supportsReasoning()`, `supportsToolUse()`, `supportsMultimodal()`
  
- **ModelManager**: 模型管理器
  - 管理可用模型列表
  - 提供模型搜索与过滤功能
  
- **ModelCache**: 模型缓存
  - 基于 `chrome.storage.local` 的缓存机制
  - 避免频繁请求模型列表
  
- **MediaContent**: 多媒体内容模型
  - 支持图片、音频、视频的元数据管理
  - 提供预览 URL 生成
  
- **ToolIntention**: 工具意图识别
  - 解析用户输入中的工具调用意图
  - 映射到具体的工具定义
  
- **Scripts**: 脚本模型
  - 用户自定义脚本管理
  - 字段: `id`, `name`, `code`, `description`, `created_at`
  
- **Storage**: 存储模型
  - 封装 `chrome.storage.local` 操作
  - 提供统一的读写接口

### 3. 服务层 (Services)

**位置**: `js/services/`

实现与外部 AI Provider API 的通信，采用**策略模式**支持多 Provider 切换。

#### 抽象接口

##### IProviderAPIService
Provider API 服务的抽象基类，定义所有 AI Provider 必须实现的接口：

- `configure(config)`: 配置服务（endpoint, apiKey, model）
- `buildUrl(path)`: 构建 API URL
- `buildHeaders()`: 构建请求头（含 Authorization）
- `formatMessages(messages)`: 格式化消息为 API 标准格式
- `buildRequestBody(params)`: 构建请求体
- `parseResponse(data)`: 解析非流式响应
- `parseStreamChunk(data)`: 解析流式数据块
- `chat(params)`: 非流式请求
- `chatStream(params, onChunk, onComplete)`: 流式请求
- `listModels()`: 获取模型列表
- `getModelDetails(modelId)`: 获取模型详情
- `cancel()`: 取消正在进行的请求

##### IChatService
定义聊天服务的 UI 交互回调接口，用于解耦 Service 层与 View 层：

- `handleStreamStart(data)`: 流式请求开始
- `handleStreamUpdate(data)`: 流式内容更新
- `handleStreamReasoning(data)`: 流式推理内容更新
- `handleStreamComplete(data)`: 流式请求完成
- `handleStreamError(data)`: 流式请求错误
- `confirmDeleteMessage(messageId, onConfirm)`: 确认删除消息

#### 具体实现

位于 `js/services/ProviderAPIServices/`：

- **OpenAIService**: OpenAI 标准 API 实现
  - 兼容 OpenAI 格式的 API（如 Azure OpenAI、Groq 等）
  - 支持 function calling、tool use
  
- **LMStudioService**: LM Studio 原生 v1 REST API 实现
  - 本地模型调用
  - 支持 reasoning 模式
  
- **OpenRouterService**: OpenRouter API 实现
  - 多模型聚合平台
  - 自动路由最优模型

#### ServiceRegistry（服务注册中心）

**位置**: `js/services/ServiceRegistry.js`

去中心化的服务管理机制：

- **registerProvider(providerId, ServiceClass)**: 注册服务提供者
  - 各 Provider 在各自文件中自注册
  - 避免集中式管理导致的耦合
  
- **registerChatService(providerId, config)**: 实例化并配置服务
  - 根据 providerId 查找对应的 ServiceClass
  - 创建实例并调用 `configure()`
  - 返回原始 API 服务实例
  
- **getService(name)**: 获取已缓存的服务实例

**设计原则**: 
- 各 Provider **自注册**，而非由中央管理器统一管理
- 符合**开闭原则**，新增 Provider 无需修改现有代码

### 4. ServiceCenter（服务管理中心）⭐

**位置**: `js/controllers/ServiceCenter.js`

框架核心服务的统一管理中心，采用 **Facade（门面）模式** 组装底层 API 能力与 UI 交互逻辑。

#### 核心职责

1. **管理 ServiceRegistry**: 提供服务注册与实例化的统一入口
2. **管理 EventBus**: 提供事件总线的访问接口
3. **Facade 装配**: 将底层 API 服务与 IChatService 的 UI 回调组合成完整的 ChatService

#### createChatService(providerId, config)

创建并返回封装后的聊天服务实例：

```javascript
const chatService = window.ServiceCenter.createChatService('openai', {
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-...',
  defaultModel: 'gpt-4'
});
```

**返回对象包含**:
- **API 能力**: `configure()`, `chat()`, `chatStream()`, `cancel()`, `listModels()`, `getModelDetails()`
- **UI 交互**: `handleStreamStart()`, `handleStreamUpdate()`, `handleStreamReasoning()`, `handleStreamComplete()`, `handleStreamError()`, `confirmDeleteMessage()`

**设计优势**:
- ✅ **内核与业务隔离**: Controller 层不直接依赖具体 Provider 实现
- ✅ **统一接口**: 无论使用哪个 Provider，上层调用方式一致
- ✅ **易于测试**: 可轻松替换 Mock 服务
- ✅ **符合单一职责**: ServiceCenter 只负责服务装配，不涉及业务逻辑

### 5. 控制器层 (Controllers)

**位置**: `js/controllers/`

协调业务逻辑，委托给 Service 层处理具体操作，通过 EventBus 与 View 层通信。

#### ChatController
聊天核心逻辑控制：
- 消息队列管理
- 流式响应处理
- 任务队列调度
- 与 ChatService 交互

#### SessionController
会话管理协调器：
- 委托给 SessionManager 进行数据操作
- 监听 `SESSION.*` 事件并更新 UI
- 提供会话切换、删除等高级功能

#### SettingsController
设置管理：
- 加载/保存设置到 `chrome.storage.local`
- 监听设置变更并发布 `SETTINGS.UPDATED` 事件
- 管理 API 配置、模型选择、主题等

#### StorageController
存储管理：
- 封装 chrome.storage 操作
- 提供统一的读写接口
- 监听 `STORAGE.*` 事件

#### ScriptsController
脚本管理：
- 用户自定义脚本的 CRUD
- 脚本执行环境管理

### 6. UI 页面层 (Pages)

**位置**: `js/pages/`

每个页面由 **Page**（渲染）和 **EventHandler**（事件处理）两部分组成，符合 MVC 中的 **View** 层职责。

#### Page vs EventHandler

- **Page**: 负责将数据渲染为 DOM 结构，挂载到指定容器
- **EventHandler**: 负责监听用户交互，发布 EventBus 事件或调用 Controller

#### 页面列表

| 页面 | Page 文件 | EventHandler 文件 | 功能描述 |
|------|-----------|-------------------|----------|
| 对话 | ChatPage.js | ChatEventHandler.js | 聊天界面、消息渲染、流式响应 |
| 历史 | HistoryPage.js | - | 会话历史列表、快速切换 |
| 设置 | SettingsPage.js | SettingsEventHandler.js | API 配置、模型选择、主题设置 |
| 存储 | StoragePage.js | StorageEventHandler.js | 本地存储管理、数据导出 |
| 脚本 | ScriptsPage.js | ScriptsEventHandler.js | 用户脚本管理、执行 |

#### SettingsPage 的模块化设计

设置页面采用**基类 + 子类**的设计模式：

- **SettingsPage_Base.js**: 通用设置项（API Endpoint、Theme 等）
- **SettingsPage_LMStudio.js**: LM Studio 特有配置
- **SettingsPage_OpenAI.js**: OpenAI 特有配置
- **SettingsPage_OpenRouter.js**: OpenRouter 特有配置

根据当前选择的 `apiStandard` 动态加载对应的配置面板。

### 7. 工具函数 (Utils)

**位置**: `js/utils/`

提供通用的工具函数，不依赖业务逻辑。

- **dom.js**: DOM 元素创建工具
  - `create(tag, options, children)`: 快速创建 DOM 元素
  - 支持 className、style、text、onClick 等常用属性
  
- **time.js**: 时间格式化
  - `formatTime(timestamp)`: 将时间戳格式化为可读字符串
  
- **marked.min.js**: Markdown 解析库
  - 第三方库，用于渲染 Markdown 内容
  
- **toast.js**: Toast 通知
  - `show(message, type, duration)`: 显示临时提示
  - 支持 success / error / warning / info 类型
  
- **confirm.js**: 确认对话框
  - `ConfirmDialog.show({ title, message, onConfirm, onCancel })`: 异步确认框
  - 支持 ESC 键和点击遮罩层关闭
  
- **error-handler.js**: 全局错误处理
  - 捕获未处理的 Promise Rejection
  - 统一错误日志格式

### 8. 状态存储 (Stores)

**位置**: `js/core/stores/`

#### SessionManager
会话管理器（纯数据管理，无 UI 依赖）：

- **CRUD 操作**: `createSession()`, `loadSession()`, `deleteSession()`, `updateSession()`
- **消息管理**: `addMessage()`, `addMessages()`, `updateMessage()`, `deleteMessage()`
- **持久化**: 自动同步到 `chrome.storage.local`
- **环境同步**: `_syncSessionEnvironment()` - 确保会话功能开关与模型能力匹配
- **事件发布**: 所有操作均通过 EventBus 通知其他模块

**关键设计**:
- ✅ **懒加载**: 第一条消息触发时才真正创建会话
- ✅ **自动评估**: 切换会话时自动检测模型是否支持 Reasoning
- ✅ **异步加载**: `loadSessionsFromStorage()` 返回 Promise，确保数据就绪后再渲染 UI

#### ToolRegistry
工具注册表（纯数据管理）：

- **工具注册**: `registerTool(toolDefinition)`
- **启用/禁用**: `enableTool(toolId)` / `disableTool(toolId)`
- **参数验证**: `validateArgs(toolId, args)` - JSON Schema 格式验证
- **OpenAI 格式转换**: `getOpenAIToolsDefinition()` - 转换为 API 标准格式

## 核心设计原则

### 1. MVC 分层

- **Model**: 数据模型与状态管理（`core/models`, `core/stores`）
- **View**: UI 渲染与用户交互（`pages/`）
- **Controller**: 业务逻辑协调（`controllers/`）

各层之间通过 **EventBus** 通信，避免直接依赖。

### 2. 去中心化服务管理

- Provider **自注册**到 ServiceRegistry，而非由中央管理器统一管理
- 符合**开闭原则**，新增 Provider 无需修改现有代码
- ServiceCenter 仅负责 Facade 装配，不涉及具体实现

### 3. 内核与业务隔离

- Controller 层不直接依赖具体 Provider 实现
- 通过 ServiceCenter 的 Facade 模式统一接口
- 便于单元测试与 Mock 替换

### 4. 事件驱动

- 所有跨模块通信均通过 EventBus
- 避免循环依赖与紧耦合
- 支持异步操作与消息历史

### 5. 主题化 UI

- 所有样式使用 CSS 变量
- 模块化 CSS 文件，按功能分区
- 支持深色/浅色模式自动切换

### 6. 单一职责

- SessionManager: 仅负责会话数据管理，无 UI 依赖
- ToolRegistry: 仅负责工具注册，无执行逻辑
- ServiceCenter: 仅负责服务装配，无业务逻辑

## 全局对象

应用初始化后，以下对象挂载到 `window` 上，可在控制台直接访问：

### 核心层

| 对象 | 类型 | 说明 |
|------|------|------|
| `EventBus` | EventBus | 全局事件总线单例 |
| `Events` | Object | 事件常量定义 |
| `SessionManager` | SessionManager | 会话管理器实例（由 app.js 创建） |
| `ToolRegistry` | ToolRegistry | 工具注册表类 |

### 服务层

| 对象 | 类型 | 说明 |
|------|------|------|
| `ServiceRegistry` | ServiceRegistry | 服务注册中心 |
| `ServiceCenter` | ServiceCenter | 服务管理中心（Facade 装配） |
| `IChatService` | Object | UI 交互回调接口实现 |
| `IProviderAPIService` | Class | Provider API 抽象基类 |

### 控制器层

| 对象 | 类型 | 说明 |
|------|------|------|
| `ChatController` | Object | 聊天控制器 |
| `SessionController` | Object | 会话控制器 |
| `SettingsController` | Object | 设置控制器 |
| `StorageController` | Object | 存储控制器 |
| `ScriptsController` | Object | 脚本控制器 |

### UI 层

| 对象 | 类型 | 说明 |
|------|------|------|
| `Pages` | Object | 页面注册表（`Pages.chat`, `Pages.history` 等） |
| `DOM` | Object | DOM 创建工具 |
| `Toast` | Object | Toast 通知工具 |

### 模型层

| 对象 | 类型 | 说明 |
|------|------|------|
| `Message` | Class | 消息模型 |
| `Session` | Class | 会话模型 |
| `Settings` | Class | 设置模型 |
| `Model` | Class | AI 模型元数据 |
| `ModelManager` | Class | 模型管理器 |

## 开发指南

### 添加新的 Provider

1. **创建服务文件**: 在 `js/services/ProviderAPIServices/` 创建 `XxxService.js`
2. **继承抽象基类**:
   ```javascript
   class XxxService extends IProviderAPIService {
     configure(config) { /* ... */ }
     buildUrl(path) { /* ... */ }
     // ... 实现所有抽象方法
   }
   ```
3. **自注册**:
   ```javascript
   // 在 XxxService.js 文件末尾
   if (window.ServiceRegistry) {
     window.ServiceRegistry.registerProvider('xxx', XxxService);
   }
   ```
4. **添加脚本引用**: 在 `sidepanel.html` 中添加 `<script src="js/services/ProviderAPIServices/XxxService.js"></script>`
5. **测试**: 在设置页面选择新 Provider，验证 API 调用是否正常

### 添加新的页面

1. **创建 Page 文件**: 在 `js/pages/` 创建 `XxxPage.js`
   ```javascript
   function XxxPage(container) {
     const { create } = window.DOM;
     const page = create('div', { className: 'page-content' }, [
       // ... 渲染内容
     ]);
     container.innerHTML = '';
     container.appendChild(page);
   }
   
   // 注册到 Pages
   if (!window.Pages) window.Pages = {};
   window.Pages.xxx = XxxPage;
   ```
2. **创建 EventHandler**（可选）: 如需处理用户交互，创建 `XxxEventHandler.js`
3. **添加脚本引用**: 在 `sidepanel.html` 中添加脚本
4. **配置路由**: 在 `app.js` 的 `pages` 数组中添加页面配置
   ```javascript
   const pages = [
     { id: 'xxx', icon: '🆕', label: '新功能' },
     // ...
   ];
   ```

### 添加新的事件

1. **定义事件常量**: 在 `js/core/events/Events.js` 中添加
   ```javascript
   const Events = {
     // ...
     MY_FEATURE: {
       ACTION_STARTED: 'MY_FEATURE.ACTION_STARTED',
       ACTION_COMPLETED: 'MY_FEATURE.ACTION_COMPLETED'
     }
   };
   ```
2. **发布事件**: 
   ```javascript
   window.EventBus.emit(Events.MY_FEATURE.ACTION_STARTED, { data });
   ```
3. **订阅事件**:
   ```javascript
   window.EventBus.on(Events.MY_FEATURE.ACTION_COMPLETED, (data) => {
     console.log('Action completed:', data);
   });
   ```

### CSS 主题开发

所有样式应使用 CSS 变量，避免硬编码颜色：

```css
/* ✅ 正确 */
.my-component {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

/* ❌ 错误 */
.my-component {
  background: #ffffff;
  color: #333333;
}
```

新增组件样式应添加到 `theme/chat-components.css` 或对应的模块化文件中。

## 架构设计原则

### 1. MVC 分层

- **Model**: 数据模型与状态管理（`core/models`, `core/stores`）
- **View**: UI 渲染与用户交互（`pages/`）
- **Controller**: 业务逻辑协调（`controllers/`）

各层之间通过 **EventBus** 通信，避免直接依赖。

### 2. 去中心化服务管理

- Provider **自注册**到 ServiceRegistry，而非由中央管理器统一管理
- 符合**开闭原则**，新增 Provider 无需修改现有代码
- ServiceCenter 仅负责 Facade 装配，不涉及具体实现

### 3. 内核与业务隔离

- Controller 层不直接依赖具体 Provider 实现
- 通过 ServiceCenter 的 Facade 模式统一接口
- 便于单元测试与 Mock 替换

### 4. 事件驱动

- 所有跨模块通信均通过 EventBus
- 避免循环依赖与紧耦合
- 支持异步操作与消息历史

### 5. 主题化 UI

- 所有样式使用 CSS 变量
- 模块化 CSS 文件，按功能分区
- 支持深色/浅色模式自动切换

### 6. 单一职责

- SessionManager: 仅负责会话数据管理，无 UI 依赖
- ToolRegistry: 仅负责工具注册，无执行逻辑
- ServiceCenter: 仅负责服务装配，无业务逻辑

## 版本信息

- **扩展版本**: 0.3.3
- **Manifest 版本**: 3
- **架构版本**: MVC v0.0.1
- **最后更新**: 2026-05-19
