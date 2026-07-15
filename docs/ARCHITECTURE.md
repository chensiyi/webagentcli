# Web Agent Client 架构文档

> 架构版本：Microkernel 0.7.5 · 与当前代码库保持同步

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
├── kernel/                          # 核心内核（TypeScript · 零外部依赖，可脱离浏览器运行）
│   ├── Kernel.ts                   # 核心内核：服务注册、生命周期、状态机
│   ├── IPC.ts                      # 消息总线（优先级、来源追踪、中间件）
│   ├── Bootloader.ts               # 启动序列（4 阶段）
│   ├── Events.ts                   # 内核事件常量
│   ├── Keys.ts                     # 内部键名常量
│   ├── globals.d.ts                # 全局类型声明
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
│   │       ├── LMStudioService.ts
│   │       └── sse.ts              # SSE 流式解析
│   │
│   └── utils/                      # 内核纯函数工具
│       ├── clone.ts
│       ├── id.ts
│       └── url.ts
│
├── bridge/                         # 跨进程通信层（Shell ↔ Kernel）
│   ├── RPC.ts                      # RPCServer：背景暴露 facade，统一请求/响应/错误回传
│   ├── IPCTransport.ts             # IPC 经 chrome.runtime 消息在 Shell 与 Kernel 间桥接
│   └── serialize.ts                # 跨进程参数/返回值序列化
│
├── background/                     # Service Worker 入口（内核宿主 + 脚本注入 + 媒体存储）
│   ├── main.ts                     # SW 入口：ensureBoot 懒启动 Kernel、Phase 4 暴露 RPC、脚本注入
│   ├── rpc-facades.ts              # 跨进程 RPC 控制器（session(含 confirmResolve)/tools/settings/storage/scripts/kernel/media facade）
│   ├── preset-installer.js         # 预装脚本远程拉取与安装
│   ├── script-executor.js          # 用户脚本注入执行（main / isolated world 调度）
│   ├── script-tools.js             # 脚本工具桥接
│   ├── gm-api.js                   # 油猴 GM_* API 实现
│   ├── keys.js
│   └── services/
│       ├── chromeStorage.ts        # IStorageManager 落地（chrome.storage 封装）
│       └── mediaStore.ts           # 媒体二进制存储（IndexedDB，消息持 mediaId 引用）
│
├── sidepanel/                      # Svelte 5 UI Shell（不持有内核，经 bridge 连 Kernel）
│   ├── index.html                  # 入口 HTML（manifest side_panel.default_path → dist/sidepanel/index.html）
│   ├── main.ts                     # Shell 入口：建 IPC + IPCTransport 连 Kernel、待 BOOT_COMPLETE、挂 Svelte
│   ├── Sidepanel.svelte            # 根组件（Sidebar + 6 页路由）
│   ├── api-contract.ts             # Shell→Kernel RPC 契约类型
│   ├── components/                 # Svelte 组件
│   │   ├── atoms/                  # 原子组件（Button/IconButton/Badge/Spinner）
│   │   ├── forms/                  # 表单组件（Input/Select/Switch/Slider/CodeEditor）
│   │   ├── layout/                 # 布局组件（Sidebar/Card/EmptyState/PagePlaceholder）
│   │   └── overlays/               # 覆盖层（Toast/ToastContainer/Dialog/Tooltip + toast-store）
│   ├── pages/                      # 页面组件（6 个）
│   │   ├── ChatPage.svelte         # 对话页面
│   │   ├── HistoryPage.svelte      # 历史页面
│   │   ├── StoragePage.svelte      # 存储页面
│   │   ├── ScriptsPage.svelte      # 脚本页面
│   │   ├── SettingsPage.svelte     # 设置页面
│   │   ├── ToolsPage.svelte        # 工具管理页面
│   │   └── chat/                   # 聊天子组件（MessageBubble / ToolCallCard / ToolMessageCard / ToolPanel / MediaBlock / Lightbox / EffortControl / StreamingIndicator）
│   ├── styles/                     # 全局样式（tokens / utilities / components / pages）
│   ├── userscripts/                # 用户脚本源 + 预装白名单（单一目录）
│   │   ├── presets.json            # 预装清单（文件名数组）
│   │   ├── page-pet.user.js        # 迷你宠物 UI（预装）
│   │   ├── page_to_markdown.user.js# @tool → page_to_markdown_script（预装）
│   │   └── pet-chat.*              # 宠物脚本配套资源
│   └── utils/                      # 壳层工具 / 状态
│       ├── dom.ts / text.ts / time.ts
│       ├── kernel-ready.ts         # 等待 Kernel 就绪工具
│       ├── shell-cache.ts          # Shell 侧缓存层（currentSessionId 等，globalThis 单例）
│       └── confirm-store.svelte.ts # 确认气泡 store（danger 工具确认闸门）
│
├── dist/                           # 构建产物（vite 多入口）
│   ├── background.bundle.js        # Service Worker 包
│   ├── sidepanel/                  # 侧边栏（index.html + index.bundle.js）
│   ├── svelte-app.bundle.js        # Svelte 运行时 / 共享块
│   └── assets/                     # 静态资源
│
├── docs/                           # 文档
│   ├── ARCHITECTURE.md             # 本文件
│   ├── TARGETS.md                  # 开发计划（目标 + 状态 + 链接）
│   ├── CORE_MODELS.md              # 数据模型说明
│   ├── SESSION_ORCHESTRATION.md    # 会话编排细节
│   ├── JS_TOOL_STRATEGY.md         # JS 工具策略
│   ├── TAMPERMONKEY_ALIGN.md       # 油猴对齐设计
│   └── TAMPERMONKEY_COMPAT.md      # 油猴兼容矩阵
│
├── manifest.json
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
`sidepanel/` 是壳（Shell），经 `bridge/` 连接内核 `kernel/`；内核实际运行在 `background/` Service Worker。更换 Shell 时（如 CLI 版本），只需替换 `sidepanel/` 并实现同样的 bridge 客户端，kernel 与 background 无需改动。

