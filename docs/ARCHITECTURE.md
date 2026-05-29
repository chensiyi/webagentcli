# Web Agent Client 架构文档 v2.0

> 文档同步于 2026-05-28，已对齐当前代码库实现。

## 项目概述

Web Agent Client 是一个基于 **Manifest V3** 的 Chrome Extension，为 AI Agent 提供网页端执行环境。采用 **MVC 分层架构**，通过**事件总线（EventBus）**实现组件解耦。

### 核心特性

- 🎯 **MVC 架构**：清晰的分层设计，职责明确
- 🔌 **插件化 Provider**：支持 OpenAI、LM Studio、OpenRouter 等多种 AI 服务
- 💬 **会话管理**：支持多会话管理，每个会话独立管理消息历史
- 🌊 **流式响应**：实时渲染 AI 回复，支持思考过程展示
- 🎨 **主题化 UI**：模块化 CSS 设计，支持深色/浅色模式

### 架构设计原则

1. **Controller 协调模式**：ChatController 负责协调 SessionManager 和 ProviderService，管理流式请求和状态
2. **SessionManager 持久化**：SessionManager 负责会话和消息的持久化，提供 CRUD 操作
3. **EventBus 事件驱动**：所有跨模块通信均通过 EventBus，实现组件解耦
4. **ServiceCenter 统一管理**：提供全局服务的统一访问入口

## 架构分层

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
│  │  CHAT.*, SESSION.*, SETTINGS.*, UI.* 等事件              │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 监听事件 & 调用 Controller
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Controller Layer (适配层)                     │
│  ┌──────────────┐                                                 │
│  │   Chat       │  协调 UI 与 Services，管理流式请求和状态        │
│  │ Controller   │                                                 │
│  └──────┬───────┘                                                 │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           ServiceCenter (Facade 装配)                     │    │
│  │  • 从 ServiceRegistry 获取 API 实例                       │    │
│  │  • 返回统一的 ChatService Facade                          │    │
│  └────────────────────┬──────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────────┘
                        │ 调用 API 方法
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Service Layer (业务服务)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          SessionManager (会话管理)                        │    │
│  │  • 管理多个 Session 实例                                 │    │
│  │  • 提供会话和消息的持久化                                │    │
│  │  • createSession(), addMessage(), streamChunkMessage()   │    │
│  └─────────────────────────────────────────────────────────┘    │
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
│  │                  Models (数据结构)                         │    │
│  │  Message | Session | Settings | Model | ...              │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EventBus (全局事件总线)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
webagentcli/
├── manifest.json              # Chrome Extension 配置 (Manifest V3)
├── sidepanel/                 # 侧边栏主目录
│   ├── sidepanel.html         # 入口 HTML，按顺序加载所有模块
│   ├── js/                    # JavaScript 代码
│   │   ├── app.js             # 应用初始化与页面路由
│   │   ├── background.js      # Service Worker 入口
│   │   ├── core/              # 核心层
│   │   │   ├── events/        # 事件系统
│   │   │   │   ├── EventBus.js       # 全局事件总线单例
│   │   │   │   └── Events.js         # 事件常量定义
│   │   │   └── models/        # 数据模型
│   │   │       ├── BaseModel.js        # 基础模型类
│   │   │       ├── Message.js          # 消息模型
│   │   │       ├── Session.js          # 会话模型
│   │   │       ├── Settings.js         # 设置模型
│   │   │       └── ...                 # 其他模型
│   │   ├── services/          # 服务层 ⭐
│   │   │   ├── ServiceCenter.js      # 框架服务管理中心 ⭐
│   │   │   ├── SessionManager.js     # 会话管理器 (具体实现)
│   │   │   ├── SettingsManager.js    # 设置管理器 (具体实现)
│   │   │   ├── StorageManager.js     # 存储管理器 (具体实现)
│   │   │   ├── ScriptsManager.js     # 脚本管理器 (具体实现)
│   │   │   ├── ModelManager.js       # 模型管理器 (具体实现)
│   │   │   ├── ISessionManager.js    # 会话管理器接口
│   │   │   ├── IAppSettings.js       # 应用设置接口
│   │   │   ├── IProviderAPIService.js # Provider 服务接口
│   │   │   └── ProviderAPIServices/  # 具体 Provider 实现
│   │   │       ├── OpenAIService.js
│   │   │       ├── LMStudioService.js
│   │   │       └── OpenRouterService.js
│   │   ├── controllers/       # 控制器层 (适配层)
│   │   │   └── ChatController.js     # 聊天控制器 (协调 UI 与 Services)
│   │   ├── pages/             # UI 页面层 (View)
│   │   │   ├── ChatPage.js           # 对话页面渲染
│   │   │   ├── ChatEventHandler.js   # 对话页面事件处理
│   │   │   ├── HistoryPage.js        # 历史页面
│   │   │   ├── SettingsPage.js       # 设置页面
│   │   │   ├── SettingsEventHandler.js
│   │   │   └── ...
│   │   └── utils/             # 工具函数
│   │       ├── dom.js                # DOM 创建工具
│   │       ├── toast.js              # Toast 通知
│   │       └── ...
│   └── theme/                 # CSS 主题样式 (模块化)
│       ├── variables.css      # CSS 变量定义
│       ├── chat-components.css# 聊天专用组件
│       └── ...
└── docs/                      # 项目文档
    ├── ARCHITECTURE.md        # 架构文档 (本文件)
    └── CORE_MODELS.md         # 数据模型说明
