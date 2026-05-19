# Web Agent Client 架构文档 v2.0

## 项目概述

Web Agent Client 是一个基于 **Manifest V3** 的 Chrome Extension，为 AI Agent 提供网页端执行环境。采用 **MVC 分层架构** + **Chat-Session 嵌套设计**，通过**事件总线（EventBus）**实现组件解耦。

### 核心特性

- 🎯 **MVC 架构**：清晰的分层设计，职责明确
- 🔄 **Chat-Session 嵌套**：Chat 作为 Session 的运行时增强包装器，内聚交互状态
- 🔌 **插件化 Provider**：支持 OpenAI、LM Studio、OpenRouter 等多种 AI 服务
- 💬 **多实例管理**：每个 Chat 实例独立管理，支持前台聊天和后台 Agent 并存
- 🌊 **流式响应**：实时渲染 AI 回复，支持思考过程展示
- 🛠️ **工具系统**：可扩展的工具注册与调用机制
- 🎨 **主题化 UI**：模块化 CSS 设计，支持深色/浅色模式

## 核心设计：Chat-Session 嵌套架构

### 设计理念

**问题**：传统的 EventBus 完全解耦导致 Chat 和 Session 这种天然嵌套的关系变得松散不可靠，像"牵着磁力连接的风筝"。

**解决方案**：Chat 作为 Session 的运行时增强包装器，内聚所有交互状态。

```
┌─────────────────────────────────────┐
│         Chat (交互上下文)            │
│  ┌───────────────────────────────┐  │
│  │   Session (数据模型)           │  │
│  │   - messages[]                │  │
│  │   - metadata                  │  │
│  │   - reasoningEnabled          │  │
│  └───────────────────────────────┘  │
│                                     │
│  - messageQueue (运行时队列)         │
│  - isStreaming (流式状态)           │
│  - taskQueue (任务队列)             │
│  - chatService (API 服务)           │
└─────────────────────────────────────┘
```

### 关键优势

1. **状态内聚**：所有交互状态（队列、流式）集中在 Chat 实例中
2. **多实例支持**：前台聊天和后台 Agent 可以创建独立的 Chat 实例，互不干扰
3. **避免跨层同步**：UI、持久化、业务逻辑都在 Chat 内部协调
4. **清晰的职责划分**：
   - Session：纯数据模型，负责持久化
   - Chat：运行时上下文，负责交互逻辑
   - Controller：适配层，委托给 Chat
   - UI：只发出事件，不关心实现细节

### 数据流向

```
用户操作 
  → View (ChatPage)
  → 发出 USER_MESSAGE_SENT 事件
    → EventHandler 监听
      → ChatController.sendMessage()
        → SessionManager.getCurrentChat()
          → Chat.sendMessage()
            → Session.addMessage() (持久化)
            → chatService.chatStream() (API 调用)
            → SessionManager.streamChunkMessage() (流式更新)
            → 发出 MESSAGE_ADDED / STREAM_CHUNK_APPEND 事件
              → EventHandler 更新 UI
```

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
│  │  • 返回统一的 ChatService Facade                          │    │
│  └────────────────────┬──────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────────┘
                        │ 调用 API 方法
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Service Layer (业务服务)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Chat (交互上下文) ⭐ NEW                     │    │
│  │  • 持有 Session 引用                                     │    │
│  │  • 持有 SessionManager 引用 (用于持久化)                 │    │
│  │  • 管理运行时状态 (队列、流式)                           │    │
│  │  • 调用 IChatService 进行 API 通信                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          ISessionManager (会话管理)                       │    │
│  │  • 管理多个 Session 实例                                 │    │
│  │  • 管理多个 Chat 实例缓存                                │    │
│  │  • getOrCreateChat() - 获取或创建 Chat                   │    │
│  │  • streamChunkMessage() - 流式分片更新                   │    │
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
├── background.js              # Service Worker 入口
├── sidepanel/                 # 侧边栏主目录
│   ├── sidepanel.html         # 入口 HTML，按顺序加载所有模块
│   ├── js/                    # JavaScript 代码
│   │   ├── app.js             # 应用初始化与页面路由
│   │   ├── core/              # 核心层
│   │   │   ├── events/        # 事件系统
│   │   │   │   ├── EventBus.js       # 全局事件总线单例
│   │   │   │   └── Events.js         # 事件常量定义
│   │   │   └── models/        # 数据模型
│   │   │       ├── index.js          # 模型统一导出
│   │   │       ├── Message.js        # 消息模型
│   │   │       ├── Session.js        # 会话模型
│   │   │       ├── Settings.js       # 设置模型
│   │   │       └── ...               # 其他模型
│   │   ├── services/          # 服务层 ⭐
│   │   │   ├── Chat.js               # Chat 交互上下文 ⭐ NEW
│   │   │   ├── ISessionManager.js    # 会话管理器 (含 Chat 缓存)
│   │   │   ├── IChatService.js       # 聊天服务接口 (纯业务)
│   │   │   ├── ServiceRegistry.js    # 服务注册中心
│   │   │   └── ProviderAPIServices/  # 具体 Provider 实现
│   │   │       ├── OpenAIService.js
│   │   │       ├── LMStudioService.js
│   │   │       └── OpenRouterService.js
│   │   ├── controllers/       # 控制器层 (适配层)
│   │   │   ├── ServiceCenter.js      # 框架服务管理中心
│   │   │   ├── ChatController.js     # 聊天控制器 (委托给 Chat)
│   │   │   ├── SessionController.js  # 会话控制器
│   │   │   ├── SettingsController.js # 设置控制器
│   │   │   └── ...
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
    └── ...
