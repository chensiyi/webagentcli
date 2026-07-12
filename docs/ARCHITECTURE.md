# Web Agent Client 架构文档

> 架构版本：Microkernel v0.6.7 · 与当前代码库保持同步

## 核心理念

**Web Agent Client 本质上是一个操作系统内核**，而非普通的 Web 应用。其架构设计遵循操作系统工程规范：

| OS 概念 | 本软件对应 | 实现 |
|---|---|---|
| **Kernel** | `Kernel.ts` | 服务注册、生命周期、启动序列 |
| **IPC/消息队列** | `IPC.ts` | 优先级消息、来源追踪、中间件链 |
| **系统调用** | `ToolsManager.ts` | 工具注册表、调用审计 |
| **权限门控** | `CapabilityManager.ts` | 声明式权限、动态授权 |
| **进程管理** | `ProcessManager` + `Process` | 进程 CRUD、生命周期、状态机 |
| **用户程序** | `orchestration/session.ts` | 会话编排（每轮纯函数 runConversation/cancelConversation），由 session RPC facade 直接驱动 |
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
│   ├── orchestration/              # 会话编排（每轮纯函数，无单例）
│   │   ├── session.ts              # runConversation / cancelConversation
│   │   ├── session-context.ts      # ContextBuilder — System Prompt + 截断 + API 格式
│   │   ├── session-tools.ts        # ToolExecutor — 工具调用循环
│   │   └── request.ts              # buildTurnRequest / applySessionCache（纯函数）
│   │
│   ├── services/                   # 核心服务实现（全部走 kernel.register 常规注册）
│   │   ├── ToolsManager.ts         # 工具管理器（注册/查询/执行/审计）
│   │   ├── CapabilityManager.ts    # 权限门控（声明式权限/动态授权）
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
    │  脚本自动注入                                │  ChatPage + session RPC facade
    │                                              │
    └────────────── chrome.storage ────────────────┘
                  共享数据层
```

### 三层事件体系
应用层与内核层通过三层事件通信：

```
UI 层 (ChatPage)                      内核层 (orchestration/session.ts)
    │                                      │
    │  api.session.send()                 │
    │  / api.session.stop()               │
    │  (Shell→Kernel RPC 入口)             │
    ├──────→  facade 直接驱动编排           │
    │         runConversation /            │
    │         cancelConversation           │
    │                                      │  SESSION.STREAM_*
    │  SESSION.STREAM_*  / TOOL.*           │  TOOL.*
    │  (真实事件驱动 UI，经 sessionChannel 回灌)  │
    │◄──────────────────────────────────────│
