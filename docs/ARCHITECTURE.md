# Web Agent Client 架构文档

> 架构版本：Microkernel v0.6.6 · 与当前代码库保持同步

## 核心理念

**Web Agent Client 本质上是一个操作系统内核**，而非普通的 Web 应用。其架构设计遵循操作系统工程规范：

| OS 概念 | 本软件对应 | 实现 |
|---|---|---|
| **Kernel** | `Kernel.ts` | 服务注册、生命周期、启动序列 |
| **IPC/消息队列** | `IPC.ts` | 优先级消息、来源追踪、中间件链 |
| **系统调用** | `ToolsManager.ts` | 工具注册表、调用审计 |
| **权限门控** | `CapabilityManager.ts` | 声明式权限、动态授权 |
| **进程管理** | `ProcessManager` + `Process` | 进程 CRUD、生命周期、状态机 |
| **用户程序** | `ChatProgram` | 聊天指令（内核级程序） |
| **设备驱动** | `IProviderAPIService` | AI Provider 热插拔 |
| **文件系统** | `IStorageManager` | chrome.storage 封装 |
| **内核日志** | `Log.ts` / `ConsoleLogger.ts` | 控制台日志输出 |
| **Bootloader** | `Bootloader.ts` | 4 阶段标准化启动序列 |

## 目录结构

```
webagentcli/
│
├── kernel/                          # 核心内核（TypeScript · 零外部依赖）
│   ├── Kernel.ts                   # 核心内核：服务注册、生命周期、状态机
│   ├── IPC.ts                      # 消息总线（优先级、来源追踪、中间件）
│   ├── ToolsManager.ts             # 工具管理器（替代 ToolRegistry + IToolService）
│   ├── CapabilityManager.ts        # 权限门控
│   ├── Bootloader.ts               # 启动序列（4 阶段）
│   ├── Events.ts                   # 内核事件常量
│   ├── index.ts                    # 统一导出
│   │
│   ├── models/                     # 数据模型（纯数据，无壳依赖）
│   │   ├── BaseModel.ts
│   │   ├── Message.ts
│   │   ├── MessageContent.ts
│   │   ├── Session.ts
│   │   ├── Settings.ts
│   │   ├── Model.ts
│   │   ├── Tool.ts                 # 统一工具模型（Tool + ToolCall + ToolResult）
│   │   ├── Process.ts
│   │   └── Scripts.ts
│   │
│   ├── programs/                   # 内核程序（事件驱动的业务编排）
│   │   ├── ChatProgram.ts          # 聊天程序（发送/流式/工具循环/会话切换）
│   │   └── chat/                   # 聊天子模块
│   │
│   ├── services/                   # 核心服务实现
│   │   ├── SessionManager.ts       # 会话/消息持久化
│   │   ├── SettingsManager.ts      # 设置管理
│   │   ├── ScriptsManager.ts       # 脚本管理
│   │   ├── ProcessManager.ts       # 进程管理
│   │   ├── ProviderFactory.ts      # Provider 工厂
│   │   ├── ConsoleLogger.ts        # 控制台日志实现
│   │   ├── Log.ts                  # 日志工具类
│   │   ├── ILogger.ts              # 日志接口
│   │   ├── IStorageManager.ts      # 存储接口
│   │   ├── ISettings.ts            # 设置接口
│   │   ├── IScriptsManager.ts      # 脚本接口
│   │   ├── ISessionManager.ts      # 会话接口
│   │   ├── IProviderAPIService.ts  # Provider API 接口
│   │   └── ProviderAPIServices/    # AI Provider 实现
│   │       ├── OpenAIService.ts
│   │       ├── OpenRouterService.ts
│   │       └── LMStudioService.ts
│   │
│   └── tools/                      # 工具定义（已迁移至 sidepanel/tools/）
│
├── index.html                      # 入口 HTML
├── sidepanel/                      # Svelte 5 UI + Service Worker
│   ├── background.js               # Service Worker（脚本自动注入）
│   ├── main.ts                     # 入口：Kernel 自举 + 挂载 Svelte App
│   ├── Sidepanel.svelte            # 根组件（Sidebar + 5 页路由）
│   ├── components/                 # Svelte 组件
│   │   ├── atoms/                  # 原子组件
│   │   ├── forms/                  # 表单组件
│   │   ├── layout/                 # 布局组件（Sidebar 等）
│   │   └── overlays/               # 覆盖层组件（Toast/Dialog 等）
│   ├── pages/                      # 页面组件
│   │   ├── ChatPage.svelte         # 对话页面
│   │   ├── HistoryPage.svelte      # 历史页面
│   │   ├── StoragePage.svelte      # 存储页面
│   │   ├── ScriptsPage.svelte      # 脚本页面
│   │   ├── SettingsPage.svelte     # 设置页面
│   │   └── chat/
│   │       ├── MessageBubble.svelte
│   │       ├── ChatEventHandler.ts
│   │       └── ...
│   ├── services/                   # 壳层服务
│   │   └── chromeStorage.ts
│   ├── tools/                      # 内置工具实现
│   │   ├── RunUserScriptTool.js
│   │   └── ManageUserScriptsTool.js
│   ├── styles/                     # 全局样式
│   │   ├── tokens.css
│   │   ├── utilities.css
│   │   ├── components.css
│   │   └── pages.css
│   └── utils/                      # 工具函数
│       ├── dom.ts
│       ├── text.ts
│       └── time.ts
│
├── dist/                           # 构建产物
│   ├── assets/svelte-app.css       # Svelte 5 样式
│   └── svelte-app.bundle.js        # Svelte 5 打包
│
├── docs/
│   ├── ARCHITECTURE.md             # 本文件
│   └── CORE_MODELS.md              # 数据模型说明
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── svelte.config.mjs
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
`sidepanel/` 是壳（Shell），依赖内核 `kernel/`。更换 Shell 时（如 CLI 版本），kernel 无需改动一行代码。

### 两进程架构

```
Service Worker (background.js)              Sidepanel (Svelte 5)
    │                                              │
    │  持续运行，不依赖 Kernel                     │  按需打开，Kernel 自举
    │  监听 tabs.onActivated                      │  IPC EventBus
    │  监听 storage.onChanged                     │  5 个 UI 页面
    │  脚本自动注入                                │  ChatProgram
    │                                              │
    └────────────── chrome.storage ────────────────┘
                  共享数据层
