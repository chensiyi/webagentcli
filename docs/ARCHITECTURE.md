# Web Agent Client 架构文档

> 架构版本：Microkernel v0.4.0 · 与当前代码库保持同步

## 核心理念

**Web Agent Client 本质上是一个操作系统内核**，而非普通的 Web 应用。其架构设计遵循操作系统工程规范：

| OS 概念 | 本软件对应 | 实现 |
|---|---|---|
| **Kernel** | `Kernel.js` | 服务注册、生命周期、启动序列 |
| **IPC/消息队列** | `IPC.js` | 优先级消息、来源追踪、中间件链 |
| **系统调用** | `ToolRegistry.js` + `IToolService` | 工具注册表、调用审计 |
| **权限门控** | `CapabilityManager.js` | 声明式权限、动态授权 |
| **进程管理** | `SessionManager` | 会话 CRUD、状态机 |
| **设备驱动** | `IProviderAPIService` | AI Provider 热插拔 |
| **文件系统** | `StorageManager` | chrome.storage 封装 |
| **用户程序** | `UserScript` | 页面 MAIN 世界注入执行 |
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
│   ├── Events.js                   # 事件常量
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
│   │   ├── Storage.js
│   │   └── Scripts.js
│   │
│   ├── services/                   # 核心服务实现
│   │   ├── SessionManager.js       # 会话/消息持久化
│   │   ├── StorageManager.js       # 存储封装
│   │   ├── SettingsManager.js      # 设置管理
│   │   ├── ScriptsManager.js       # 脚本管理
│   │   ├── ModelManager.js         # 模型管理
│   │   ├── ScriptInjector.js       # 脚本注入器
│   │   ├── ServiceCenter.js        # 向后兼容层
│   │   ├── I*Manager.js            # 接口定义
│   │   └── ProviderAPIServices/    # AI Provider 实现
│   │       ├── IProviderAPIService.js
│   │       ├── OpenAIService.js
│   │       ├── OpenRouterService.js
│   │       └── LMStudioService.js
│   │
│   └── tools/                      # 内置工具（系统调用实现）
│       ├── IToolService.js
│       ├── RunUserScriptTool.js
│       └── ManageUserScriptsTool.js
│
├── sidepanel/                      # ★ Shell A: Chrome 侧边栏
│   ├── sidepanel.html              # 入口（加载顺序见下文）
│   ├── js/
│   │   ├── app.js                  # Bootloader 调用方 + UI 渲染
│   │   ├── core/events/
│   │   │   ├── EventBus.js         # 桥接到 IPC（向后兼容）
│   │   │   └── Events.js           # 事件常量（桥接 KernelEvents）
│   │   ├── controllers/
│   │   │   └── ChatController.js   # 壳层控制器
│   │   ├── pages/                  # UI 页面
│   │   ├── components/             # UI 组件
│   │   ├── background.js           # Service Worker
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

所有业务逻辑在 Service 层，Kernel 不执行业务。

### 权限显式化原则
每个系统调用（Tool）需要声明所需权限（`capabilities`），调用前由 CapabilityManager 检查。默认拒绝（deny by default）。

### 事件驱动原则
所有跨模块通信走 IPC Bus，禁止直接引用。IPC 提供：
- 优先级：LOW / NORMAL / HIGH / CRITICAL
- 来源追踪：每个消息携带 origin
- 中间件链：日志、权限、统计等横切关注点

### Shell 可替换原则
`sidepanel/` 只是一个壳（Shell），消费 `kernel/`。更换 Shell 时（如 CLI 版本），kernel 无需改动一行代码。

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

**服务注册**：
```javascript
kernel.register('sessionManager', async (k) => {
  const sm = new SessionManager(k.ipc);
  await sm.initialize();
  return sm;
}, {
  autoInit: true,
  dependsOn: []  // 依赖的其他服务
});
```

### 2. IPC.js（消息总线）

保留 EventBus 全部 API，新增 OS 级特性：

| 能力 | 说明 |
|---|---|
| `emit(event, data, { priority, origin })` | 优先级 + 来源追踪 |
| `use(middleware)` | 中间件链（类似 Express） |
| `createChannel(namespace)` | 命名空间通道 |
| `getStats()` | 消息吞吐量统计 |

**向后兼容**：`EventBus` 内部委托给 IPC，所有老代码无感。

### 3. ToolRegistry.js（系统调用注册表）

从 ServiceCenter 拆出的独立模块：

```javascript
toolRegistry.register(tool)
toolRegistry.get(name)
toolRegistry.getEnabled()           // 只返回 enabled 的工具
toolRegistry.getDefinitionsForLLM() // 输出 OpenAI function calling 格式
toolRegistry.findByCapability('execute')  // 按权限查询
toolRegistry.getStats()             // 执行统计
```

