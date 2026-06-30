# Web Agent Client — 项目长期笔记

## 项目定位
Chrome MV3 侧边栏扩展，为 AI Agent 提供浏览器内运行环境（多 Provider 接入、多会话、流式对话、Tool Calling、用户脚本注入）。

## 版本
- manifest.json: 0.5.2 / package.json: 0.5.1 / kernel index.ts VERSION: 0.5.2
- 架构代号: Microkernel-Esm

## 当前架构：三层结构（迁移中）

项目从旧 MVC 架构迁移到新的 TypeScript 微内核架构。内核已迁移完成，壳层（Shell）后续跟进迁移。

### 三层

| 层 | 位置 | 职责 | 状态 |
|---|---|---|---|
| **Background** | `sidepanel/js/background.js` | Service Worker，触发 sidepanel 打开、脚本注入 | 极简，已完成 |
| **Kernel 微内核** | `kernel/*.ts` | 业务逻辑、数据模型、服务、Provider 封装、可脱离 UI 运行的程序 | 已完整迁移到 TS |
| **Shell 壳层** | `sidepanel/js/*.js` | 前端 UI（pages、components、event-handlers） | JS 实现，后续跟进到 TS（只是起了个头） |

### Kernel 层（TypeScript，Vite 打包）
- 入口: `kernel/index.ts` → 打包为 `dist/kernel.bundle.js.iife.js`（IIFE 版）
- 通过 `_sidepanelShim` 把所有核心类（~20 个）挂到 `window`，供 Shell 使用
- 核心: `Kernel.ts`(服务注册表+生命周期) / `Bootloader.ts`(8 阶段启动) / `IPC.ts`(通道+优先级+中间件) / `ToolRegistry.ts` / `CapabilityManager.ts` / `KernelLog.ts`
- models/: Message, Session, Settings, Model, ToolCall, ToolResult, ToolDefinition, MessageContent, Process, Scripts
- services/: 接口(I*Manager) + 实现(SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory) + ProviderAPIServices/(OpenAI, OpenRouter, LMStudio)
- programs/: ChatProgram（聊天+工具调用循环，可脱离 UI 运行）

### Shell 层（JavaScript，前端 UI）
- `app.js`: 用 Bootloader 启动 Kernel，注册服务、工具、EventHandler，渲染页面
- `pages/`: ChatPage, HistoryPage, StoragePage, ScriptsPage, SettingsPage(+子页)
- `components/`: UI.js（基础组件）, Chat.js（聊天消息渲染、ToolCall/ToolResult 卡片）
- `event-handlers/`: ChatEventHandler（聊天事件转译）, Settings/Storage/Scripts EventHandler
- `services/`: ChromeStorageAdapter, ScriptInjector
- `tools/`: RunUserScriptTool（在 MAIN world 执行 JS）, ManageUserScriptsTool
- `events.js`: 事件常量定义（供 UI 和 Kernel 共享）

## 通信桥接

1. **Kernel → Shell 暴露**：`kernel/index.ts` 通过 `_sidepanelShim` 把所有核心类（Kernel, ChatProgram, IPC, ToolRegistry, SessionManager, SettingsManager, ProviderFactory, OpenAIService, OpenRouterService, LMStudioService 等）挂到 `window`，供 JS 壳层直接 `new` 使用
2. **Kernel ↔ Shell 运行时通信**：通过 IPC 事件总线
   - IPC 有 channel 机制（`getOrCreateChannel('chat')`，返回子 IPC 实例）
   - 消息有优先级、来源追踪、中间件链
   - 支持 request/response 模式

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

## Bootloader 启动阶段（8 阶段）

在 `app.js` 中通过 Bootloader 注册钩子完成启动：

```
CORE_INIT → SERVICES_REGISTER → SERVICES_INIT → TOOLS_REGISTER → HANDLERS_INIT → CONFIG_LOAD → UI_RENDER → READY
```