```

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

### 1. Kernel.ts（核心内核）

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

**核心方法**：

| 方法 | 说明 |
|------|------|
| `register(name, factory, options)` | 注册服务工厂（支持 `dependsOn` / `autoInit` / `singleton`） |
| `get(name)` | 获取已初始化的服务实例 |
| `boot()` | 按依赖顺序初始化所有服务 |
| `shutdown()` | 反向顺序关闭所有服务 |
| `on(phase, hook)` | 注册生命周期钩子 |
| `getInfo()` | 返回当前状态、服务列表、子系统信息 |

**便捷方法**：
```typescript
kernel.getSessionManager()      // → SessionManager
kernel.getSettingsManager()     // → SettingsManager
kernel.getStorageManager()      // → IStorageManager
kernel.getScriptsManager()      // → ScriptsManager
kernel.getProcessManager()      // → ProcessManager
kernel.getProviderFactory()     // → ProviderFactory
kernel.getIPC()                 // → IPC
```

### 2. IPC.ts（消息总线）

| 能力 | 说明 |
|---|---|
| `emit(event, data, { priority, origin })` | 优先级 + 来源追踪 |
| `use(middleware)` | 中间件链（类似 Express） |
| `createChannel(namespace)` | 命名空间通道 |
| `getStats()` | 消息吞吐量统计 |

**事件优先级**：
- `LOW`（0）— 后台/非关键
- `NORMAL`（1）— 默认
- `HIGH`（2）— 用户交互
- `CRITICAL`（3）— 系统级

### 3. ToolsManager.ts（工具管理器）

```typescript
toolsManager.register(tool)               // 注册工具
toolsManager.get(name)                     // 按名称查找
toolsManager.getEnabled()                  // 获取所有已启用工具
toolsManager.getDefinitionsForLLM()        // 获取 LLM 可用的工具定义
toolsManager.invoke(toolCall, context)     // 统一执行入口（封装 handler 调用、计时、结果包装）
toolsManager.unregister(name)              // 注销
```

`ToolsManager` 替代了之前的 `ToolRegistry` + `IToolService`，统一管理注册、查询、执行。

### 4. CapabilityManager.ts（权限门控）

```typescript
capabilities.declare(toolName, capabilities)  // 声明工具所需权限
capabilities.grant(sessionId, capability)     // 授予权限
capabilities.check(toolName, capability)      // 检查权限
capabilities.require(toolName, capability)    // 要求权限（deny by default）
capabilities.onDeny(handler)                  // 拒绝回调
```

### 5. Bootloader.ts（启动序列）

4 阶段标准化启动（8→4 精简后）：

| 阶段 | 职责 |
|---|---|
| 1. INIT | 初始化 IPC、Log、ToolsManager、CapabilityManager |
| 2. REGISTER | 注册所有 Service 工厂到 Kernel |
| 3. START | 初始化服务 + 加载配置 + 注册工具 + 创建 Programs |
| 4. READY | 就绪 |

**使用方式**（`sidepanel/main.ts`）：
```typescript
const bootloader = new Bootloader(kernel);

