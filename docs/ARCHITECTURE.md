# Web Agent Client 架构文档

> 架构版本：Microkernel v0.5.0 · 与当前代码库保持同步

## 核心理念

**Web Agent Client 本质上是一个操作系统内核**，而非普通的 Web 应用。其架构设计遵循操作系统工程规范：

| OS 概念 | 本软件对应 | 实现 |
|---|---|---|
| **Kernel** | `Kernel.js` | 服务注册、生命周期、启动序列 |
| **IPC/消息队列** | `IPC.js` | 优先级消息、来源追踪、中间件链 |
| **系统调用** | `ToolRegistry.js` + `IToolService` | 工具注册表、调用审计 |
| **权限门控** | `CapabilityManager.js` | 声明式权限、动态授权 |
| **进程管理** | `SessionManager` | 会话 CRUD、状态机 |
| **用户程序** | `ChatProgram` | 聊天指令（内核级程序） |
| **设备驱动** | `IProviderAPIService` | AI Provider 热插拔 |
| **文件系统** | `StorageManager` | chrome.storage 封装 |
| **内核日志** | `KernelLog.js` | 等级化日志、缓冲、订阅 |
| **Bootloader** | `Bootloader.js` | 8 阶段标准化启动序列 |

## 目录结构

```
webagentcli/
│
├── kernel/                          # ★ 独立内核（零外部依赖）
│   ├── Kernel.js                   # 核心内核：服务注册、生命周期、状态机
│   ├── IPC.js                      # 消息总线（优先级、来源追踪、中间件）
│   ├── KernelLog.js                # 统一日志系统
│   ├── ToolRegistry.js             # 系统调用注册表
│   ├── CapabilityManager.js        # 权限门控
│   ├── Bootloader.js               # 启动序列（8 阶段）
│   ├── Events.js                   # 内核事件常量
│   ├── index.js                    # 统一导出
│   │
│   ├── models/                     # 数据模型（纯数据，无壳依赖）
│   │   ├── BaseModel.js
│   │   ├── Message.js
│   │   ├── MessageContent.js
│   │   ├── Session.js
│   │   ├── Settings.js
│   │   ├── Model.js
│   │   ├── ToolCall.js
│   │   ├── ToolResult.js
│   │   ├── ToolDefinition.js
│   │   └── Scripts.js
│   │
│   ├── programs/                   # 内核程序（事件驱动的业务编排）
│   │   └── ChatProgram.js          # 聊天程序（发送/流式/工具循环/会话切换）
│   │
│   ├── services/                   # 核心服务实现
│   │   ├── SessionManager.js       # 会话/消息持久化
│   │   ├── StorageManager.js       # 存储封装
│   │   ├── SettingsManager.js      # 设置管理
│   │   ├── ScriptsManager.js       # 脚本管理
│   │   ├── ModelManager.js         # 模型管理
│   │   ├── ProcessManager.js       # 进程管理
│   │   ├── ServiceCenter.js        # 向后兼容层
│   │   ├── I*Manager.js            # 接口定义
│   │   └── ProviderAPIServices/    # AI Provider 实现
│   │       ├── IProviderAPIService.js
│   │       ├── OpenAIService.js
│   │       ├── OpenRouterService.js
│   │       └── LMStudioService.js
│   │
│   └── tools/                      # 内置工具（系统调用实现）
│       ├── RunUserScriptTool.js
│       └── ManageUserScriptsTool.js
│
├── sidepanel/                      # ★ Shell A: Chrome 侧边栏
│   ├── sidepanel.html              # 入口（加载顺序见下文）
│   ├── js/
│   │   ├── app.js                  # Bootloader 调用方 + UI 渲染
│   │   ├── events.js               # 应用层事件常量（USER_APPLY_* 等）
│   │   ├── event-handlers/         # 页面事件处理器（鉴权 + 转译）
│   │   │   ├── ChatEventHandler.js # 转译层：USER_APPLY_* → ChatProgram.CMD.*
│   │   │   ├── SettingsEventHandler.js
│   │   │   ├── StorageEventHandler.js
│   │   │   └── ScriptsEventHandler.js
│   │   ├── pages/                  # UI 页面
│   │   │   ├── ChatPage.js
│   │   │   ├── HistoryPage.js
│   │   │   ├── SettingsPage.js
│   │   │   ├── StoragePage.js
│   │   │   └── ScriptsPage.js
│   │   ├── components/             # UI 组件
│   │   └── utils/                  # 工具函数
│   └── theme/                      # CSS 主题
│
├── popup/                          # ★ Shell B: (未来) 弹出窗口
├── cli/                            # ★ Shell C: (未来) 命令行版本
│
└── docs/
    ├── ARCHITECTURE.md             # 本文件
    └── CORE_MODELS.md              # 数据模型说明
```