- CORE_INIT: IPC 和 Log 已创建（无需额外操作）
- SERVICES_REGISTER: 注册 Kernel 的所有服务（SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory）
- SERVICES_INIT: 初始化所有已注册服务（按依赖顺序）
- TOOLS_REGISTER: 注册内置工具（RunUserScriptTool, ManageUserScriptsTool）
- HANDLERS_INIT: 创建 ChatProgram 实例和各类 EventHandler
- CONFIG_LOAD: 加载 Settings，创建 ProviderFactory
- UI_RENDER: 渲染页面（实际在 app.js 的 Phase 2 单独完成）
- READY: 启动完成

## 设计原则
- 内核最小化：Kernel 只做服务注册、消息路由、生命周期
- 所有业务逻辑在 Service 层，Kernel 不执行业务
- **Kernel 零外部依赖**：不持有 window、chrome.*、document 引用
- 所有业务逻辑在 Service 层，Kernel 不执行业务
- Programs 可脱离 UI 运行（如 ChatProgram 可以在后台独立运行）

## 已知架构不一致点
- ~~`ChatProgram.ts` 内部引用 `window.Events`/`window.Message`/`window.ToolResult`/`window.Role`~~ → **已于 2026-06-30 修复**
- ~~**P0 运行时崩溃**：`MessageStructure` 缺 `parseToolCallsFromOpenAI()` 和 `toAPIFormat()`~~ → **已于 2026-06-30 修复**（补方法 + 单元测试验证）
- ~~**P0 类型缺失**：`Kernel.ts:159` 引用 `StorageManager`~~ → **已于 2026-06-30 修复**（改为 `IStorageManager`）
- ~~**P1 Provider 业务外包**：`currentProviderService` 从 Kernel 移到 ProviderFactory~~ → **已于 2026-06-30 修复**（Kernel 不再做 provider 管理）
- ~~**P1 Kernel 循环引用**：Kernel import 从 `./index.js` 改为直接从各文件~~ → **已于 2026-06-30 修复**
- ~~**P1 Bootloader unknown**：kernel:unknown → kernel:Kernel~~ → **已于 2026-06-30 修复**
- ~~**P1 IPC 内联类型**：6+ 处重复 → `IPCMessage` interface~~ → **已于 2026-06-30 修复**
- ~~**P1 Role 裸对象**：改为 `as const` + `RoleType`~~ → **已于 2026-06-30 修复**
- ~~**P1 死代码**：EventValidator/KernelMessageFormats~~ → **已于 2026-06-30 删除**
- 残留环境依赖（待设计决策）：
  - `OpenRouterService.ts` 用 `window.location.href` 设 HTTP-Referer header
  - `ChatProgram.ts` 用 `chrome.tabs.query` 取 tabId 传给工具
- **tsconfig 根源问题**：`strict:false` 等于关闭类型检查，建议逐步收紧
- **设计决策**：`Kernel extends Process` 是有意设计（Kernel 是特殊 Process），不修
- **待推进**：`I*` 前缀是 class 非 interface、大量 `unknown/any`、Manager 创建裸对象
- `index.ts` 末尾 `_sidepanelShim` 是 Shell(JS) 桥接边界，Shell 迁移到 TS 后可移除

## 测试基础设施
- vitest 4.1.9 已安装，vitest.config.ts 已创建
- `npm run test` = vitest run / `npm run test:watch` = vitest watch
- 测试文件：`kernel/**/*.test.ts`

## 构建命令
- `npm run build` = vite build（打包 kernel）
- `npm run dev` = vite build --watch

## 注意
- README.md（根）和 sidepanel/README.md 描述的是**旧架构**，与当前 kernel/ 实际结构有出入，文档待更新。
- **Shell msg.content 可为数组**：OpenAI 富文本格式 `[{type:'text', text:'...'}]`，Shell 代码需用 `extractText()` 统一处理（已暴露为 `window.extractText`）
- **Provider 导出模式**：所有 ProviderService 采用双重导出 `export default class X` + `export { X };`（同时支持 default import 和 named import）
- **Vite 构建容忍 export 不一致**：IIFE bundle 模式下即使模块缺少 named export，vite/rolldown 仍能将类引入 bundle scope 并正常挂到 window（但严格 ESM 环境会失败）