### 两进程架构

```
Service Worker (background/main.ts)              Sidepanel (Svelte 5 Shell)
    │                                              │
    │  ensureBoot() 懒启动 Kernel                  │  建 IPC + IPCTransport
    │  Kernel 自举（Bootloader 4 阶段）            │  连接 background Kernel
    │  注册服务 / 内置工具 / mediaStore            │  监听 KERNEL.BOOT_COMPLETE
    │  Phase 4 暴露 RPC（session/tools/…）         │  挂载 Svelte 根组件
    │  脚本自动注入（script-executor）             │  6 个 UI 页面经 bridge 调 RPC
    │  监听 tabs.onActivated / storage.onChanged  │
    │                                              │
    └──────── chrome.storage / chrome.runtime 消息 ──┘
            共享数据层 + 跨进程 IPC 桥（bridge/IPCTransport）
```

> 内核只在 Service Worker 中自举一次（`background/main.ts` 的 `bootKernel()`），Sidepanel 不持有内核实例，仅通过 `bridge/IPCTransport` 把 IPC 消息桥接到 background，并经 `bridge/RPC` 调用暴露的 facade。Service Worker 被回收后由 `ensureBoot()` 重新唤醒内核，Shell 侧 `kernel-ready` 负责等待就绪。

### 三层事件体系
应用层与内核层通过三层事件通信：