bootloader.on(Bootloader.PHASES.INIT, async () => {
  // 基础设施就绪
});

bootloader.on(Bootloader.PHASES.REGISTER, async () => {
  kernel.register('sessionManager', async () => {
    return new SessionManager({ ipc, storage, log });
  });
});

bootloader.on(Bootloader.PHASES.START, async () => {
  await kernel.boot();  // 初始化所有服务
  // 注册工具、创建 Programs
});

await bootloader.boot();
```

## 核心模块详解

### 1. ChatProgram（聊天程序 — 内核级）

**位置**：`kernel/programs/ChatProgram.ts`

ChatProgram 是内核级的聊天编排程序，由 Shell 层在 START 阶段初始化一次，永久复用。

**指令接口**（ChatEventHandler 鉴权后转发）：
```typescript
ChatProgram.CMD.SEND            // 发送消息 { content, sessionId?, model?, reasoningEffort? }
ChatProgram.CMD.STOP            // 停止生成
ChatProgram.CMD.DELETE_MESSAGE  // 删除消息 { messageId }
```

**输出事件**（通过 IPC emit）：
```typescript
kernel.ipc.emit('chat:streamStart', { sessionId })
kernel.ipc.emit('chat:streamChunkAppend', { content, reasoningContent })
kernel.ipc.emit('chat:streamComplete', { sessionId, messageId })
kernel.ipc.emit('chat:streamError', { sessionId, error })
kernel.ipc.emit('chat:streamStop', { sessionId })
kernel.ipc.emit('chat:tool:executing', { toolCallId, toolName })
kernel.ipc.emit('chat:tool:completed', { toolCallId, result })
kernel.ipc.emit('chat:tool:allCompleted', { sessionId })
kernel.ipc.emit('chat:messageDeleted', { messageId })
```

**生命周期**：
- 由 Shell 层在 START 阶段创建
- 会话切换时：如果正在交互（`_active`），自动取消当前流式请求
- 可通过 `destroy()` 方法销毁（移除所有事件监听）

### 2. ChatEventHandler（聊天事件处理 — 应用层转译）

**位置**：`sidepanel/pages/chat/ChatEventHandler.ts`

应用层的鉴权转译层，职责：
1. 监听 UI 层的 `USER_APPLY_*` 事件
2. 鉴权、参数校验
3. 转译为 `ChatProgram.CMD.*` 指令转发
4. 监听 ChatProgram 输出事件（`chat:streamChunkAppend` 等）更新 Svelte 状态

### 3. SessionManager（会话管理器）

**位置**：`kernel/services/SessionManager.ts`

会话/消息的"唯一真相源"，负责持久化。

| 方法 | 说明 |
|------|------|
| `createSession(title?)` | 创建新会话 |
| `getSession(id)` | 按 ID 获取会话 |
| `getAllSessions()` | 获取所有会话（按 updatedAt 降序） |
| `getCurrentSession()` | 获取当前会话 |
| `switchSession(sessionId)` | 切换当前会话 |
| `deleteSession(sessionId)` | 删除会话及所有消息 |
| `addMessageToSession(sessionId, message)` | 添加消息 |
| `removeMessageFromSession(sessionId, messageId)` | 删除消息 |
| `updateMessageInSession(sessionId, messageId, updater)` | 更新消息 |

### 4. ProcessManager（进程管理器）

**位置**：`kernel/services/ProcessManager.ts`

管理子任务的生命周期和状态机。

**Process 状态机**：
```
CREATED → RUNNING → COMPLETED
                 → FAILED
                 → CANCELLED