## 设计原则

### 内核独立原则
`kernel/` 中的代码**不引用** `window`、`chrome.*`、`document` 等浏览器 API，可在任何 JS 环境运行（Node.js、Browser、Worker）。

### 内核最小化原则
Kernel 只做 3 件事：
1. **服务注册** — 管理所有服务的注册、懒加载、生命周期
2. **消息路由** — IPC 总线提供跨模块通信基础设施
3. **生命周期** — boot() / shutdown() / 状态机

所有业务逻辑在 Service 层和 Program 层，Kernel 不执行业务。

### 权限显式化原则
每个系统调用（Tool）需要声明所需权限（`capabilities`），调用前由 CapabilityManager 检查。默认拒绝（deny by default）。

### 事件驱动原则
所有跨模块通信走 IPC Bus，禁止直接引用。IPC 提供：
- 优先级：LOW / NORMAL / HIGH / CRITICAL
- 来源追踪：每个消息携带 origin
- 中间件链：日志、权限、统计等横切关注点

### Shell 可替换原则
`sidepanel/` 只是一个壳（Shell），消费 `kernel/`。更换 Shell 时（如 CLI 版本），kernel 无需改动一行代码。

### 三层事件体系
应用层与内核层通过三层事件通信：

```
UI 层 (ChatPage)           应用层 (ChatEventHandler)           内核层 (ChatProgram)
    │                              │                              │
    │  USER_APPLY_*                │                              │
    │  (用户请求意图)               │                              │
    ├──────→  鉴权 + 参数校验       │                              │
    │                              │  ChatProgram.CMD.*           │
    │                              │  (精确指令)                   │
    │                              ├──────→  执行指令              │
    │                              │                              │  STREAM_*
    │  STREAM_*                    │                              │  TOOL.*
    │  (真实事件驱动 UI)            │  (已有处理)                    │
    │◄──────────────────────────  │                              │
```

| 层 | 事件 | 职责 |
|---|---|---|
| **UI 层** | `USER_APPLY_SEND`, `USER_APPLY_STOP`, `USER_APPLY_DELETE_MESSAGE` | 发射用户操作意图 |
| **应用层** | `ChatProgram.CMD.SEND`, `CMD.STOP`, `CMD.DELETE_MESSAGE` | 鉴权、参数校验、转译为精确指令 |
| **内核层** | `STREAM_START`, `STREAM_COMPLETE`, `TOOL.EXECUTING` 等 | 发射真实业务事件驱动 UI |

## Kernel 子系统详解

### 1. Kernel.js（核心内核）

**状态机**：
```
CREATED ──(boot())──► BOOTING ──► RUNNING
                                      │
                        (shutdown())  │
                          ┌──────────┘
                          ▼
                   SHUTTING_DOWN ──► SHUTDOWN

任意状态 ──(错误)──► FAILED
```

### 2. IPC.js（消息总线）

| 能力 | 说明 |
|---|---|
| `emit(event, data, { priority, origin })` | 优先级 + 来源追踪 |
| `use(middleware)` | 中间件链（类似 Express） |
| `createChannel(namespace)` | 命名空间通道 |
| `getStats()` | 消息吞吐量统计 |

### 3. ToolRegistry.js（系统调用注册表）

```javascript
toolRegistry.register(tool)
toolRegistry.get(name)
toolRegistry.getEnabled()
toolRegistry.getDefinitionsForLLM()
```

### 4. Bootloader.js（启动序列）

8 阶段标准化启动：

