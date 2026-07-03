# Side Panel 模块说明

> 侧边栏 UI 是 Web Agent Client 的主体实现。本文件说明 `sidepanel/` 的实际结构、启动流程与关键模块。
>
> ⚠️ **当前状态**：`sidepanel/` 是旧 JS 架构，新 UI 正在 `src/`（Svelte 5）中逐步迁移。两者并行运行，互不干扰。

## 📌 侧边栏作用与入口

- `sidepanel/sidepanel.html` 是侧边栏的旧入口页面
- `sidepanel/svelte-app.html` 是侧边栏的新入口页面（Svelte 5）
- `manifest.json` 中的 `side_panel.default_path` 指向 `sidepanel/svelte-app.html`（Svelte 5 新架构）
- 可通过修改 `manifest.json` 切换回旧入口 `sidepanel/sidepanel.html`
- 点击扩展图标会触发 `background.js` 中的 `chrome.action.onClicked`，再调用 `chrome.sidePanel.open({ tabId })` 打开侧边栏

## 🚀 运行流程（旧入口）

```
1. 用户点击扩展图标（或使用快捷键 Ctrl+Shift+A）
2. Service Worker sidepanel/js/background.js 监听 chrome.action.onClicked
3. chrome.sidePanel.open({ tabId }) 打开当前页面对应的 Side Panel
4. sidepanel.html 按 <script> 顺序加载所有依赖模块
5. window.load 事件触发 app.js 的 init()
6. 创建 Kernel 实例、初始化服务、加载设置
7. 创建 EventHandler、渲染当前页面（默认 ChatPage）
```

## 📂 主要目录

- `sidepanel.html` — 侧边栏 HTML 入口（旧架构）
- `svelte-app.html` — 侧边栏 HTML 入口（Svelte 5 新架构）
- `js/` — JavaScript 源码
- `theme/` — 模块化 CSS 主题（按 UI 元素类型拆分子文件）

## 🗂️ JS 子目录详解

### `js/app.js` — 应用入口（旧架构）

负责：
- 创建 `Kernel` 实例 + `Bootloader`
- 注册所有 Service 工厂（SessionManager / SettingsManager / ScriptsManager 等）
- 创建 `ChatProgram` + 各页面 `EventHandler`
- 通过 `settingsManager.loadSettings()` 加载设置
- 注册全局事件监听
- 渲染页面：构建 sidebar + content-area

页面路由通过 `pages` 数组维护（`chat / history / storage / scripts / settings`），切换时调用 `renderPage()` 重新渲染。

### `js/background.js` — Service Worker

`type: module`，负责：
- 监听 `chrome.action.onClicked` → `chrome.sidePanel.open()`
- 监听 `chrome.tabs.onActivated` / `onUpdated` → 调用 `injectScriptsForTab()` 注入匹配的用户脚本
- 监听 `chrome.storage.onChanged` → 当 `user_scripts` 变化时清空注入缓存并重新注入

脚本注入器在 `js/services/ScriptInjector.js`（ES Module），由 background.js 静态导入。

### `js/event-handlers/`

事件处理器层，负责监听 UI 事件并转译为内核指令：

| 文件 | 职责 |
|------|------|
| `ChatEventHandler.js` | 聊天事件：USER_APPLY_* → ChatProgram.CMD.* |
| `SettingsEventHandler.js` | 设置事件：设置加载/保存/切换 |
| `StorageEventHandler.js` | 存储事件：存储查看/搜索/清理 |
| `ScriptsEventHandler.js` | 脚本事件：脚本 CRUD |

### `js/pages/`

页面级 View（每个 Page 对应一个可选的 EventHandler）。

| 文件 | 说明 |
|------|------|
| `ChatPage.js` | 对话主界面（流式渲染、思考过程、Tool 可视化） |
| `HistoryPage.js` | 历史会话列表 |
| `SettingsPage.js` | 设置主页面（按 apiStandard 切换子页） |
| `SettingsPage_Base.js` | 通用设置项（温度、token、主题、思考模式） |
| `SettingsPage_OpenAI.js` | OpenAI 专属字段 |
| `SettingsPage_OpenRouter.js` | OpenRouter 专属字段 |
| `SettingsPage_LMStudio.js` | LM Studio 专属字段 |
| `StoragePage.js` | `chrome.storage.local` 查看与清理 |
| `ScriptsPage.js` | 用户脚本管理 |

### `js/components/`

通用 UI 组件（无业务逻辑）。

- `UI.js` — 按钮、卡片、徽章、对话框等基础组件
- `Chat.js` — 聊天专用组件（消息气泡、Markdown 渲染、Tool 调用卡片等）

### `js/tools/`

内置工具实现（由 Kernel 的 ToolRegistry 注册）：

| 文件 | 工具名 | 说明 |
|------|--------|------|
| `RunUserScriptTool.js` | `run_user_script` | 在当前活动 tab 的 MAIN 世界执行用户提供的 JS 代码 |
| `ManageUserScriptsTool.js` | `manage_user_scripts` | 用户脚本 CRUD |