```

## 核心模块详解

### 1. ChatController (聊天控制器)

**位置**: `sidepanel/js/controllers/ChatController.js`

ChatController 负责协调 SessionManager 和 ProviderService，管理流式请求和运行时状态。

#### 职责

- 接收 UI 层发送的消息请求
- 协调 SessionManager 进行消息持久化
- 调用 ProviderService 进行流式 API 请求
- 管理运行时状态（当前请求、流式状态）
- 通过 EventBus 广播事件通知 UI 更新

#### 核心方法

**sendMessage(params)**

```javascript
async sendMessage({ content, sessionId = null, chatService = null, model = null, reasoningEffort = undefined }) {
  // 1. 获取或创建会话
  const session = sessionId ? sessionManager.getSession(sessionId) : sessionManager.getCurrentSession();
  
  // 2. 持久化用户消息
  const userMsg = new Message({ role: 'user', content: content.trim() });
  await sessionManager.addMessage(userMsg, session.id);
  
  // 3. 构造请求
  const request = new MessagesRequest({
    model: modelId,
    messages: session.messages,
    stream: true,
    thinking: thinkingEffort !== 'off' ? new ThinkingConfig(thinkingEffort) : null
  });
  
  // 4. 持久化助手消息（空内容）
  const assistantMsg = new Message({ role: 'assistant', content: '' });
  await sessionManager.addMessage(assistantMsg, session.id);
  
  // 5. 执行流式请求
  await service.chatStream(
    request,
    (chunk) => {
      // 流式分片：持久化
      sessionManager.streamChunkMessage(assistantMsgId, {
        content: chunk.content || '',
        reasoning_content: chunk.reasoning_content || ''
      }, session.id);
      
      // 通知 UI 更新
      this.eventBus.emit(Events.CHAT.STREAM_CHUNK_APPEND, {
        sessionId: session.id,
        messageId: assistantMsgId,
        content: chunk.content || '',
        reasoning_content: chunk.reasoning_content || ''
      });
    },
    () => {
      // 完成
      this.eventBus.emit(Events.CHAT.STREAM_COMPLETE, {
        sessionId: session.id,
        messageId: assistantMsgId
      });
    }
  );
}
```

**其他方法**
- `stopGeneration()` - 停止生成
- `clearMessages()` - 清空当前会话消息
- `deleteMessage(messageId)` - 删除指定消息
- `hasActiveActivities()` - 是否有活跃活动
- `getQueueStatus()` - 获取队列状态

### 2. SessionManager (会话管理器)

**位置**: `sidepanel/js/services/SessionManager.js`

SessionManager 负责会话和消息的持久化管理，提供完整的 CRUD 操作。

#### 职责

- 管理多个 Session 实例
- 提供会话的创建、加载、删除、更新操作
- 提供消息的添加、更新、删除操作
- 处理流式分片的持久化
- 通过 EventBus 发布会话和消息变更事件

#### 核心方法

**会话管理**
- `createSession(options)` - 创建新会话
- `getSession(sessionId)` - 获取指定会话
- `getCurrentSession()` - 获取当前会话
- `loadSession(sessionId)` - 加载指定会话并设为当前
- `deleteSession(sessionId)` - 删除会话
- `updateSession(sessionId, updater)` - 更新会话
- `getAllSessions()` - 获取所有会话列表

**消息管理**
- `addMessage(message, sessionId)` - 添加消息到会话
- `updateMessage(messageId, updater, sessionId)` - 更新消息
- `streamChunkMessage(messageId, chunk, sessionId)` - 流式分片更新消息
- `deleteMessage(messageId, sessionId)` - 删除消息
- `clearMessages(sessionId)` - 清空会话中的所有消息

#### 使用示例

```javascript
// 创建会话
const session = sessionManager.createSession({ title: '新对话' });

// 添加消息
const userMsg = new Message({ role: 'user', content: 'Hello' });
await sessionManager.addMessage(userMsg, session.id);

