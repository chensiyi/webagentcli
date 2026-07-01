# Web Agent Client — 项目长期笔记

## 项目定位
Chrome MV3 侧边栏扩展，为 AI Agent 提供浏览器内运行环境（多 Provider 接入、多会话、流式对话、Tool Calling、用户脚本注入）。

## 版本
- **唯一版本源**：`package.json`（0.6.0），构建时自动同步到 manifest.json + kernel/index.ts
- 架构代号: Microkernel-Esm

## 当前架构：三层 + Vite ES Module 打包

项目已从 IIFE 桥接模式迁移到 Vite ES Module 统包。Shell 和 Kernel 统一打包为单个 ES module。

### 三层

| 层 | 位置 | 职责 | 状态 |
|---|---|---|---|
| **Background** | `sidepanel/js/background.js` | Service Worker，触发 sidepanel 打开、脚本注入 | 极简，已完成 |
| **Kernel 微内核** | `kernel/*.ts` | 业务逻辑、数据模型、服务、Provider 封装、可脱离 UI 运行的程序 | 已完整迁移到 TS |
| **Shell 壳层** | `sidepanel/js/*.js` | 前端 UI（pages、components、event-handlers） | ES module 化，与 Kernel 统一 Vite 打包 |

### 构建与加载方式

- **入口**：`sidepanel/js/app.js`（ES module，import 所有 kernel 和 shell 依赖）
- **构建**：Vite → `dist/sidepanel.bundle.js`（ES module 格式，58 模块，~134 kB）
- **加载**：`sidepanel.html` 中仅 3 类 script：
  1. `error-handler.js`（普通 script，最先加载）
  2. 第三方库 codemirror + marked（普通 script，设置 window 全局）
  3. `<script type="module" src="../dist/sidepanel.bundle.js">`（Vite 打包结果）

### Kernel 层（TypeScript，Vite 打包）
- 入口: `kernel/index.ts`（聚合导出 + `_sidepanelShim` 桥接）
- `_sidepanelShim`：残留在 index.ts 末尾，将核心类挂到 window。Shell ES module 化后已无消费者（app.js 直接 import），保留为兼容，Shell 全量 TS 化后可移除
- 核心: `Kernel.ts`(服务注册表+生命周期) / `Bootloader.ts`(4 阶段启动) / `IPC.ts`(通道+中间件，精简后) / `ToolRegistry.ts` / `CapabilityManager.ts`
- models/: 纯数据原型（BaseModel, Message, Session, Settings, Model, ToolCall, ToolResult, ToolDefinition, MessageContent, Process, UserScript）—— 不含 infra 依赖和集合管理方法
- services/: 管理接口(I*Manager) + 实现(SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory) + ProviderAPIServices/(OpenAI, OpenRouter, LMStudio)
- programs/: ChatProgram（聊天+工具调用循环，可脱离 UI 运行）

