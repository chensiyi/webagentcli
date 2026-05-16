# Web Agent Client 架构文档

## 项目概述

Web Agent Client 是一个 Chrome Extension (Manifest V3)，为 AI Agent 提供网页端执行环境。核心功能包括多会话对话、脚本管理、存储管理、设置管理等。

## 架构分层

项目采用**分层架构**，各层职责明确，通过**事件总线**和**接口规范**进行通信。

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer (Pages)                  │
│  ChatPage | HistoryPage | SettingsPage | ScriptsPage │
│  每个 Page 对应一个 EventHandler 处理用户交互         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Controller Layer                     │
│  ChatController | SessionController | SettingsCtrl  │
│  业务逻辑协调，委托给底层处理                         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                  Service Layer                       │
│  OpenAIService | LMStudioService | OpenRouterService│
│  IProviderAPIService 抽象基类，各 Provider 具体实现  │
│  IChatService 定义 UI 交互回调接口                    │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Core Layer                           │
│  EventBus | Events | Models (Message/Session/...)   │
│  SessionManager | ServiceManager                    │
─────────────────────────────────────────────────────┘
```

## 目录结构

```
webagentcli/
├── manifest.json              # 扩展配置
├── background.js              # Service Worker
├── content.js                 # 内容脚本
├── sidepanel/                 # 侧边栏主目录
│   ├── sidepanel.html         # 入口 HTML
│   ├── js/                    # JavaScript 代码
│   │   ├── app.js             # 应用入口
│   │   ├── core/              # 核心层
│   │   │   ├── events/        # 事件系统
│   │   │   │   ├── EventBus.js
│   │   │   │   └── Events.js
│   │   │   ├── models/        # 数据模型
│   │   │   │   ├── Message.js
│   │   │   │   ├── Session.js
│   │   │   │   ├── Settings.js
│   │   │   │   ├── Storage.js
│   │   │   │   └── Scripts.js
│   │   │   ── stores/        # 状态存储
│   │   │       └── SessionManager.js
│   │   ├── services/          # 服务层
│   │   │   ├── IChatService.js              # UI 交互回调接口
│   │   │   ├── IProviderAPIService.js       # Provider API 抽象基类
│   │   │   └── ProviderAPIServices/         # 具体 Provider 实现
│   │   │       ├── OpenAIService.js
│   │   │       ├── LMStudioService.js
│   │   │       └── OpenRouterService.js
│   │   ├── controllers/       # 控制器层
│   │   │   ├── ChatController.js
│   │   │   ├── SessionController.js
│   │   │   ├── SettingsController.js
│   │   │   ├── StorageController.js
│   │   │   ├── ScriptsController.js
│   │   │   └── ServiceManager.js
│   │   ├── pages/             # UI 页面层
│   │   │   ├── ChatPage.js
│   │   │   ├── ChatEventHandler.js
│   │   │   ├── HistoryPage.js
│   │   │   ├── SettingsPage.js
│   │   │   ├── SettingsEventHandler.js
│   │   │   ├── StoragePage.js
│   │   │   ├── StorageEventHandler.js
│   │   │   ├── ScriptsPage.js
│   │   │   ── ScriptsEventHandler.js
│   │   └── utils/             # 工具函数
│   │       ├── dom.js         # DOM 创建工具
│   │       ├── time.js
│   │       ├── markdown.js
│   │       ├── toast.js
│   │       ├── tooltip.js
│   │       ├── confirm.js
│   │       ├── error-handler.js
│   │       ├── messageTypes.js
│   │       ├── media.js
│   │       ├── thinkingMode.js
│   │       └── ragCodeExtension.js
│   └── theme/                 # CSS 主题样式
│       ├── variables.css      # CSS 变量定义
│       ├── layout.css
│       ├── buttons.css
│       ├── forms.css
│       ├── cards.css
│       ├── chat-components.css
│       ├── settings-ui.css
│       ├── markdown.css
│       ├── tooltips.css
│       ├── dialogs.css
│       ├── badges.css
│       ├── search-results.css
│       ├── animations.css
│       └── utilities.css
└── docs/
    ├── ARCHITECTURE.md        # 本文件
    ├── CORE_MODELS.md         # 数据模型文档
    └── FEATURE_DEVELOPMENT.md # 功能开发文档