// 流式更新
sessionManager.streamChunkMessage(messageId, {
  content: 'Hello ',
  reasoning_content: ''
}, session.id);
```

### 3. ServiceCenter (服务中心)

**位置**: `sidepanel/js/services/ServiceCenter.js`

ServiceCenter 是框架核心服务管理中心，提供全局服务的统一访问入口。

#### 职责

- 管理所有核心服务实例（SessionManager、SettingsManager 等）
- 处理 Provider 服务的注册和切换
- 提供 ChatController 单例
- 作为服务的 Facade 层

#### 核心方法

- `getSessionManager()` - 获取 SessionManager 实例
- `getSettingsManager()` - 获取 SettingsManager 实例
- `getStorageManager()` - 获取 StorageManager 实例
- `getScriptsManager()` - 获取 ScriptsManager 实例
- `getModelManager()` - 获取 ModelManager 实例
- `getCurrentProviderService()` - 获取当前 Provider 服务实例
- `updateProviderService(settings)` - 更新 Provider 服务配置
- `getChatController()` - 获取 ChatController 实例

### 4. EventBus (事件总线)

**位置**: `sidepanel/js/core/events/EventBus.js`

全局事件总线，实现组件间的解耦通信。

#### 核心事件

**聊天相关**
- `CHAT.USER_MESSAGE_SENT` - 用户发送消息
- `CHAT.MESSAGE_ADDED` - 消息已添加
- `CHAT.MESSAGE_UPDATED` - 消息已更新
- `CHAT.MESSAGE_DELETED` - 消息已删除
- `CHAT.STREAM_START` - 流式开始
- `CHAT.STREAM_CHUNK_APPEND` - 流式分片追加
- `CHAT.STREAM_COMPLETE` - 流式完成
- `CHAT.STREAM_ERROR` - 流式错误
- `CHAT.STREAM_STOP` - 流式停止
- `CHAT.SESSION_CREATED` - 会话创建
- `CHAT.SESSION_SWITCHED` - 会话切换

**设置相关**
- `SETTINGS.LOADED` - 设置已加载
- `SETTINGS.UPDATED` - 设置已更新

## 核心设计原则

### 1. Controller 协调模式

- ChatController 负责协调 SessionManager 和 ProviderService
- Controller 管理最小运行时状态（当前请求、流式状态）
- 不持有 Session 引用，从 SessionManager 获取最新状态

### 2. 持久化与运行时分离

- SessionManager 负责数据持久化
- ChatController 负责运行时协调
- 职责清晰，避免状态不一致

### 3. UI 层解耦

- UI 层只发出事件，不关心实现细节
- EventHandler 监听事件，触发 Controller 操作
- 符合单一职责原则

### 4. 事件驱动

- 所有跨模块通信均通过 EventBus
- 避免循环依赖与紧耦合
- 支持异步操作与消息历史

## 开发指南

### 添加新的 Provider

1. **创建服务文件**: 在 `js/services/ProviderAPIServices/` 创建 `XxxService.js`

2. **继承抽象基类**:
   ```javascript
   class XxxService extends IProviderAPIService {
     configure(config) { /* ... */ }
     async chatStream(params, onChunk, onComplete) { /* ... */ }
     // ... 实现所有抽象方法
   }
   ```

3. **注册服务**: 在 `ServiceCenter.createProviderService()` 中添加 case 分支

4. **添加脚本引用**: 在 `sidepanel.html` 中添加 `<script src="js/services/ProviderAPIServices/XxxService.js"></script>`

### 添加新的事件

1. **定义事件常量**: 在 `js/core/events/Events.js` 中添加
   ```javascript
   const Events = {
     CHAT: {
       MY_EVENT: 'chat:myEvent'
     }
   };
   ```

2. **发布事件**: 
   ```javascript
   window.EventBus.emit(Events.CHAT.MY_EVENT, { data });
   ```

3. **订阅事件**:
   ```javascript
   window.EventBus.on(Events.CHAT.MY_EVENT, (data) => {
     console.log('Event received:', data);
   });
   ```

## 版本信息

- **扩展版本**: 0.3.3
- **Manifest 版本**: 3
- **架构版本**: MVC v2.0.0 (Controller + SessionManager)
- **最后更新**: 2026-05-28

### 主要变更

#### v0.3.3 - 当前版本

- ✅ ChatController 负责协调 SessionManager 和 ProviderService
- ✅ SessionManager 负责会话和消息的持久化
- ✅ ServiceCenter 提供统一的服务访问入口
- ✅ EventBus 实现组件解耦通信
- ✅ 支持多种 AI Provider（OpenAI、OpenRouter、LM Studio）
- ✅ 支持思考模式（reasoning）配置
- ✅ 模块化 CSS 主题系统

---

推荐阅读：
- [CORE_MODELS.md](CORE_MODELS.md) - 核心数据模型说明
- [sidepanel/README.md](../sidepanel/README.md) - Side Panel 模块说明