```

| 方法 | 说明 |
|------|------|
| `create(goal, parentProcessId?)` | 创建子任务 |
| `start(id)` | 启动任务 |
| `cancel(id)` | 取消任务 |
| `fail(id, error)` | 标记任务失败 |
| `complete(id, output)` | 标记任务完成 |
| `get(id)` | 获取任务 |
| `list(includeCompleted?)` | 列出所有任务 |
| `getBySession(sessionId)` | 按会话获取任务 |

### 5. Provider API Service（AI 服务抽象）

**位置**：`kernel/services/ProviderAPIServices/`

所有 AI Provider 实现统一接口，实现热插拔：
- `OpenAIService.ts` — OpenAI 官方 API
- `OpenRouterService.ts` — OpenRouter（兼容 OpenAI 协议）
- `LMStudioService.ts` — LM Studio 本地服务

Provider 通过 `ProviderFactory` 按 `settings.apiStandard` 创建，Shell 层无需关心具体实现。

### 6. Tool System（工具系统）

**工具模型**：`kernel/models/Tool.ts`

统一工具模型，一个 `Tool` 对象同时包含定义（供 LLM 识别）和执行能力：

```typescript
class Tool {
  name: string;           // 工具名
  description: string;    // 描述（LLM 可见）
  inputSchema: object;    // JSON Schema 参数定义
  handler: Function;      // 执行函数
  enabled: boolean;       // 开关
  capabilities: string[]; // 能力标签
  toOpenAIFunction()      // → OpenAI function calling 格式
}
```

同文件中还包含 `ToolCall`（调用记录）和 `ToolResult`（执行结果）。

**工具管理器**：`kernel/ToolsManager.ts`

```typescript
class ToolsManager {
  register(tool)                     // 注册 Tool 实例
  get(name)                          // 按名称查找
  getEnabled()                       // 获取所有已启用工具
  getDefinitionsForLLM()             // 获取 LLM 可用工具定义
  invoke(toolCall, context)          // 统一执行入口
  getInvocationHistory(filters)      // 调用历史
  getStats()                         // 统计信息
}
```

**内置工具**（`sidepanel/tools/`）：
- `RunUserScriptTool` — 在当前活动 tab 执行用户 JS（Turing-complete 万能工具）
- `ManageUserScriptsTool` — 用户脚本 CRUD（list / get / install / update / toggle / delete）

工具注册在 START 阶段完成：
```typescript
const builtInClasses = [RunUserScriptTool, ManageUserScriptsTool];
builtInClasses.forEach((ToolClass) => {
  const tool = new ToolClass();
  toolsManager.register(tool);
});
```

**工具调用流程**：
```
LLM 返回 tool_calls
    ↓
ToolExecutor 遍历每个 tool_call
    ↓
ToolsManager.invoke(toolCall, context)
    ├── 查找 Tool 实例
    ├── beforeInvoke 钩子检查
    ├── 执行 tool.handler(args, context)
    ├── afterInvoke 钩子
    └── 返回 ToolResult（含状态、输出、耗时）
    ↓
ToolResult 以 tool role 消息写入 Session
    ↓
