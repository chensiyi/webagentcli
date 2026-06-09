# Side Panel 模块说明

> 侧边栏 UI 是 Web Agent Client 的主体实现。本文件说明 `sidepanel/` 的实际结构、启动流程与关键模块。

## 📌 侧边栏作用与入口

- `sidepanel/sidepanel.html` 是侧边栏的入口页面
- `manifest.json` 中的 `side_panel.default_path` 指向该页面
- 点击扩展图标会触发 `background.js` 中的 `chrome.action.onClicked`，再调用 `chrome.sidePanel.open({ tabId })` 打开侧边栏

## 🚀 运行流程

```
1. 用户点击扩展图标（或使用快捷键 Ctrl+Shift+A）
2. Service Worker sidepanel/js/background.js 监听 chrome.action.onClicked
3. chrome.sidePanel.open({ tabId }) 打开当前页面对应的 Side Panel
4. sidepanel.html 按 <script> 顺序加载所有依赖模块
5. window.load 事件触发 app.js 的 init()
6. 创建 ServiceCenter、初始化 SessionManager、加载设置
7. 创建 EventHandler、渲染当前页面（默认 ChatPage）
```

## 📂 主要目录

- `sidepanel.html` — 侧边栏 HTML 入口，按顺序加载依赖脚本
- `js/` — JavaScript 源码
- `theme/` — 模块化 CSS 主题（按 UI 元素类型拆分子文件）

## 🗂️ JS 子目录详解

### `js/app.js` — 应用入口

负责：
- 创建 `ServiceCenter` 实例
- 异步初始化 `SessionManager`
- 创建各页面 `EventHandler`（Chat / Settings / Storage / Scripts）
- 通过 `settingsManager.loadSettings()` 加载设置（触发 `SETTINGS.LOADED`，由 `SettingsEventHandler` 响应）
- 注册全局事件监听（如 `CHAT.SESSION_SWITCHED`）
- 渲染页面：构建 sidebar + content-area，调用 `window.Pages[currentPage](contentArea, serviceCenter)`

页面路由通过 `pages` 数组维护（`chat / history / storage / scripts / settings`），切换时调用 `renderPage()` 重新渲染。

### `js/background.js` — Service Worker

`type: module`，负责：
- 监听 `chrome.action.onClicked` → `chrome.sidePanel.open()`
- 监听 `chrome.tabs.onActivated` / `onUpdated` → 调用 `injectScriptsForTab()` 注入匹配的用户脚本
- 监听 `chrome.storage.onChanged` → 当 `user_scripts` 变化时清空注入缓存并重新注入

脚本注入器在 `js/services/ScriptInjector.js`（ES Module），由 background.js 静态导入。

### `js/core/`

核心基础设施层，**不依赖任何上层模块**。

#### `core/events/`

- `EventBus.js` — 全局事件总线单例（`window.EventBus`），发布/订阅模式 + 消息历史（最多 100 条）+ `window.dispatchEvent` 转发
- `Events.js` — 事件常量（`CHAT.* / SETTINGS.* / SERVICE.* / UI.* / STORAGE.* / SCRIPTS.* / TOOL.*`）和 `MessageFormats`

#### `core/models/`

数据模型，**全部导出到 `window` 对象**：

| 文件 | 导出 | 说明 |
|------|------|------|
| `BaseModel.js` | `window.BaseModel` | 抽象基类（id / createdAt / updatedAt / toJSON） |
| `Message.js` | `window.Message`, `window.Role` | 消息（role / content / toolCalls[]） |
| `Session.js` | `window.Session` | 会话（messages / reasoningEffort） |
| `Settings.js` | `window.Settings` | 全局设置单例 |
| `Model.js` | `window.Model` | AI 模型元数据（capabilities / contextLength） |
| `ToolCall.js` | `window.ToolCall` | 工具调用意图（不可变） |
| `ToolResult.js` | `window.ToolResult` | 工具执行结果（不可变） |
| `ToolDefinition.js` | `window.ToolDefinition` | 工具契约（不可变） |
| `MessageContent.js` | `window.MessageContent` | 富媒体块 + ThinkingConfig + MessagesRequest + MessageStructure |
| `Storage.js` | `window.StorageModel` | chrome.storage.local 封装单例 |
| `Scripts.js` | `window.ScriptsModel` | UserScript 解析与存储单例 |

> 模型字段、方法、序列化规范详见 [docs/CORE_MODELS.md](../docs/CORE_MODELS.md)。

### `js/services/`

服务层，包含接口（`I*.js`）和实现。

#### 服务实现

| 文件 | 职责 |
|------|------|
| `ServiceCenter.js` | **⭐ 服务中心（Facade）**：所有服务的懒加载与单例管理；Provider 注册/切换；工具注册；ChatController 单例 |
| `SessionManager.js` | 会话/消息的持久化与 CRUD；流式分片写入 |
| `SettingsManager.js` | 设置加载与保存（基于 `chrome.storage.local`） |
| `StorageManager.js` | 存储的高层封装（读写、搜索、清理） |
| `ScriptsManager.js` | 用户脚本的增删改查（基于 `ScriptsModel`） |
| `ModelManager.js` | 模型列表的加载、缓存、当前模型管理 |
| `ScriptInjector.js` | 后台脚本注入器（background.js 导入） |

#### Provider 实现

`js/services/ProviderAPIServices/`：

- `OpenAIService.js` — OpenAI 官方
- `OpenRouterService.js` — OpenRouter（兼容 OpenAI 协议，加 `HTTP-Referer` / `X-Title` 头）
- `LMStudioService.js` — LM Studio 本地服务

#### 工具

`js/services/tools/`：

- `RunUserScriptTool.js` — 内置 `run_user_script` 工具，在当前活动 tab 的 MAIN 世界执行用户提供的 JS 代码