```

## 核心模块详解

### 1. Chat (交互上下文) ⭐ NEW

**位置**: `js/services/Chat.js`

Chat 是 Session 的运行时增强包装器，内聚所有交互状态。

#### 构造函数

```javascript
class Chat {
  constructor(session, chatService, sessionManager, eventBus = null) {
    this.session = session;              // Session 实例
    this.chatService = chatService;      // IChatService 实例
    this.sessionManager = sessionManager;// SessionManager 实例
    this.eventBus = eventBus || window.EventBus;
    
    // 运行时状态 (不持久化)
    this.messageQueue = [];
    this.taskQueue = [];
    this.isStreaming = false;
    this.activeStream = null;
  }
}
```

#### 核心方法

**sendMessage(params)**
```javascript
async sendMessage({ content, reasoningEnabled, reasoningEffort }) {
  // 1. 创建并持久化用户消息
  const userMsg = new Message({ role: 'user', content });
  this.session.addMessage(userMsg);
  this._emitMessageAdded(userMsg);
  
  // 2. 创建并持久化助手消息 (空内容)
  const assistantMsg = new Message({ role: 'assistant', content: '' });
  this.session.addMessage(assistantMsg);
  this._emitMessageAdded(assistantMsg);
  
  // 3. 加入消息队列
  this.messageQueue.push({ id: assistantMsg.id, status: 'pending' });
  
  // 4. 准备请求参数 (从 Session 获取 messages/reasoning 配置)
  const requestParams = {
    messages: this.session.messages.map(m => ({ 
      role: m.role, 
      content: m.content 
    })),
    stream: true,
    reasoningEnabled: reasoningEnabled ?? this.session.reasoningEnabled,
    reasoningEffort: reasoningEffort || this.session.reasoningEffort
  };
  
  // 5. 开始流式请求
  await this.chatService.chatStream(
    requestParams,
    (chunk) => {
      // 流式分片：通过 SessionManager 持久化
      this.sessionManager.streamChunkMessage(assistantMsg.id, chunk);
      
      // 发出事件通知 UI 更新
      this.eventBus.emit(Events.CHAT.STREAM_CHUNK_APPEND, {
        messageId: assistantMsg.id,
        content: chunk.content || '',
        reasoning_content: chunk.reasoning_content || ''
      });
    },
    () => {
      // 完成：清理状态
      this.messageQueue = this.messageQueue.filter(item => item.id !== assistantMsg.id);
      this.isStreaming = false;
      this._notifyActivityState();
    }
  );
}
```

**其他方法**
- `stopGeneration()` - 停止生成
- `clearMessages()` - 清空消息
- `deleteMessage(messageId)` - 删除单条消息
- `setService(chatService)` - 动态切换服务
- `hasActiveActivities()` - 是否有活跃活动
- `getQueueStatus()` - 获取队列状态

#### 使用示例

```javascript
// 前台聊天
const sessionManager = window.sessionManagerInstance;
const chatService = window.ChatService;