| 阶段 | 职责 |
|---|---|
| 1. CORE_INIT | 初始化 IPC、KernelLog、CapabilityManager、ToolRegistry |
| 2. SERVICES_REGISTER | 注册所有 Service 工厂到 Kernel |
| 3. SERVICES_INIT | 按依赖关系初始化 Service |
| 4. TOOLS_REGISTER | 注册内置工具 |
| 5. HANDLERS_INIT | 创建 EventHandler + ChatProgram（内核级程序） |
| 6. CONFIG_LOAD | 加载设置/配置 |
| 7. UI_RENDER | 渲染 UI |
| 8. READY | 就绪 |

## 核心模块详解

### 1. ChatProgram（聊天程序 — 内核级）

**位置**：`kernel/programs/ChatProgram.js`

ChatProgram 是内核级的聊天编排程序，由 `app.js` 在 `HANDLERS_INIT` 阶段初始化一次，挂在 `serviceCenter.chatProgram`，永久复用。

**指令接口**（ChatEventHandler 鉴权后转发）：
```javascript
ChatProgram.CMD.SEND            // 发送消息 { content, sessionId?, model?, reasoningEffort? }
ChatProgram.CMD.STOP            // 停止生成
ChatProgram.CMD.DELETE_MESSAGE  // 删除消息 { messageId }
```

**输出事件**：
```javascript
STREAM_START          // 流式开始（UI 应显示停止按钮）
STREAM_CHUNK_APPEND   // 流式分片（content/reasoning_content）
STREAM_COMPLETE       // 流式结束（UI 应隐藏停止按钮）
STREAM_STOP           // 用户停止
STREAM_ERROR          // 流式错误
TOOL.EXECUTING        // 工具开始执行
TOOL.COMPLETED        // 工具执行完成
TOOL.ALL_COMPLETED    // 本轮所有工具执行完毕
MESSAGE_DELETED       // 消息已删除
```

**生命周期**：
- 由 `app.js` 在 `HANDLERS_INIT` 阶段创建
- 会话切换时：如果正在交互（`_active`），自动取消当前流式请求
- 可通过 `destroy()` 方法销毁（移除所有事件监听）

### 2. ChatEventHandler（聊天事件处理 — 应用层转译）

**位置**：`sidepanel/js/event-handlers/ChatEventHandler.js`

应用层的鉴权转译层，职责：
1. 监听 UI 层的 `USER_APPLY_*` 事件
2. 鉴权、参数校验
3. 转译为 `ChatProgram.CMD.*` 指令转发
4. 监听 ChatProgram 输出事件（`STREAM_CHUNK_APPEND` 等）做 DOM 更新

### 3. ServiceCenter（服务中心 — 向后兼容层）

**位置**：`kernel/services/ServiceCenter.js`

作为 Kernel 的向后兼容 Facade。新代码应通过 `kernel.get('serviceName')` 访问服务。

### 4. SessionManager（会话管理器）

**位置**：`kernel/services/SessionManager.js`

会话/消息的"唯一真相源"，负责持久化。

### 5. Provider API Service（AI 服务抽象）

**位置**：`kernel/services/IProviderAPIService.js`

所有 AI Provider 实现统一接口，实现热插拔：
- OpenAI、OpenRouter、LM Studio

### 6. Tool System（工具系统）

**内置工具**：
- `RunUserScriptTool` — 在当前活动 tab 执行用户 JS
- `ManageUserScriptsTool` — 用户脚本 CRUD

## 壳层（Shell）详解

### sidepanel.html 加载顺序

1. Utils（error-handler / toast / confirm / dom / time）
2. UI Components（UI.js / Chat.js）
3. CodeMirror + Marked（第三方）
4. Events（应用层事件常量）
5. **★ Kernel 模块**（`../kernel/*.js` — 内核核心）
6. Core Models（BaseModel / Message / Session / ...）
7. Kernel Events（`../kernel/Events.js`）
8. 服务接口（`I*Manager.js`）
9. Provider 实现（OpenAI / OpenRouter / LM Studio）
10. 服务实现（SessionManager / SettingsManager / ...）
11. ServiceCenter（向后兼容层）
12. Settings 页面实现
13. **★ Kernel Programs**（`../kernel/programs/ChatProgram.js`）
14. EventHandlers（ChatEventHandler 等）
15. Pages（ChatPage 等）
16. **app.js**（启动入口）