#### 接口

`I*.js` 命名（**仅作类型说明，JavaScript 不强制**）：

- `ISessionManager.js` / `IAppSettings.js` / `ISettings.js`
- `IProviderAPIService.js` — **抽象基类**，所有 Provider 必须继承
- `IStorageManager.js` / `IScriptsManager.js` / `IModelManager.js`
- `IToolService.js` — **抽象基类**，所有工具必须继承

### `js/controllers/`

控制器层（**目前仅 ChatController**，符合 v2.0 架构）。

- `ChatController.js` — 协调 `SessionManager` 和 `ProviderService`，管理流式请求、Tool Calling 循环、活动状态机

### `js/pages/`

页面级 View（每个 Page 对应一个可选的 EventHandler）。

| 文件 | 说明 |
|------|------|
| `ChatPage.js` + `ChatEventHandler.js` | 对话主界面（流式渲染、思考过程、Tool 可视化） |
| `HistoryPage.js` | 历史会话列表 |
| `SettingsPage.js` + `SettingsEventHandler.js` | 设置主页面（按 apiStandard 切换子页） |
| `SettingsPage_Base.js` | 通用设置项（温度、token、主题、思考模式） |
| `SettingsPage_OpenAI.js` | OpenAI 专属字段 |
| `SettingsPage_OpenRouter.js` | OpenRouter 专属字段 |
| `SettingsPage_LMStudio.js` | LM Studio 专属字段 |
| `StoragePage.js` + `StorageEventHandler.js` | `chrome.storage.local` 查看与清理 |
| `ScriptsPage.js` + `ScriptsEventHandler.js` | 用户脚本管理 |

### `js/components/`

通用 UI 组件（无业务逻辑）。

- `UI.js` — 按钮、卡片、徽章、对话框等基础组件
- `Chat.js` — 聊天专用组件（消息气泡、Markdown 渲染、Tool 调用卡片等）

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

### 1. `ServiceCenter` 是入口

唯一实例在 `app.js` 中创建，所有页面、Controller、Manager 通过它访问服务：

```javascript
const serviceCenter = new window.ServiceCenter();
await serviceCenter.initializeSessionManager();
const sessionManager = serviceCenter.getSessionManager();
const providerService = serviceCenter.getCurrentProviderService();
const chatController = serviceCenter.getChatController();
```

### 2. EventBus 事件机制

- 单例 `window.EventBus`
- 事件名集中在 `core/events/Events.js`
- 各 `*EventHandler.js` 注册监听，触发后调用 Controller 或更新 UI
- 业务层发布事件 `window.EventBus.emit(Events.CHAT.X, data)`

### 3. 脚本加载顺序（极重要！）

`sidepanel.html` 中 `<script>` 顺序必须严格遵循依赖关系：

1. `utils/error-handler.js` → `utils/toast.js` → `utils/confirm.js` → `utils/dom.js` → `utils/time.js`
2. `components/UI.js` → `components/Chat.js`
3. CodeMirror、marked（第三方）
4. `core/events/EventBus.js` → `core/events/Events.js`
5. `core/models/*`（按依赖：BaseModel → Model → ToolDefinition → ToolCall → ToolResult → MessageContent → Message → Session → Settings → Storage → Scripts）
6. 服务接口（`I*.js`） + `tools/RunUserScriptTool.js`
7. Provider 实现（OpenAI / OpenRouter / LM Studio）
8. 服务实现（Storage / Session / Settings / Scripts / Model Manager）
9. `SettingsPage_*.js`（各 Provider 的设置子页）
10. `controllers/ChatController.js`
11. `services/ServiceCenter.js`
12. 各 `pages/*EventHandler.js`
13. 各 `pages/*Page.js`
14. 最后 `app.js`

> ⚠️ 调整顺序会导致 `window.X` 引用为 `undefined`。

## 🛠️ 调试

- **Service Worker**：`chrome://extensions/` → 找到本扩展 → 点击 "服务工作线程" → DevTools
- **Side Panel UI**：打开侧边栏 → 右键 → "检查" → DevTools
- **查看事件流**（侧边栏控制台）：`window.EventBus.getHistory()` 返回最近 100 条事件
- **查看服务状态**：`window.serviceCenter.getQueueStatus?.()` 或 `window.chatEventHandler`
- **清空数据**：`chrome.storage.local.clear()` 后重新加载扩展

## 🔧 常见修改点

| 需求 | 改哪里 |
|------|--------|
| 添加新 Provider | 创建 `ProviderAPIServices/XxxService.js` + 在 `ServiceCenter.createProviderService()` 加 case + 在 `sidepanel.html` 引入 + 添加 `SettingsPage_Xxx.js` |
| 添加新工具 | 创建 `tools/XxxTool.js` 继承 `IToolService` + 在 `ServiceCenter._registerBuiltInTools()` 数组注册 + 在 `sidepanel.html` 引入 |
| 扩展设置项 | 更新 `core/models/Settings.js` 字段 + `pages/SettingsPage_Base.js` 表单 + `SettingsManager.js` 序列化 |
| 添加新页面 | 创建 `pages/XxxPage.js` + 可选 `XxxEventHandler.js` + 在 `app.js` 的 `pages` 数组注册 + 在 `sidepanel.html` 引入 |
| 添加新事件 | 在 `core/events/Events.js` 加常量 + 业务层 emit + Handler 层 on |
| 改主题 | 编辑 `theme/*.css`（按 UI 元素类型分文件） |

## 📖 推荐阅读

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — 整体架构与分层
- [docs/CORE_MODELS.md](../docs/CORE_MODELS.md) — 数据模型字段、方法、序列化
- [README.md](../README.md) — 项目入口