### 4. CapabilityManager.js（权限门控）

**预定义权限**：
```javascript
CapabilityManager.CAPABILITIES = {
  NETWORK: 'network',
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  EXECUTE: 'execute',
  FILESYSTEM: 'filesystem',
  USER_SCRIPT: 'user_script',
  PROVIDER: 'provider',
  SETTINGS: 'settings',
  TOOL: 'tool',
  IPC: 'ipc'
}
```

### 5. KernelLog.js（统一日志）

等级化日志 + 缓冲 + 可订阅：

```javascript
log.debug('KERNEL', 'Booting...')
log.info('BOOT', 'Phase completed')
log.warn('TOOL', 'Tool not found', { name: 'xxx' })
log.error('SESSION', 'Load failed', error)
log.onLog(KernelLog.LEVELS.ERROR, (entry) => { /* 发送告警 */ })
```

### 6. Bootloader.js（启动序列）

8 阶段标准化启动：

| 阶段 | 职责 |
|---|---|
| 1. CORE_INIT | 初始化 IPC、KernelLog、CapabilityManager、ToolRegistry |
| 2. SERVICES_REGISTER | 注册所有 Service 工厂到 Kernel |
| 3. SERVICES_INIT | 按依赖关系初始化 Service |
| 4. TOOLS_REGISTER | 注册内置工具 |
| 5. HANDLERS_INIT | 创建 EventHandler（壳层实现） |
| 6. CONFIG_LOAD | 加载设置/配置（壳层实现） |
| 7. UI_RENDER | 渲染 UI（壳层实现） |
| 8. READY | 就绪 |

## 壳层（Shell）详解

### sidepanel/（Chrome 侧边栏）

壳层负责：
1. **加载 kernel 模块**（在 `sidepanel.html` 中通过 `<script>` 加载）
2. **配置启动阶段钩子**（在 `app.js` 中注册到 Bootloader）
3. **桥接 EventBus → IPC**（`EventBus.connectToIPC(ipc)`）
4. **UI 渲染**（Pages / Components / EventHandlers）
5. **Chrome API 适配**（background.js 处理 tab、脚本注入）

### `sidepanel.html` 加载顺序

1. Utils（error-handler / toast / confirm / dom / time）
2. UI Components（UI.js / Chat.js）
3. CodeMirror + Marked（第三方）
4. **EventBus + Events**（桥接层）
5. **★ Kernel 模块**（`../kernel/*.js` — 内核核心）
6. Core Models（BaseModel / Message / Session / ...）
7. 服务接口（`I*Manager.js`）
8. 工具实现（RunUserScriptTool / ManageUserScriptsTool）
9. Provider 实现（OpenAI / OpenRouter / LM Studio）
10. 服务实现（StorageManager / SessionManager / ...）
11. Settings 页面实现
12. ChatController
13. ServiceCenter（向后兼容）
14. EventHandlers + Pages
15. **app.js**（启动入口）

### app.js 启动流程

```javascript
// 1. 检测 Kernel 是否可用
if (typeof Kernel !== 'undefined') {
  // 2. 创建 IPC / KernelLog / ToolRegistry / CapabilityManager
  // 3. 创建 Kernel 实例，注入子系统
  // 4. 创建 Bootloader，注册启动钩子
  // 5. 执行 bootloader.boot()
  // 6. 渲染 UI
} else {
  // 回退到原始启动流程（向后兼容）
}
```

## 向后兼容保证

1. **EventBus API** 不变：`on / off / emit / once / getHistory` 全部保留
2. **ServiceCenter API** 不变：`getXxxManager()` / `getTool()` / `getEventBus()` 全部保留
3. **Events 常量** 不变：`Events.CHAT.*` 等所有事件名不变
4. **所有 EventHandler** 无需改动
5. **所有 Page** 无需改动
6. **所有 Tool** 的 `invoke()` 签名不变

## 核心模块详解

### 1. ServiceCenter（服务中心 — 向后兼容层）

**位置**：`kernel/services/ServiceCenter.js`

注意：ServiceCenter 现在作为 Kernel 的向后兼容 Facade。新代码应通过 `kernel.get('serviceName')` 访问服务，而非直接通过 ServiceCenter。

### 2. ChatController（聊天控制器）

**位置**：`sidepanel/js/controllers/ChatController.js`

协调 SessionManager 与 ProviderService，是聊天模块的中枢。核心流程同 v0.3.3 保持不变。