LLM 收到结果后继续（ReAct 循环）
```

### 7. ScriptInjector（脚本自动注入 — Service Worker 层）

**位置**：`sidepanel/background.js`

不依赖 Kernel，直接读取 `chrome.storage`，作为 Service Worker 持续运行：
- 监听 `tabs.onActivated`/`tabs.onUpdated` — 标签页切换/加载时按 `@match` 规则注入脚本
- 监听 `storage.onChanged` — 脚本数据变更时自动重新注入
- 启动时延迟注入当前活跃标签页

## 事件系统参考

### 完整事件列表（`kernel/Events.ts`）

| 命名空间 | 事件 | 说明 |
|---------|------|------|
| **KERNEL** | `kernel:bootStart` | 内核启动开始 |
| | `kernel:bootPhase` | 启动阶段变更 |
| | `kernel:bootComplete` | 内核启动完成 |
| | `kernel:bootError` | 内核启动失败 |
| | `kernel:shutdown` | 内核关闭 |
| | `kernel:stateChanged` | 内核状态变更 |
| | `kernel:serviceRegistered` | 服务注册 |
| | `kernel:serviceInitialized` | 服务初始化 |
| | `kernel:serviceStateChanged` | 服务状态变更 |
| | `kernel:serviceError` | 服务错误 |
| **CHAT** | `chat:messageAdded` | 消息已添加 |
| | `chat:streamStart` | 流式开始 |
| | `chat:streamChunkAppend` | 流式分片追加 |
| | `chat:streamComplete` | 流式完成 |
| | `chat:streamError` | 流式错误 |
| | `chat:streamStop` | 流式停止（用户主动） |
| | `chat:sessionCreated` | 会话已创建 |
| | `chat:sessionSwitched` | 会话已切换 |
| | `chat:sessionDeleted` | 会话已删除 |
| | `chat:sessionLoaded` | 会话已加载 |
| | `chat:sessionUpdated` | 会话已更新 |
| | `chat:userApplySend` | 用户发送操作（Shell→Handler） |
| | `chat:userApplyStop` | 用户停止操作（Shell→Handler） |
| | `chat:userApplyDeleteMessage` | 用户删除消息操作（Shell→Handler） |
| **SETTINGS** | `settings:loaded` | 设置已加载 |
| | `settings:updated` | 设置已更新 |
| | `settings:saved` | 设置已保存 |
| | `settings:modelChanged` | 模型已切换 |
| | `settings:apiStandardChanged` | API 标准已切换 |
| | `settings:modelsLoaded` | 模型列表已加载 |
| **TOOL** | `tool:executing` | 工具开始执行 |
| | `tool:completed` | 工具执行完成 |
| | `tool:allCompleted` | 本轮所有工具执行完毕 |
| | `tool:error` | 工具执行错误 |
| **TASK** | `task:created` | 任务已创建 |
| | `task:statusChanged` | 任务状态变更 |
| | `task:completed` | 任务已完成 |
| | `task:failed` | 任务失败 |
| | `task:cancelled` | 任务已取消 |

## 壳层（Shell）详解

### 入口启动流程（`sidepanel/main.ts`）

```
1. 创建 ConsoleLogger → IPC → ToolsManager → CapabilityManager
2. 创建 Kernel 实例，注入子系统
3. 创建 Bootloader，注册启动钩子
4. INIT 阶段  → IPC ready（基础设施就绪）
5. REGISTER 阶段 → 注册所有 Service 工厂
6. START 阶段 → kernel.boot() 初始化服务
             → 注册内置工具
             → 创建 ChatProgram + ChatEventHandler
             → settingsManager.loadSettings()
7. bootloader.boot() 完成
8. mount(Sidepanel, target) 挂载 Svelte 根组件
```

#### Kernel Context 注入

Svelte 组件通过 Svelte Context API 访问 Kernel：
```typescript
// sidepanel/Sidepanel.svelte
setContext('kernel', kernel);