```

## 核心模块详解

### 1. 事件系统 (EventBus)

位于 `js/core/events/`，提供应用内所有组件的解耦通信。

- **EventBus.js**: 全局事件总线单例，支持订阅/发布、一次性事件、消息历史记录
- **Events.js**: 事件常量定义，统一管理所有事件名称

**主要事件分类**:
- `CHAT.*`: 消息生命周期、流式请求、会话管理
- `SETTINGS.*`: 设置加载/保存、API 配置变更、模型管理
- `SERVICE.*`: 服务配置/切换/错误
- `UI.*`: 页面切换、主题变更
- `STORAGE.*`: 存储操作
- `SCRIPTS.*`: 脚本管理

### 2. 数据模型 (Models)

位于 `js/core/models/`，定义应用的核心数据结构。

- **Message**: 消息模型，支持 user/assistant/system/tool 角色，包含 tool_calls、reasoning_content 等字段
- **Session**: 会话模型，管理消息列表和元数据
- **Settings**: 设置模型，API 配置、主题等
- **Storage**: 存储模型
- **Scripts**: 脚本模型

### 3. 服务层 (Services)

位于 `js/services/`，实现与外部 API 的通信。

#### 抽象接口

- **IProviderAPIService**: Provider API 服务的抽象基类，定义所有 AI Provider 必须实现的接口
  - `configure(config)`: 配置服务
  - `buildUrl(path)`: 构建 API URL
  - `buildHeaders()`: 构建请求头
  - `formatMessages(messages)`: 格式化消息
  - `buildRequestBody(params)`: 构建请求体
  - `parseResponse(data)`: 解析响应
  - `parseStreamChunk(data)`: 解析流式片段
  - `chat(params)`: 非流式请求
  - `chatStream(params, onChunk, onComplete)`: 流式请求
  - `listModels()`: 获取模型列表
  - `getModelDetails(modelId)`: 获取模型详情

- **IChatService**: 定义聊天服务的标准接口和 UI 交互回调
  - `handleStreamStart(data)`: 流式请求开始
  - `handleStreamUpdate(data)`: 流式内容更新
  - `handleStreamReasoning(data)`: 流式推理内容更新
  - `handleStreamComplete(data)`: 流式请求完成
  - `handleStreamError(data)`: 流式请求错误
  - `confirmDeleteMessage(messageId, onConfirm)`: 确认删除消息

#### 具体实现

- **OpenAIService**: OpenAI 标准 API 实现
- **LMStudioService**: LM Studio 原生 v1 REST API 实现
- **OpenRouterService**: OpenRouter API 实现

#### ServiceManager

全局单例，统一管理 Service 实例的创建和访问，提供类似依赖注入的功能。

### 4. 控制器层 (Controllers)

位于 `js/controllers/`，协调业务逻辑。

- **ChatController**: 聊天核心逻辑，消息队列管理、流式处理、任务队列
- **SessionController**: 会话管理，委托给 SessionManager 进行数据操作
- **SettingsController**: 设置管理
- **StorageController**: 存储管理
- **ScriptsController**: 脚本管理
- **ServiceManager**: 服务管理器

### 5. UI 页面层 (Pages)

位于 `js/pages/`，每个页面由 **Page** 和 **EventHandler** 两部分组成。

- **Page**: 负责渲染页面内容到指定容器
- **EventHandler**: 负责处理该页面的用户交互和事件响应

| 页面 | Page 文件 | EventHandler 文件 |
|------|-----------|-------------------|
| 对话 | ChatPage.js | ChatEventHandler.js |
| 历史 | HistoryPage.js | - |
| 设置 | SettingsPage.js | SettingsEventHandler.js |
| 存储 | StoragePage.js | StorageEventHandler.js |
| 脚本 | ScriptsPage.js | ScriptsEventHandler.js |

### 6. 工具函数 (Utils)

位于 `js/utils/`，提供通用的工具函数。

- **dom.js**: DOM 元素创建工具
- **time.js**: 时间格式化
- **markdown.js**: Markdown 渲染
- **toast.js**: Toast 通知
- **tooltip.js**: 工具提示
- **confirm.js**: 确认对话框
- **error-handler.js**: 全局错误处理
- **messageTypes.js**: 消息类型渲染
- **media.js**: 媒体处理
- **thinkingMode.js**: 思考模式
- **ragCodeExtension.js**: RAG 代码扩展

## 数据流

### 发送消息流程

```
用户输入 → ChatEventHandler → ChatController.sendMessage()
                              ↓
                         创建 Message 对象
                              ↓
                         SessionController.addMessages()
                              ↓
                         SessionManager 存储
                              ↓
                         ChatService.chatStream()
                              ↓
                    ┌─────────────────────────────┐
                    │  流式响应                    │
                    │  ↓                          │
                    │  onChunk(chunk)             │
                    │  ↓                          │
                    │  更新 Message 内容           │
                    │  ↓                          │
                    │  IChatService.handleStream* │
                    │  ↓                          │
                    │  ChatEventHandler 更新 UI    │
                    └─────────────────────────────┘
```

### 设置变更流程

```
用户修改设置 → SettingsEventHandler → SettingsController
                                       ↓
                                  更新 Settings 模型
                                       ↓
                                  chrome.storage.local
                                       ↓
                                  EventBus.emit(SETTINGS.UPDATED)
                                       ↓
                                  各 Controller 响应变更
```

## 扩展 API

### 全局对象

| 对象 | 类型 | 说明 |
|------|------|------|
| `EventBus` | EventBus | 全局事件总线 |
| `Events` | Object | 事件常量 |
| `Message` | Class | 消息模型 |
| `Session` | Class | 会话模型 |
| `SessionManager` | Class | 会话管理器 |
| `SessionController` | Object | 会话控制器 |
| `ChatController` | Object | 聊天控制器 |
| `SettingsController` | Object | 设置控制器 |
| `ServiceManager` | Object | 服务管理器 |
| `IChatService` | Object | 聊天服务接口 |
| `IProviderAPIService` | Class | Provider API 抽象基类 |
| `DOM` | Object | DOM 工具 |
| `Toast` | Object | Toast 通知 |
| `Pages` | Object | 页面注册表 |

## 开发指南

### 添加新的 Provider

1. 在 `js/services/ProviderAPIServices/` 创建新文件 `XxxService.js`
2. 继承 `IProviderAPIService` 并实现所有抽象方法
3. 在 `ServiceManager.js` 中注册服务类
4. 在 `sidepanel.html` 中添加脚本引用

### 添加新的页面

1. 在 `js/pages/` 创建 `XxxPage.js` 和 `XxxEventHandler.js`
2. 在 Page 文件中导出到 `window.Pages.xxx`
3. 在 `sidepanel.html` 中添加脚本引用
4. 在 `app.js` 的 `pages` 数组中添加页面配置

### 添加新的事件

1. 在 `js/core/events/Events.js` 中添加事件常量
2. 使用 `EventBus.emit()` 发布事件
3. 使用 `EventBus.on()` 订阅事件

## 版本信息

- 扩展版本: 0.3.3
- Manifest 版本: 3