**状态机**：
```
IDLE ──(sendMessage)──► WAITING ──(收到 reasoning)──► THINKING
                               └──(收到 content)──────► GENERATING
                                                           │
                               (toolCalls 存在)            ▼
                               ┌──► 执行 Tool ──► 续发 ──┘
                               ▼
                           COMPLETED ──(延时)──► IDLE
```

### 3. SessionManager（会话管理器）

**位置**：`kernel/services/SessionManager.js`

会话/消息的"唯一真相源"，负责持久化。关键方法不变。

### 4. Provider API Service（AI 服务抽象）

**位置**：`kernel/services/IProviderAPIService.js`

所有 AI Provider 实现统一接口 `IProviderAPIService`，实现热插拔。

**各 Provider 实现要点**保留不变：
- OpenAIService
- OpenRouterService
- LMStudioService

### 5. Tool System（工具系统）

**位置**：`kernel/tools/IToolService.js`（接口）+ `kernel/tools/*.js`（实现）

每个工具实现 `IToolService` 接口。

**内置工具**：
- `RunUserScriptTool` — 在当前活动 tab 执行用户 JS
- `ManageUserScriptsTool` — 用户脚本 CRUD

### 6. IPC Bus 中间件示例

```javascript
// 日志中间件
ipc.use((message, next) => {
  KernelLog.debug('IPC', `Event: ${message.event}`, {
    priority: message.priorityName,
    origin: message.origin
  });
  return next();
});

// 权限检查中间件
ipc.use((message, next) => {
  if (message.event.startsWith('tool:')) {
    const allowed = capabilities.check('ipc', 'tool');
    if (!allowed) return false; // 拦截
  }
  return next();
});
```

## 开发指南

### 内核原则（修改 kernel/ 时）

1. **不引用** `window`、`chrome.*`、`document`
2. **不引用** `sidepanel/` 中的任何代码
3. **测试**可以在 Node.js 中直接运行

### 壳层原则（修改 sidepanel/ 时）

1. **优先**通过 `kernel.get('serviceName')` 访问服务
2. **新增功能**应先在 kernel 中注册服务，再在 shell 中消费
3. **Chrome API 调用**集中在壳层，不渗入 kernel

### 添加新的 Provider

1. 在 `kernel/services/ProviderAPIServices/` 创建 `XxxService.js`
2. 继承 `IProviderAPIService`，实现接口方法
3. 在 `sidepanel.html` 的 Provider 脚本区引入新文件
4. 在 `sidepanel/js/pages/SettingsPage_*.js` 添加对应的设置表单

### 添加新的工具

1. 在 `kernel/tools/` 创建 `XxxTool.js`
2. 继承 `IToolService`，在构造器中注册
3. 在 `app.js` 的 `TOOLS_REGISTER` 钩子中添加实例化
4. 在 `sidepanel.html` 中引入

### 添加新的事件

1. 在 `kernel/Events.js` 对应分类下添加常量
2. 业务代码中 `kernel.ipc.emit(Events.X.Y, data)` 发布
3. EventHandler 中 `kernel.ipc.on(Events.X.Y, handler)` 订阅

### 添加新页面

1. 在 `sidepanel/js/pages/` 创建页面 + EventHandler
2. 在 `sidepanel.html` 中按依赖顺序引入
3. 在 `app.js` 的 `pages` 数组中注册 `{ id, icon, label }`

## 版本信息

- **内核版本**：0.4.0 (Microkernel)
- **Manifest 版本**：3
- **架构版本**：Microkernel v0.4.0

### 主要变更（v0.3.3 → v0.4.0）

- ✅ **kernel/** 独立目录：内核代码从 `sidepanel/js/` 完全分离
- ✅ **Kernel.js**：服务注册表、生命周期管理、状态机
- ✅ **IPC.js**：消息总线升级（优先级/来源追踪/中间件/命名空间通道）
- ✅ **KernelLog.js**：统一日志系统（等级/缓冲/订阅）
- ✅ **ToolRegistry.js**：系统调用注册表（从 ServiceCenter 拆分）
- ✅ **CapabilityManager.js**：权限门控系统（声明式/运行时检查/审计）
- ✅ **Bootloader.js**：8 阶段标准化启动序列
- ✅ **EventBus → IPC 桥接**：向后兼容，老代码无感
- ✅ **Shell 可替换架构**：`sidepanel/` 可被其他壳替换

---

**推荐阅读**：
- [CORE_MODELS.md](CORE_MODELS.md) — 数据模型详解
- [sidepanel/README.md](../sidepanel/README.md) — Side Panel 模块说明
- [README.md](../README.md) — 项目入口