// 任何子组件
const kernel = getContext('kernel');
const sessionManager = kernel.getSessionManager();
```

## 向后兼容保证

1. **IPC API** 不变：`emit` / `on` / `off` / `once` / `getHistory` 全部保留
2. **Events 常量** 兼容：`KernelEvents.CHAT.*` 保留全部旧常量
3. **服务访问** 统一通过 `kernel.get('serviceName')` 或 `kernel.getXxxManager()` 便捷方法
4. **Shell 交换**：更换 Shell 时，kernel 无需改动一行代码

## 开发指南

### 内核原则（修改 kernel/ 时）

1. **不引用** `window`、`chrome.*`、`document`
2. **不引用** `sidepanel/` 中的任何代码
3. **测试**可以在 Node.js 中直接运行（`vitest`）
4. **新增功能**应先在 kernel 中注册服务，再在 shell 中消费

### 壳层原则（修改 sidepanel/ 时）

1. **优先**通过 `kernel.get('serviceName')` 访问服务
2. **Chrome API 调用**集中在壳层，不渗入 kernel
3. 所有 UI 开发在 `sidepanel/`（Svelte 5）中进行

### 添加新的内置工具

1. 在 `sidepanel/tools/` 创建 `XxxTool.js`
2. 继承 `Tool` 类，在 `super()` 中传入定义和 handler
3. 在 `sidepanel/main.ts` 的 START 阶段加入 `builtInClasses` 数组

```typescript
class MyNewTool extends Tool {
  constructor() {
    super({
      name: 'my_new_tool',
      description: '...',
      inputSchema: { ... },
      handler: async (args, context) => { ... }
    });
  }
}
```

### 添加新的内核程序

1. 在 `kernel/programs/` 创建 `XxxProgram.ts`
2. 声明 `static CMD = Object.freeze({...})` 指令接口
3. 构造器中订阅自己的 `CMD.*` 指令
4. 在 Shell 层的 START 阶段创建实例

### 添加新的事件

1. 在 `kernel/Events.ts` 中对应的命名空间下添加常量
2. 事件名格式：`{domain}:{action}`（小写 + 冒号）
3. 示例：`chat:streamStart`, `settings:loaded`

### 添加新页面

1. 在 `sidepanel/pages/` 创建 Svelte 组件
2. 在 `sidepanel/Sidepanel.svelte` 的 `PAGES` 数组注册 `{ id, icon, label }`
3. 在侧边栏模板中添加条件渲染

## 版本信息

- **扩展版本**：0.6.6（见 `manifest.json` / `package.json`）
- **架构版本**：Microkernel v0.6.6
- **Manifest 版本**：3

### 主要变更（v0.6.5 → v0.6.6）

- ✅ **工具模型统一**：`ToolDefinition` + `IToolService` → 统一的 `Tool` 类（含定义 + handler）
- ✅ **ToolCall / ToolResult 合并**：从独立文件合并到 `Tool.ts`
- ✅ **ToolsManager**：替代 `ToolRegistry` + `IToolService`，统一管理注册和执行
- ✅ **废弃文件清理**：删除 `ToolDefinition.ts`、`IToolService.ts`、`ToolRegistry.ts` 等 9 个废弃文件
- ✅ **RunUserScriptTool 修复**：正确继承 `Tool`，handler 正常注册

### 主要变更（v0.4.0 → v0.6.5）

- ✅ **Kernel TypeScript 化**：所有 `kernel/*.js` 迁移到 `.ts`
- ✅ **ChatProgram**：引入内核级聊天程序，移除 ChatController
- ✅ **三层事件体系**：USER_APPLY_* → ChatEventHandler → ChatProgram.CMD.*
- ✅ **Bootloader 精简**：8 阶段 → 4 阶段（INIT/REGISTER/START/READY）
- ✅ **ProviderFactory 独立**：Provider 不再耦合在 Kernel 上
- ✅ **Svelte 5 UI 统一**：移除旧 JS 架构，全部使用 Svelte 5 + TypeScript
- ✅ **Process 模型**：新增进程生命周期管理
- ✅ **Vite 构建**：替换手写 IIFE，单入口构建
- ✅ **消息序列化归一化**：MessageStructure.toAPIFormat 统一转换
- ✅ **移除 ServiceCenter**：所有引用已迁移至 Kernel
- ✅ **移除 ChatController**：聊天逻辑完全由 ChatProgram 处理
- ✅ **移除 `_sidepanelShim`**：Shell 已全量 ES import，window 桥接已删除
- ✅ **双 Shell 归并**：`src/` → `sidepanel/`，旧 UI 文件全部清理
- ✅ **Background 脚本注入**：独立 Service Worker，不依赖 Kernel

---

**推荐阅读**：
- [CORE_MODELS.md](CORE_MODELS.md) — 数据模型详解