### 类型分层原则（2026-07-01 重构后）
- **models/**: 纯数据定义，只含属性 + toJSON/fromJSON，不含 log/IPC 等 infra 依赖，不含集合增删改方法
- **services/ Manager**: 导入 models/ 类型，提供完整管理能力（如 SessionManager 管理 Session 的增删改查，ProcessManager 管理 Process 实例）
- Kernel/ChatProgram 自行声明 log/ipc（不再从 Process 继承）

### Shell 层（JavaScript，ES module）
- `app.js`: ES import 直接引用 kernel 模块 + shell 模块，用 Bootloader 启动 Kernel，渲染页面
- `pages/`: ChatPage, HistoryPage, StoragePage, ScriptsPage, SettingsPage(+子页)
- `components/`: UI.js（基础组件）, Chat.js（聊天消息渲染、ToolCall/ToolResult 卡片）
- `event-handlers/`: ChatEventHandler（聊天事件转译）, Settings/Storage/Scripts EventHandler
- `services/`: ChromeStorageAdapter, ScriptInjector.module.js（background.js 用）
- `tools/`: RunUserScriptTool（在 MAIN world 执行 JS）, ManageUserScriptsTool
- `events.js`: 事件常量定义（供 UI 和 Kernel 共享）

## 通信桥接

1. **Kernel ↔ Shell 引用**：Shell 通过 ES import 直接引用 kernel 模块，不再靠 window 全局（`_sidepanelShim` 已无消费者）
2. **Kernel ↔ Shell 运行时通信**：通过 IPC 事件总线
   - IPC 有 channel 机制（`getOrCreateChannel('chat')`，返回子 IPC 实例）
   - 中间件链（use），来源追踪（origin）
   - 已移除：优先级系统、request/response、统计、消息历史（2026-07-02 精简）

## 事件流向（聊天流程）

```
用户输入 → UI 层（Chat 组件）→ USER_APPLY_SEND
→ ChatEventHandler（转译为 CMD.SEND）→ IPC → ChatProgram.sendMessage()
→ Provider.chatStream() → 流式响应回传
→ IPC 事件: STREAM_START → STREAM_CHUNK_APPEND → STREAM_COMPLETE
→ ChatEventHandler 监听 → 更新 DOM

（若检测到 toolCalls）→ TOOL.EXECUTING → TOOL.COMPLETED → TOOL.ALL_COMPLETED
→ 自动续发: ChatProgram.sendMessage({ isToolContinuation: true })
```

## Bootloader 启动阶段（4 阶段，2026-07-02 精简）

在 `app.js` / `src/main.ts` 中通过 Bootloader 注册钩子完成启动：

```
INIT → REGISTER → START → READY
```

- INIT: IPC 和 Log 已创建（基础设施就绪）
- REGISTER: 注册 Kernel 的所有服务（SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory）
- START: 合并原 SERVICES_INIT + TOOLS_REGISTER + HANDLERS_INIT + CONFIG_LOAD
  - 初始化所有服务（ProcessManager.init 自动调用，注册 IPC 监听）
  - 注册内置工具（RunUserScriptTool, ManageUserScriptsTool）
  - 创建 ChatProgram 实例和各类 EventHandler
  - 加载 Settings，创建 ProviderFactory
- READY: 启动完成

## 设计原则
- 内核最小化：Kernel 只做服务注册、消息路由、生命周期
- 所有业务逻辑在 Service 层，Kernel 不执行业务
- **Kernel 零外部依赖**：不持有 window、chrome.*、document 引用
- Programs 可脱离 UI 运行（如 ChatProgram 可以在后台独立运行）

## 待解决问题
- 残留环境依赖（已加 FIXME 注释）：
  - `OpenRouterService.ts` 用 `window.location.href` 设 HTTP-Referer header
  - `ChatProgram.ts` 用 `chrome.tabs.query` 取 tabId 传给工具
- **tsconfig 根源问题**：`strict:false` 等于关闭类型检查，建议逐步收紧
- `index.ts` 末尾 `_sidepanelShim` 是 Shell(JS) 桥接边界，Shell 迁移到 TS 后可移除

## 测试基础设施
- vitest 4.1.9 已安装，vitest.config.ts 已创建
- `npm run test` = vitest run / `npm run test:watch` = vitest watch
- 测试文件：`kernel/**/*.test.ts`

## 构建命令
- `npm run build` = vite build（打包为 `dist/sidepanel.bundle.js`，自动同步版本号到 manifest.json）
- `npm run dev` = vite build --watch

## 注意
- README.md（根）和 sidepanel/README.md 描述的是**旧架构**，与当前实际结构有出入，文档待更新。
- **Shell msg.content 可为数组**：OpenAI 富文本格式 `[{type:'text', text:'...'}]`，Shell 代码需用 `extractText()` 统一处理（已暴露为 `window.extractText`）
- **Provider 导出模式**：所有 ProviderService 采用双重导出 `export default class X` + `export { X };`（同时支持 default import 和 named import）
- **`_sidepanelShim` 已无消费者**：Shell 统一用 ES import 后，kernel/index.ts 的 window 桥接代码不再被任何代码引用，Shell 全量 TS 化后可整块移除
- **日志系统统一**：`kernel/services/Log.ts` 全局单例，所有模块通过 `import { Log }` 使用
  - 统一格式：`[HH:mm:ss] [TAG] message`
  - API: `Log.debug/info/warn/error/fatal(tag, ...args)`
  - 默认后端 ConsoleLogger（模块加载即可用），Kernel boot 时可 `Log.setLogger()` 升级
  - `Log.setLevel('warn')` 级别过滤
  - 已移除旧 IPC LOG 事件转发系统（Events.ts LOG 常量 + Kernel.ts 中 ~15 行监听代码）
  - Kernel 服务层（SessionManager/SettingsManager）不再 DI 注入 log，改用 Log 单例
  - 构建大小：206 模块，sidepanel.bundle.js ~71 kB，svelte-app.bundle.js ~104 kB

## 2026-07-02 Kernel Phase 3 清理

### IPC 精简
- 移除：PRIORITY/PRIORITY_NAMES、emitHigh/emitLow、request/onRequest/respond/respondError、stats/getStats、messageHistory/getHistory/clearHistory/maxHistory
- 保留：on/off/once/emit/use(中间件)/getOrCreateChannel + 基本查询
- IPCMessage 简化：移除 priority/priorityName，保留 event/data/timestamp/id/origin

### Bootloader 8→4 阶段
- 旧：CORE_INIT → SERVICES_REGISTER → SERVICES_INIT → TOOLS_REGISTER → HANDLERS_INIT → CONFIG_LOAD → UI_RENDER → READY
- 新：INIT → REGISTER → START → READY

### ProcessManager 看门狗实现
- Process 模型升级：完整生命周期状态机(created→running→paused→completed/failed/cancelling→cancelled/killed)
- ProcessManager 实现：
  - init(kernel) 由 Kernel.boot() 自动调用，注册 IPC task:cancelRequest 监听
  - cancel(id) 看门狗：调用 terminateFn → setTimeout 倒计时 → 超时 forceKill
  - shutdown() 由 Kernel.shutdown() 自动调用，并发 cancel 所有活跃进程
  - 通过 task channel IPC 广播状态变更
  - KernelRef 最小接口避免循环依赖

## 2026-07-01 代码质量审查修复
- **命名规范**：`ISessionManager/ISettings/IProviderAPIService/IScriptsManager` 全部是 class 非 interface → 重命名为 `BaseSessionManager/BaseSettings/BaseProviderAPIService/BaseScriptsManager`（12 文件）
- **Kernel/ChatProgram**：不再 `extends Process`，直接声明 `name` 属性，消除 `state` 与 `status` 字段冗余
- **循环依赖**：Kernel↔ScriptsManager 和 Kernel↔ProviderFactory 已解除，使用 `KernelRef` 最小接口替代直接 import
- **Events 统一**：`sidepanel/js/events.js` 从 `kernel/Events.ts` 导入，不再重复定义事件常量
- **ProviderFactory**：`off()` 修复（存储回调引用精确移除）；消除 if-else 三块重复代码；`kernel/ipc/settingsChannel` 从 `any` 改为正确类型
- **安全修复**：OpenRouterService 不再日志打印含 API Key 的完整请求体；Settings.toJSON() apiKey 脱敏
- **Bug 修复**：ChatProgram.createSession() 未 await（导致 session.id 为 undefined）
- **死代码清理**：ChatProgram._onSessionChangedHandler 空方法、SettingsManager 4 个 stub 方法、CapabilityManager._audit 激活使用、SettingsManager 3 处无意义注释
- **文档标注**：OpenRouterService window 依赖和 ChatProgram chrome.tabs 依赖添加 FIXME 注释