### app.js 启动流程

```javascript
// 1. 创建 IPC / KernelLog / ToolRegistry / CapabilityManager
// 2. 创建 Kernel 实例，注入子系统
// 3. 创建 ServiceCenter（向后兼容层）
// 4. 创建 Bootloader，注册启动钩子
// 5. SERVICES_REGISTER → 注册服务工厂
// 6. SERVICES_INIT → 初始化服务
// 7. TOOLS_REGISTER → 注册工具
// 8. HANDLERS_INIT → 创建 EventHandler + ChatProgram
// 9. CONFIG_LOAD → 加载设置
// 10. 执行 bootloader.boot()
// 11. 渲染 UI
```

## 向后兼容保证

1. **EventBus API** 不变：`on / off / emit / once / getHistory` 全部保留
2. **ServiceCenter API** 不变：`getXxxManager()` / `getTool()` / `getEventBus()` 全部保留
3. **Events 常量** 兼容：`Events.CHAT.*` 保留旧常量，新增 `USER_APPLY_*`
4. **所有 Page** 无需改动

## 开发指南

### 内核原则（修改 kernel/ 时）

1. **不引用** `window`、`chrome.*`、`document`
2. **不引用** `sidepanel/` 中的任何代码
3. **测试**可以在 Node.js 中直接运行

### 壳层原则（修改 sidepanel/ 时）

1. **优先**通过 `kernel.get('serviceName')` 访问服务
2. **新增功能**应先在 kernel 中注册服务，再在 shell 中消费
3. **Chrome API 调用**集中在壳层，不渗入 kernel

### 添加新的内核程序

1. 在 `kernel/programs/` 创建 `XxxProgram.js`
2. 声明 `static CMD = Object.freeze({...})` 指令接口
3. 构造器中订阅自己的 `CMD.*` 指令
4. 在 `app.js` 的 `HANDLERS_INIT` 阶段创建实例
5. 在 `sidepanel.html` 中引入

### 添加新的 EventHandler

1. 在 `sidepanel/js/event-handlers/` 创建页面 EventHandler
2. 监听 `USER_APPLY_*` 事件，鉴权后转译为内核指令
3. 在 `app.js` 的 `HANDLERS_INIT` 阶段创建实例

### 添加新的事件

1. UI 请求事件：在 `sidepanel/js/events.js` 添加 `USER_APPLY_*`
2. 内核指令：在对应 Program 的 `static CMD` 中声明
3. 内核输出事件：在 `kernel/Events.js` 或 `sidepanel/js/events.js` 添加常量

### 添加新页面

1. 在 `sidepanel/js/pages/` 创建页面
2. 在 `sidepanel/js/event-handlers/` 创建对应的 EventHandler
3. 在 `sidepanel.html` 中按依赖顺序引入
4. 在 `app.js` 的 `pages` 数组中注册 `{ id, icon, label }`

## 版本信息

- **内核版本**：0.5.1 (Microkernel + Programs)
- **Manifest 版本**：3
- **架构版本**：Microkernel v0.5.1

### 主要变更（v0.4.0 → v0.5.1）

- ✅ **ChatProgram**：引入内核级聊天程序，替代 ChatController
- ✅ **三层事件体系**：USER_APPLY_* → ChatEventHandler → ChatProgram.CMD.* 
- ✅ **ChatEventHandler**：应用层鉴权转译层，分离 UI 意图与内核指令
- ✅ **移除 ChatController**：聊天逻辑完全由 ChatProgram 处理
- ✅ **移除状态机**：STREAM_START/COMPLETE 等真实事件驱动 UI，不再使用抽象状态机
- ✅ **ChatProgram 生命周期**：由 app.js 统一初始化，会话切换时自动取消进行中的交互

---

**推荐阅读**：
- [CORE_MODELS.md](CORE_MODELS.md) — 数据模型详解
- [sidepanel/README.md](../sidepanel/README.md) — Side Panel 模块说明
- [README.md](../README.md) — 项目入口