```
UI 层 (ChatPage / Shell)                内核层 (background: orchestration/session.ts)
    │                                      │
    │  api.session.send()                 │
    │  / api.session.stop()               │
    │  (Shell→Kernel RPC 入口，经          │
    │   bridge/IPCTransport 跨进程)        │
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
| **UI 层** | `api.session.send()`, `api.session.stop()` | Shell→Kernel 的 RPC 统一入口（发送/停止消息），经 `bridge/IPCTransport` 跨进程发往 background |
| **RPC 服务层（background）** | `createSessionFacade.send()` / `stop()` | 位于 `background/rpc-facades.ts`，直接调用 `runConversation` / `cancelConversation`，经 `onEvent`/`emit` 把流式与生命周期事件回灌 SESSION 通道（命令祈使式，与过去式事件区分） |
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

> **跨进程桥接**：内核运行在 Service Worker，Sidepanel 是独立上下文，二者各有独立 IPC 实例。`bridge/IPCTransport` 把一侧 `emit` 的消息经 `chrome.runtime` 消息转发到另一侧，使 IPC 在 Shell 与 Kernel 间透明互通；`bridge/RPC` 在其上提供请求/响应式的 facade 调用（见下方「Shell 详解」与 `background/rpc-facades.ts`）。

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

**内置工具**（`background/tools/`）：
- `RunUserScriptTool` — 在当前活动 tab 执行用户 JS（Turing-complete 万能工具），标 `danger` 需确认
- `ManageUserScriptsTool` — 用户脚本**写操作**（install / update / toggle / delete），标 `danger` 需确认（同文件导出 `GetUserScriptsTool`）
- `GetUserScriptsTool` — 用户脚本**只读查询**（list / get），安全免确认（从 ManageUserScriptsTool 拆出，避免只读操作也弹确认气泡）
- `ScriptTool` — `@tool` 用户脚本的通用执行包装（handler 在目标页执行脚本并注入 `__toolArgs`，return 值作为工具结果）

> **截图能力已脚本化（不再内置）**：原 `CaptureScreenshotTool`（强耦合内核、依赖 mediaStore、经 `userMedia` 注入 user 图片消息）已移除。
> 改为预装 `@tool` 脚本 `sidepanel/userscripts/screenshot.user.js`（`capture_screenshot`），经 `@tool` 机制自动注册。
> 脚本流程：经 `GM_captureVisibleTab`（background 桥接，调用 SW 专属的 `chrome.tabs.captureVisibleTab`）截图 → 脚本自带上传拿到**网络 URL** → `GM_insertComposerMedia` 把 URL 推给 shell → shell 复用「粘贴→媒体块」管线把 URL 录入**输入框**（仅插入、由用户手动发送）。内核不再有任何截图专属逻辑（`userMedia` 注入、`mediaStore` 截图接线均已删除）。

工具注册在 START 阶段完成（`background/main.ts`）：
```typescript
const builtInTools = [
  new RunUserScriptTool(),
  new GetUserScriptsTool(kernel),
  new ManageUserScriptsTool(kernel),
];
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

**位置**：`background/`（Service Worker，`script-executor.js` / `script-tools.js` / `gm-api.js`）+ 内核 `ScriptsManager`

由 `background/main.ts` 在 READY 阶段经 `syncRegisteredScripts()` 把已启用的用户脚本注册到 `chrome.userScripts`（持久化，SW/内核回收后注入仍继续）；`script-executor.js` 负责按 `@match` 在 main / isolated world 调度执行，`gm-api.js` 提供 `GM_*` API 实现：
- 监听 `tabs.onActivated`/`tabs.onUpdated` — 标签页切换/加载时按 `@match` 规则注入脚本
- 监听 `storage.onChanged` — 脚本数据变更时自动重新注入
- 启动时延迟注入当前活跃标签页

### 8. PRESET_SCRIPTS（预装脚本体系）

**位置**：`sidepanel/userscripts/` + `background/preset-installer.js`

预装脚本与本地用户脚本共用同一目录，避免双份冗余：

- **单一脚本目录**：所有脚本源放在 `sidepanel/userscripts/`，其中 `presets.json` 是预装白名单（文件名数组）——只有列进清单的脚本才随版本发布预装，目录里其余 `.user.js` 仅作本地源。
- **远程拉取**：首次启动（及升级）时，`preset-installer.js` 从 `https://cdn.jsdelivr.net/gh/chensiyi/webagentcli@<当前版本>/sidepanel/userscripts` 拉取 `presets.json` + 各 `.user.js`，经 `installOrUpdate` 进 `ScriptsManager`；jsDelivr 回 `access-control-allow-origin: *`，规避 SW 跨域 CORS 限制。
- **与 @tool 自动注册衔接**：预装脚本若含 `@tool` 声明，由 `ScriptsManager` 解析 `toolMeta` → `reconcileScriptTools` 经 `ToolsManager.register`（source='script'）注册为可调 AI 工具（如 `page_to_markdown.user.js` → `page_to_markdown_script`）。
- **幂等升级**：storage 记录 `{ [name|namespace]: version }`；同版本跳过（保留用户编辑/删除），版本变化原地更新；拉取失败（离线/该 tag 暂无清单）跳过，不阻断启动。