const chat = sessionManager.getCurrentChat(chatService);
await chat.sendMessage({ content: 'Hello' });

// 后台 Agent (独立实例)
const agentSession = sessionManager.createSession({ title: 'Agent Task' });
const agentChat = sessionManager.getOrCreateChat(agentSession.id, agentService);
await agentChat.sendMessage({ content: 'Execute task' });
```

### 2. ISessionManager (会话管理)

**位置**: `js/services/ISessionManager.js`

管理多个 Session 实例和 Chat 实例缓存。

#### Chat 实例管理

**getOrCreateChat(sessionId, chatService)**
```javascript
getOrCreateChat(sessionId, chatService) {
  // 检查缓存
  if (this.chatCache.has(sessionId)) {
    const cachedChat = this.chatCache.get(sessionId);
    if (cachedChat.getService() !== chatService) {
      cachedChat.setService(chatService);
    }
    return cachedChat;
  }
  
  // 获取 Session
  const session = this.sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // 创建新的 Chat 实例
  const chat = new Chat(session, chatService, this, this.eventBus);
  this.chatCache.set(sessionId, chat);
  
  return chat;
}
```

**getCurrentChat(chatService)**
```javascript
getCurrentChat(chatService) {
  if (!this.currentSessionId) {
    return null;
  }
  return this.getOrCreateChat(this.currentSessionId, chatService);
}
```

**clearChatCache(sessionId?)**
```javascript
clearChatCache(sessionId = null) {
  if (sessionId) {
    this.chatCache.delete(sessionId);
  } else {
    this.chatCache.clear();
  }
}
```

#### 流式分片更新

**streamChunkMessage(messageId, chunk)**
```javascript
streamChunkMessage(messageId, { content, reasoning_content }) {
  const session = this.getCurrentSession();
  if (!session) return;
  
  const message = session.messages.find(m => m.id === messageId);
  if (!message) return;
  
  // 追加内容
  if (content) {
    message.content += content;
  }
  if (reasoning_content) {
    message.reasoning_content = (message.reasoning_content || '') + reasoning_content;
  }
  
  // 持久化
  this._saveSessions();
  
  // 发出更新事件
  this.eventBus.emit(Events.CHAT.MESSAGE_UPDATED, {
    messageId,
    updater: (msg) => {
      if (content) msg.content += content;
      if (reasoning_content) {
        msg.reasoning_content = (msg.reasoning_content || '') + reasoning_content;
      }
    }
  });
}
```

### 3. ChatController (适配层)

**位置**: `js/controllers/ChatController.js`

作为 UI 层和 Chat 实例之间的适配层，无状态，所有操作委托给 Chat 实例。

#### 核心方法

**_getCurrentChat()**
```javascript
_getCurrentChat() {
  const sessionManager = window.sessionManagerInstance;
  const chatService = window.ChatService;
  
  if (!sessionManager || !chatService) {
    return null;
  }
  
  return sessionManager.getCurrentChat(chatService);
}
```

**sendMessage(params)**
```javascript
async sendMessage(params) {
  const chat = this._getCurrentChat();
  if (!chat) {
    throw new Error('No active chat session');
  }
  
  return await chat.sendMessage(params);
}
```

**其他方法**
- `stopGeneration()` - 委托给 Chat.stopGeneration()
- `clearSession()` - 委托给 Chat.clearMessages()
- `deleteMessage(messageId)` - 委托给 Chat.deleteMessage()
- `setService(chatService)` - 清除 Chat 缓存，下次获取时创建新实例

### 4. ChatEventHandler (事件处理)

**位置**: `js/pages/ChatEventHandler.js`

监听事件，协调持久化和 UI 更新。

#### 核心监听器

**USER_MESSAGE_SENT**
```javascript
this.eventBus.on(Events.CHAT.USER_MESSAGE_SENT, (data) => {
  this._handleUserMessageSent(data);
});