### `js/services/`

Chrome 专用服务：

| 文件 | 职责 |
|------|------|
| `ChromeStorageAdapter.js` | `chrome.storage.local` 封装，实现 `IStorageManager` 接口 |
| `ScriptInjector.js` | 后台脚本注入器（background.js 导入） |

### `js/utils/`

工具函数（不依赖业务逻辑）。

- `dom.js` — `create(tag, props, children)` 风格的 DOM 创建工具
- `toast.js` — Toast 通知
- `confirm.js` — 确认对话框
- `time.js` — 时间格式化（相对时间、绝对时间）
- `error-handler.js` — 全局 `window.onerror` / `unhandledrejection` 监听
- `marked.min.js` — 第三方 Markdown 渲染器
- `codemirror/` — 第三方代码编辑器（用于 JSON / JS 字段）

## 🖼️ 侧边栏页面结构

| 标识 | 名称 | 职责 |
|------|------|------|
| `chat` | 对话 | 与 AI 交互的主界面，支持流式响应与思考模式 |
| `history` | 历史 | 查看历史会话、消息列表 |
| `storage` | 存储 | 查看/搜索本地存储项，清理缓存 |
| `scripts` | 脚本 | 用户脚本管理（启用、编辑、删除） |
| `settings` | 设置 | AI Provider 配置、API Key、模型与思考模式 |

页面切换由 `app.js` 的 sidebar 按钮控制，调用 `window.App.navigateTo(pageId)`。

## 🔑 关键实现点

### 1. Kernel 是唯一入口

所有页面、EventHandler、Manager 通过 Kernel 访问服务：

```javascript
const kernel = window.kernel;
const sessionManager = kernel.getSessionManager();
const settingsManager = kernel.getSettingsManager();
const chatProgram = kernel.chatProgram;
```

### 2. IPC 事件机制

- 单例 `kernel.ipc`（IPC 实例）
- 事件名集中在 `kernel/Events.ts`（`KernelEvents` 常量）
- 各 `*EventHandler.js` 注册监听，触发后调用 ChatProgram 或更新 UI
- 业务层发布事件 `kernel.ipc.emit('chat:streamStart', data)`

### 3. 脚本加载顺序（极重要！）

`sidepanel.html` 中 `<script>` 顺序必须严格遵循依赖关系：

1. `utils/error-handler.js` → `utils/toast.js` → `utils/confirm.js` → `utils/dom.js` → `utils/time.js`
2. `components/UI.js` → `components/Chat.js`
3. CodeMirror、marked（第三方）
4. **★ Kernel 模块**（`dist/kernel.bundle.iife.js` — Vite 打包的 IIFE）
5. `tools/RunUserScriptTool.js` + `ManageUserScriptsTool.js`
6. `services/ChromeStorageAdapter.js`
7. `SettingsPage_*.js`（各 Provider 的设置子页）
8. 各 `pages/*EventHandler.js`
9. 各 `pages/*Page.js`
10. 最后 `app.js`

> ⚠️ 调整顺序会导致 `window.X` 引用为 `undefined`。

## 🛠️ 调试

- **Service Worker**：`chrome://extensions/` → 找到本扩展 → 点击 "服务工作线程" → DevTools
- **Side Panel UI**：打开侧边栏 → 右键 → "检查" → DevTools
- **查看事件流**（侧边栏控制台）：`kernel.ipc.getHistory()` 返回最近事件
- **查看服务状态**：通过 `kernel.getInfo()` 查看
- **清空数据**：`chrome.storage.local.clear()` 后重新加载扩展

## 🔧 常见修改点

| 需求 | 改哪里 |
|------|--------|
| 添加新 Provider | 创建 `kernel/services/ProviderAPIServices/XxxService.ts` + 在 `ProviderFactory.ts` 加 case |
| 添加新工具 | 创建 `sidepanel/js/tools/XxxTool.js` 继承 `IToolService` + 在 `app.js` 注册 |
| 扩展设置项 | 更新 `kernel/models/Settings.ts` 字段 + `pages/SettingsPage_Base.js` 表单 |
| 添加新页面 | 创建 `pages/XxxPage.js` + 可选 `XxxEventHandler.js` + 在 `app.js` 的 `pages` 数组注册 |
| 改主题 | 编辑 `theme/*.css`（按 UI 元素类型分文件） |
| 新 UI 开发 | 优先在 `src/`（Svelte 5）中进行 |

## 📖 推荐阅读

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — 整体架构与分层
- [docs/CORE_MODELS.md](../docs/CORE_MODELS.md) — 数据模型字段、方法、序列化
- [README.md](../README.md) — 项目入口
- [docs/svelte-migration-plan.md](../docs/svelte-migration-plan.md) — Svelte 5 迁移方案