> 预装基址按 `chrome.runtime.getManifest().version` 取版本 tag；发布扩展时给仓库打 `vX.Y.Z` tag 并含 `sidepanel/userscripts/` 即生效，无需重包扩展。

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

### 内核自举流程（`background/main.ts`）

内核仅在 Service Worker 中自举一次，由 `ensureBoot()` 懒启动（Shell 首次连接或 SW 唤醒时触发）：

```
1. ensureBoot() → bootKernel()（幂等，避免重复启动）
2. 创建 ConsoleLogger → Kernel（注入 ipc / origin）
3. 创建 Bootloader，注册启动钩子
4. INIT 阶段    → IPC ready（基础设施就绪）
5. REGISTER 阶段 → 注册所有 Service 工厂（toolsManager / capabilities / storageManager / sessionManager / settingsManager / scriptsManager / processManager / providerFactory）
6. START 阶段   → kernel.boot() 初始化服务
               → 注册内置工具（RunUserScript / GetUserScripts / ManageUserScripts / CaptureScreenshot）
               → 创建 mediaStore（IndexedDB 媒体存储）
               → 安装预装脚本（preset-installer，首次/升级）
7. READY 阶段   → 暴露 RPC（session(含 confirmResolve)/tools/settings/storage/scripts/kernel/media）
               → 同步已启用脚本注册到 chrome.userScripts
               → 设置 mediaResolver / mediaDeleter
8. 发出 KERNEL.BOOT_COMPLETE → Shell 收到后即可安全调用 RPC
```

### Shell 入口流程（`sidepanel/main.ts`）

Shell 不持有内核，仅建立与 background 的连接并挂载 UI：

```
1. 创建 IPC 实例（origin: 'sidepanel-shell'）
2. 创建 IPCTransport，连接到 background Kernel
3. 监听 KERNEL.BOOT_COMPLETE / BOOT_ERROR（带 3s 超时保护）
4. 收到就绪后 mount(Sidepanel)，注入 ipc 实例
5. Svelte 组件经 bridge 调 RPC（api.*），不直接访问 kernel 模块
```

#### Kernel 访问方式（Shell 侧）

Shell 不通过 Svelte Context 持有 kernel 实例，而是通过 `bridge/RPC` 客户端调用 background 暴露的 facade：

```typescript
// 页面组件经 ipc + RPC 客户端调用，如 api.session.send(...)
// 具体契约见 sidepanel/api-contract.ts，背景实现见 background/rpc-facades.ts
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

1. **优先**通过 `bridge/RPC` 客户端调用 background 暴露的 facade（`api.*`）访问内核能力，不直接持有 kernel 实例
2. **Chrome API 调用**集中在背景层（`background/`），壳层不渗入；`sidepanel/` 仅做 UI
3. 所有 UI 开发在 `sidepanel/`（Svelte 5）中进行

### 添加新的内置工具

1. 在 `background/tools/` 创建 `XxxTool.js`
2. 继承 `Tool` 类，在 `super()` 中传入定义和 handler
3. 在 `background/main.ts` 的 START 阶段加入 `builtInTools` 数组（无依赖的纯逻辑工具直接 `new XxxTool()`；若需 `mediaStore` 等依赖，像 `RunUserScriptTool` 那样按依赖注入）

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
3. 在 `background/main.ts` 的 `RPCServer.expose('session', ...)` 的 `methods` 列表里登记新方法名，Shell 侧 `api-contract.ts` 同步补充。

> 历史说明：早期曾设独立的 `kernel/eventhandler/` 层按「消息组」接线，但会话命令本就是 RPC 入口、由 facade 直接驱动编排更贴切，已于 v0.6.7 移除该层，命令接线内联进 session RPC facade。

### 添加新的事件

1. 在 `kernel/Events.ts` 中对应的命名空间下添加常量
2. 事件名格式：`{domain}:{action}`（小写 + 冒号）
3. 示例：`session:streamStart`, `settings:loaded`

### 添加新页面

1. 在 `sidepanel/pages/` 创建 Svelte 组件
2. 在 `sidepanel/Sidepanel.svelte` 的 `PAGES` 数组注册 `{ id, icon, label }`
3. 在侧边栏模板中添加条件渲染