```

| 层 | 入口 | 职责 |
|---|---|---|
| **UI 层** | `api.session.send()`, `api.session.stop()` | Shell→Kernel 的 RPC 统一入口（发送/停止消息） |
| **RPC 服务层** | `createSessionFacade.send()` / `stop()` | 直接调用 `runConversation` / `cancelConversation`，经 `onEvent`/`emit` 把流式与生命周期事件回灌 SESSION 通道（命令祈使式，与过去式事件区分） |
| **内核层** | `SESSION.STREAM_START`, `SESSION.STREAM_COMPLETE`, `TOOL.EXECUTING` 等 | 发射真实业务事件驱动 UI |

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
| `shutdown()` | 反向顺序关闭所有服务（teardown 优先 `shutdown()`，退化到 `destroy()`） |
| `on(phase, hook)` | 注册生命周期钩子 |
| `getInfo()` | 返回当前状态、服务列表、子系统信息 |

**便捷方法**：
```typescript
kernel.getToolsManager()        // → ToolsManager（常规注册服务）
kernel.getCapabilities()        // → CapabilityManager（常规注册服务）
kernel.getSessionManager()      // → SessionManager
kernel.getSettingsManager()     // → SettingsManager
kernel.getStorageManager()      // → IStorageManager
kernel.getScriptsManager()      // → ScriptsManager
kernel.getProcessManager()      // → ProcessManager
kernel.getProviderFactory()     // → ProviderFactory
kernel.getIPC()                 // → IPC
```

> 所有 Manager（含 ToolsManager / CapabilityManager）均经 `kernel.register()` 注册、boot 时初始化，
> 经 `get()` / `getXxx()` 访问。Kernel 构造器仅注入基础设施 `ipc` / `storage`。

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

### 1. 会话编排（orchestration/session.ts — 每轮纯函数）

**位置**：`kernel/orchestration/session.ts`

会话编排层（对标 OpenAI Runner / LangGraph / Vercel streamText 的会话管理范式）：
- 每轮被调用一次、对会话无状态；turn 状态存于模块级 `Map<sessionId, TurnState>`，按 session 作用域——不同会话并发互不互斥，同会话二次 SEND 拦截。
- 不订阅任何 IPC 通道；事件一律通过 `onEvent` 回调外发，由调用方（session RPC facade）注入 emit 接到 SESSION 通道。

**公共入口**：
```typescript
runConversation(kernel, input, { onEvent })   // 解析/创建会话 → 构建上下文 → 流式 → 工具循环（ReAct 递归续轮）→ 写回
cancelConversation(kernel, emit, sessionId?)  // 按 session 精确取消或全部取消
```

**发射的 SESSION 事件**（经 onEvent 外发）：`SESSION.STREAM_START` / `SESSION.STREAM_CHUNK_APPEND` / `SESSION.STREAM_COMPLETE` / `SESSION.STREAM_ERROR` / `SESSION.STREAM_STOP` / `SESSION.MESSAGE_ADDED` / `SESSION.UPDATED`。

> 内核**不再维护**「当前会话指针」，`currentSessionId` 是 Shell 层持有的普通内存变量（见 Shell 侧 `ShellDataCache`）。因此**没有** `CURRENT_SESSION_CHANGED` 这类内核广播事件——切换会话完全由 Shell 侧 `setCurrentSessionId(id) + navigateTo('chat')` 驱动，`{#key activePage}` 重挂载 ChatPage 后用新 id 拉取内容，所有会话请求都把 `currentSessionId` 当参数显式传入内核（无状态记录服务调用）。

**模块拆分**：
- `session-context.ts` — `ContextBuilder`：System Prompt + 历史截断（保护 tool_call/tool_result 配对）+ API 格式转换。
- `session-tools.ts` — `ToolExecutor`：工具调用循环（执行/重试/结果写入/事件发射）。
- `request.ts` — `buildTurnRequest` / `applySessionCache` 纯函数。

### 2. session RPC facade 直接驱动编排（命令接线已内联）

`background/rpc-facades.ts` 的 `createSessionFacade` 是会话命令的统一入口（由 main.ts Phase 4 经 `RPCServer.expose('session', ...)` 暴露为 `api.session.*`）：
- `send()` → 直接 `runConversation(kernel, data, { onEvent: emit })`，流式事件经 `onEvent` 回灌 SESSION 通道。
- `stop()` → 直接 `cancelConversation(kernel, emit)`。
- `create()` / `getCurrent({ sessionId })` → 基于显式 `sessionId` 创建/获取会话视图（`getCurrent` 直接 `getSession(id)` 返回，不再读内核持有的 current）。
- 会话切换**不在内核**：Shell 调 `cache.setCurrentSessionId(id)` 后 `navigateTo('chat')`；`{#key activePage}` 重挂载 ChatPage 用新 id 经 `getCurrent({ sessionId })` 拉内容。
- `delete()` → 调用 `cancelConversation(kernel, emit, sessionId)` 取消待删会话的轮次（`SessionManager.deleteSession()` 自身会 emit `SESSION_DELETED`）。

不再有独立的 `eventhandler/` 层：`USER_APPLY_*` 意图层早已移除，命令由 RPC facade 直接驱动编排，命令与事件均走 SESSION 通道但职责清晰（命令=RPC 入口、事件=流式回灌）。

### 3. SessionManager（会话管理器）

**位置**：`kernel/services/SessionManager.ts`

会话/消息的"唯一真相源"，负责持久化。

| 方法 | 说明 |
|------|------|
| `createSession(title?)` | 创建新会话 |
| `getSession(id)` | 按 ID 获取会话 |
| `getAllSessions()` | 获取所有会话（按 updatedAt 降序） |
| `deleteSession(sessionId)` | 删除会话及所有消息 |
| `discardAllTransient()` | 清空所有未发送空会话（瞬时会话草稿） |
| `discardAllTransientExcept(keepId)` | 清空其他瞬时会话、保留目标（切换会话时用） |

> 注：内核**不持有** `currentSessionId`、`getCurrentSession`、`switchSession` 等「当前会话」概念——这些已被移除（见上文 SESSION 事件说明）。「当前会话」是 Shell 层的内存变量，由 `ShellDataCache.getCurrentSessionId()/setCurrentSessionId()` 维护，仅 `lastSessionId` 做 best-effort 持久化用于冷启动引导。
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

**工具管理器**：`kernel/services/ToolsManager.ts`

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

**内置工具**（`sidepanel/tools/`，路径后迁至 `background/tools/`）：
- `RunUserScriptTool` — 在当前活动 tab 执行用户 JS（Turing-complete 万能工具），标 `danger` 需确认
- `ManageUserScriptsTool` — 用户脚本**写操作**（install / update / toggle / delete），标 `danger` 需确认
- `GetUserScriptsTool` — 用户脚本**只读查询**（list / get），安全免确认（从 ManageUserScriptsTool 拆出，避免只读操作也弹确认气泡）

工具注册在 START 阶段完成：
```typescript
const builtInTools = [new RunUserScriptTool(), new ManageUserScriptsTool(kernel), new GetUserScriptsTool(kernel)];
builtInTools.forEach((tool) => {
  if (!tool || !tool.name) return;
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
| **SESSION** | `session:messageAdded` | 消息已添加 |
| | `session:streamStart` | 流式开始 |
| | `session:streamChunkAppend` | 流式分片追加 |
| | `session:streamComplete` | 流式完成 |
| | `session:streamError` | 流式错误 |
| | `session:streamStop` | 流式停止（用户主动） |
| | `session:sessionCreated` | 会话已创建 |
| | `session:sessionSwitched` | 会话已切换 |
| | `session:sessionDeleted` | 会话已删除 |
| | `session:sessionLoaded` | 会话已加载 |
| | `session:sessionUpdated` | 会话已更新 |
| | `session:userApplySend` | 用户发送操作（Shell→Handler） |
| | `session:userApplyStop` | 用户停止操作（Shell→Handler） |
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
1. 创建 ConsoleLogger → IPC
2. 创建 Kernel 实例，仅注入基础设施（ipc / storage）
3. 创建 Bootloader，注册启动钩子
4. INIT 阶段  → IPC ready（基础设施就绪）
5. REGISTER 阶段 → 注册所有 Service 工厂（含 toolsManager / capabilities）
6. START 阶段 → kernel.boot() 初始化服务
             → 注册内置工具
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
2. **Events 常量**：`KernelEvents.SESSION.*` 为会话消息组常量（原 `chat:*` 已更名为 `session:*`）
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

### 添加新的会话命令（建议在 RPC facade 中直接驱动编排）

1. 若命令属于会话域，直接在 `background/rpc-facades.ts` 的 `createSessionFacade` 中新增方法，方法体直接调用 `orchestration/session.ts` 的 `runConversation` / `cancelConversation`（或新增编排函数），并通过 `emit` 把事件回灌 SESSION 通道。
2. 需要内核命令常量时引用 `KernelEvents.SESSION.ADD_MESSAGE` / `KernelEvents.SESSION.STOP_STREAM`（定义于 `kernel/Events.ts` 的 SESSION 组，祈使式命令、与过去式事件配对）。
3. 在 `BACKGROUND.md` 的 `RPCServer.expose('session', ...)` 的 `methods` 列表里登记新方法名，Shell 侧 `api-contract.ts` 同步补充。

> 历史说明：早期曾设独立的 `kernel/eventhandler/` 层按「消息组」接线，但会话命令本就是 RPC 入口、由 facade 直接驱动编排更贴切，已于 v0.6.7 移除该层，命令接线内联进 session RPC facade。

### 添加新的事件

1. 在 `kernel/Events.ts` 中对应的命名空间下添加常量
2. 事件名格式：`{domain}:{action}`（小写 + 冒号）
3. 示例：`session:streamStart`, `settings:loaded`

### 添加新页面

1. 在 `sidepanel/pages/` 创建 Svelte 组件
2. 在 `sidepanel/Sidepanel.svelte` 的 `PAGES` 数组注册 `{ id, icon, label }`
3. 在侧边栏模板中添加条件渲染

## 版本信息

- **扩展版本**：0.6.7（见 `manifest.json` / `package.json`）
- **架构版本**：Microkernel v0.6.7
- **Manifest 版本**：3

### 主要变更（v0.6.5 → v0.6.6）

- ✅ **工具模型统一**：`ToolDefinition` + `IToolService` → 统一的 `Tool` 类（含定义 + handler）
- ✅ **ToolCall / ToolResult 合并**：从独立文件合并到 `Tool.ts`
- ✅ **ToolsManager**：替代 `ToolRegistry` + `IToolService`，统一管理注册和执行
- ✅ **废弃文件清理**：删除 `ToolDefinition.ts`、`IToolService.ts`、`ToolRegistry.ts` 等 9 个废弃文件
- ✅ **RunUserScriptTool 修复**：正确继承 `Tool`，handler 正常注册

### 主要变更（v0.6.7 续：会话命令接线收敛）

- ✅ **移除 `kernel/eventhandler/` 层**：原 `eventhandler/session.ts` 把 `SESSION.ADD_MESSAGE`/`STOP_STREAM` 命令从同进程 RPC facade emit 出来再接住、转调 `runConversation`/`cancelConversation`，属于「自己跟自己走 IPC 一圈」的冗余绕弯。命令本就是 RPC 入口，由 `createSessionFacade` 直接驱动编排更贴切
- ✅ **命令接线内联进 session RPC facade**：`send()` 直接 `runConversation(kernel, data, { onEvent: emit })`，`stop()` 直接 `cancelConversation(kernel, emit)`；`create()`/`getCurrent({sessionId})`/`delete()` 均基于显式 `sessionId`（无状态记录服务调用）。**内核不再维护「当前会话」**——`switch()`/`getCurrentSession()`/`setCurrentSession()` 及 `CURRENT_SESSION_CHANGED` 广播均已移除，会话切换改由 Shell 层 `setCurrentSessionId(id)+navigateTo('chat')` 驱动（原 eventhandler 订阅 `CURRENT_SESSION_CHANGED`/`SESSION_DELETED` 的取消逻辑，现由 facade 直接承担）
- ✅ **删除 `registerHandlers` 调用**：`background/main.ts` Phase 4 不再 `registerHandlers(kernel, ipc)`，仅保留 `sessionChannel` 供 facade 回灌事件

### 主要变更（v0.6.6 → v0.6.7）

- ✅ **kernel 扁平化**：`kernel/programs/chat/` → `kernel/orchestration/`（session.ts / session-context.ts / session-tools.ts / request.ts）
- ✅ **eventhandler 接管接线**：新增 `kernel/eventhandler/`（按消息组管理），`main.ts` Phase 4 内联的 chat 接线迁此，集中 `registerHandlers(kernel, ipc)`
- ✅ **CHAT 消息组更名为 SESSION**：`KernelEvents.CHAT` → `SESSION`、`KernelChannels.CHAT` → `SESSION`，线协议 `chat:*` → `session:*`（CMD.SEND/STOP 同步更名），Shell（ChatPage/HistoryPage）与 RPC facade 同步更新
- ✅ **CMD 集中**：线协议常量上移至 `kernel/Events.ts`，与 `USER_APPLY_*` 同处
- ✅ **命令用时态区分（去 `cmd:` 中缀）**：`CMD.SEND`（`session:cmd:send`）→ `CMD.ADD_MESSAGE`（`session:addMessage`）、`CMD.STOP`（`session:cmd:stop`）→ `CMD.STOP_STREAM`（`session:stopStream`）。命令用祈使式、事件用过去式（`addMessage` ↔ `messageAdded`），时态本身区分命令与事件，`cmd:` 中缀冗余移除
- ✅ **授权命令并入 SESSION 组**：`CMD.ADD_MESSAGE`/`CMD.STOP_STREAM` 从独立 `CMD` 常量并入 `KernelEvents.SESSION.ADD_MESSAGE`/`STOP_STREAM`（与过去式事件同一命名空间），删除独立 `export const CMD`
- ✅ **ToolsManager / CapabilityManager 移入 `services/`**：两者本是构造器注入子系统，现与其余 Manager 同处 `kernel/services/`；`kernel/` 根只留纯内核原语（Kernel / Bootloader / IPC / Events / Keys）
- ✅ **发送/停止消息统一走 RPC**：移除 `USER_APPLY_SEND`/`USER_APPLY_STOP` 意图层，`session` RPC facade 新增 `send()`/`stop()`，由 facade 直接 `emit(SESSION.ADD_MESSAGE/STOP_STREAM)`，`eventhandler` 仍独占命令→编排接线。至此所有 Shell→Kernel 可执行命令统一经 RPC 入口，流式 `STREAM_*` 事件仍走 IPC 通道回灌
- ✅ **ToolsManager / CapabilityManager 改走常规注册**：不再由 Kernel 构造器注入（移除 `toolsManager`/`capabilities` 字段与构造器 options），改为 Phase 2 `kernel.register('toolsManager'/'capabilities')`，经 `kernel.getToolsManager()`/`getCapabilities()` 访问；Kernel 构造器仅注入基础设施 `ipc`/`storage`。shutdown 服务循环泛化为 `shutdown()` 优先、退化 `destroy()`，两者 teardown 收敛进统一循环

### 主要变更（v0.4.0 → v0.6.5）

- ✅ **Kernel TypeScript 化**：所有 `kernel/*.js` 迁移到 `.ts`
- ✅ **ChatProgram**：引入内核级聊天程序，移除 ChatController
- ✅ **三层事件体系**：USER_APPLY_* → ChatEventHandler → CMD.SEND / CMD.STOP
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