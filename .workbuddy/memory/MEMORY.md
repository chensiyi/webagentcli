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
- 核心: `Kernel.ts`(服务注册表+生命周期) / `Bootloader.ts`(8 阶段启动) / `IPC.ts`(通道+优先级+中间件) / `ToolRegistry.ts` / `CapabilityManager.ts` / `KernelLog.ts`
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
- Programs 可脱离 UI 运行（如 ChatProgram 可以在后台独立运行）

## 待解决问题
- 残留环境依赖：
  - `OpenRouterService.ts` 用 `window.location.href` 设 HTTP-Referer header
  - `ChatProgram.ts` 用 `chrome.tabs.query` 取 tabId 传给工具
- **tsconfig 根源问题**：`strict:false` 等于关闭类型检查，建议逐步收紧
- **待推进**：`I*` 前缀是 class 非 interface、大量 `unknown/any`、Manager 创建裸对象
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
- **error-handler.js 仍需要**：内核 KernelLog 只做内部日志，不捕获浏览器级 `window.onerror` / `unhandledrejection`；error-handler.js 作为普通 `<script>` 在 HTML 中最先加载，二者互补不重叠