_handleUserMessageSent({ content }) {
  // 只传递 content，Chat 实例从 Session 获取其他信息
  window.ChatController.sendMessage({ content })
    .catch(error => {
      console.error('[ChatEventHandler] Send message failed:', error);
    });
}
```

**MESSAGE_ADDED**
```javascript
this.eventBus.on(Events.CHAT.MESSAGE_ADDED, (data) => {
  // 通知页面重新渲染
  if (window.Pages && window.Pages.chat) {
    window.Pages.chat.render();
  }
});
```

**STREAM_CHUNK_APPEND**
```javascript
this.eventBus.on(Events.CHAT.STREAM_CHUNK_APPEND, (data) => {
  this._handleStreamChunkAppend(data);
});

_handleStreamChunkAppend({ messageId, content, reasoning_content }) {
  // 增量更新 UI，不重新渲染整个列表
  this._updateMessageContent(messageId, content);
  if (reasoning_content) {
    this._updateMessageReasoning(messageId, reasoning_content);
  }
}
```

### 5. ChatPage (UI 渲染)

**位置**: `js/pages/ChatPage.js`

负责渲染聊天界面，发出用户交互事件。

#### 发送消息

```javascript
function sendMessage() {
  if (!inputValue.trim()) return;
  
  const content = inputValue.trim();
  
  // 清空输入
  inputValue = '';
  textarea.value = '';
  
  // 发出事件 (ChatEventHandler 监听并处理)
  window.EventBus.emit(Events.CHAT.USER_MESSAGE_SENT, { content });
}
```

#### 删除消息

```javascript
onClick: (e) => {
  e.stopPropagation();
  if (window.ChatController && typeof window.ChatController.deleteMessage === 'function') {
    window.ChatController.deleteMessage(msg.id);
  }
}
```

## 核心设计原则

### 1. Chat-Session 嵌套

- **Session**: 纯数据模型，负责持久化
- **Chat**: 运行时上下文，内聚交互状态
- **优势**: 状态内聚，避免跨层同步问题

### 2. 多实例支持

- 每个 Chat 实例独立管理自己的 Session、队列、流式状态
- 支持前台聊天和后台 Agent 并存，互不干扰
- 通过 `SessionManager.getOrCreateChat()` 管理生命周期

### 3. Controller 无状态

- Controller 不持有状态，所有状态在 Chat 实例中
- Controller 只作为适配层，委托给 Chat 实例
- 便于测试和替换

### 4. UI 层解耦

- UI 层只发出事件，不关心实现细节
- EventHandler 监听事件，协调持久化和 UI 更新
- 符合单一职责原则

### 5. 事件驱动

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
3. **自注册**:
   ```javascript
   if (window.ServiceRegistry) {
     window.ServiceRegistry.registerProvider('xxx', XxxService);
   }
   ```
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

- **扩展版本**: 0.6.0
- **Manifest 版本**: 3
- **架构版本**: MVC v2.0.0 (Chat-Session Nested)
- **最后更新**: 2026-05-19

### 主要变更

#### v0.6.0 (2026-05-19) - Chat-Session Nested Architecture

- ✅ 新增 Chat.js - 会话交互上下文 (队列、流式、活动追踪)
- ✅ 重构 IChatService - 移除 UI 耦合，保持纯业务接口
- ✅ 重构 ChatController - 无状态适配层，委托给 Chat 实例
- ✅ 更新 ISessionManager - 支持 Chat 实例缓存和管理
- ✅ 清理 ChatEventHandler - 移除冗余持久化逻辑
- ✅ 修复 ChatPage - 删除消息改为调用 ChatController
- ✅ 架构优势：支持多实例独立管理，状态内聚，分层清晰

#### v0.5.0 (2026-05-19) - Architecture Stabilization

- ✅ SessionManager 移至 `services/` 目录并重命名为 `ISessionManager`
- ✅ ServiceCenter 集成：通过 `getSessionManager()` 统一管理会话服务
- ✅ 流式分片持久化：新增 `streamChunkMessage()` 方法
- ✅ 思考气泡样式移至主题文件，移除 JS 硬编码
