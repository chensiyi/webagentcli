# Web Agent Client

> AI Agent Runtime Environment for Web · 基于 Chrome Manifest V3 的浏览器内 AI Agent 扩展

Web Agent Client 是一个轻量级、可扩展的 Chrome 侧边栏扩展，为 AI Agent 提供完整的网页端执行环境。它在浏览器侧边栏内整合了 **多 Provider 接入、多会话管理、流式对话、思考过程展示、Tool Calling、用户脚本执行、本地缓存查看** 等能力，开箱即用，代码完全运行在客户端。

## ✨ 核心特性

- 🎯 **Microkernel 架构**：Kernel（服务注册/生命周期） + IPC（事件总线） + ToolRegistry（系统调用） + CapabilityManager（权限门控），零外部依赖
- 🔌 **可插拔 Provider**：内置 **OpenAI**、**OpenRouter**、**LM Studio** 支持，新增 Provider 只需实现 `IProviderAPIService` 接口
- 💬 **多会话与持久化**：基于 `chrome.storage.local` 的会话/消息/工具调用全持久化
- 🌊 **流式响应 + 思考模式**：原生支持 SSE 流式输出与 `reasoning_content`（OpenAI o-series、Claude thinking 等）
- 🛠️ **Tool Calling 闭环**：内置 `run_user_script` 工具，使用 `chrome.scripting.executeScript` 在页面 MAIN 世界执行代码
- 📜 **用户脚本管理**：支持 Tampermonkey 风格元数据解析与按 `@match` 规则自动注入（Background Service Worker 持续运行）
- 🎨 **模块化主题**：CSS 按 UI 元素类型拆分（变量、布局、表单、卡片、聊天组件等），易于扩展深色/浅色模式
- 🔍 **本地存储查看**：内置 Storage 页面，支持搜索、容量统计、缓存清理
- 🦀 **TypeScript + Vite + Svelte 5**：内核层使用 TypeScript 编写，Vite 构建；UI 层使用 Svelte 5（Runes）

## 📂 项目结构

```
webagentcli/
├── manifest.json              # Chrome MV3 配置
├── README.md                  # 本文件（项目入口）
├── LICENSE                    # 许可证
├── assets/icons/              # 扩展图标
├── docs/                      # 设计文档
│   ├── ARCHITECTURE.md        # 架构设计（Microkernel + IPC + Programs）
│   └── CORE_MODELS.md         # 数据模型详解
├── kernel/                    # 核心内核（TypeScript · 零外部依赖）
│   ├── index.ts               # ES Module 统一入口
│   ├── Kernel.ts              # 内核（服务注册/生命周期/状态机）
│   ├── Bootloader.ts          # Bootloader（4 阶段标准化启动）
│   ├── IPC.ts                 # 进程间事件总线（优先级/中间件/通道）
│   ├── Events.ts              # 事件常量与类型定义
│   ├── ToolRegistry.ts        # 工具注册中心（系统调用注册表）
│   ├── CapabilityManager.ts   # 权限门控（声明式权限/动态授权）
│   ├── models/                # 数据模型（纯数据，无壳依赖）
│   │   ├── BaseModel.ts       # 抽象基类（id/createdAt/updatedAt）
│   │   ├── Message.ts         # 消息（role/content/reasoning/toolCalls）
│   │   ├── MessageContent.ts  # 富媒体块/ThinkingConfig/MessageStructure
│   │   ├── Session.ts         # 会话（含消息列表/思考强度）
│   │   ├── Settings.ts        # 设置（Provider/Endpoint/Model）
│   │   ├── Model.ts           # AI 模型元数据
│   │   ├── ToolCall.ts        # 工具调用意图（不可变）
│   │   ├── ToolResult.ts      # 工具执行结果（不可变）
│   │   ├── ToolDefinition.ts  # 工具契约（不可变）
│   │   ├── Process.ts         # 进程模型（生命周期/状态机）
│   │   └── Scripts.ts         # 用户脚本模型
│   ├── programs/              # 内核程序（事件驱动的业务编排）
│   │   ├── ChatProgram.ts     # 聊天程序（发送/流式/工具循环/会话切换）
│   │   └── chat/              # 聊天子模块
│   └── services/              # 核心服务实现
│       ├── SessionManager.ts  # 会话/消息持久化
│       ├── SettingsManager.ts # 设置管理
│       ├── ScriptsManager.ts  # 脚本管理
│       ├── ProcessManager.ts  # 进程管理
│       ├── ProviderFactory.ts # Provider 工厂
│       ├── ConsoleLogger.ts   # 控制台日志实现
│       ├── Log.ts             # 日志工具类
│       ├── ILogger.ts         # 日志接口
│       ├── IStorageManager.ts # 存储接口
│       ├── ISettings.ts       # 设置接口
│       ├── IScriptsManager.ts # 脚本接口
│       ├── ISessionManager.ts # 会话接口
│       ├── IToolService.ts    # 工具服务接口
│       ├── IProviderAPIService.ts # Provider API 接口
│       └── ProviderAPIServices/   # AI Provider 实现
│           ├── OpenAIService.ts
│           ├── OpenRouterService.ts
│           └── LMStudioService.ts
├── index.html                 # 入口 HTML
├── sidepanel/                 # Svelte 5 UI + Service Worker
│   ├── background.js          # Service Worker（脚本自动注入）
│   ├── main.ts                # Kernel 自举 + 挂载 Svelte App
│   ├── Sidepanel.svelte       # 根组件（Sidebar + 5 页路由）
│   ├── components/            # Svelte 组件
│   │   ├── atoms/             # 原子组件（Button/Input/Select 等）
│   │   ├── forms/             # 表单组件（CodeEditor 等）
│   │   ├── layout/            # 布局组件（Sidebar/Card/EmptyState 等）
│   │   └── overlays/          # 覆盖层组件（Toast/Dialog/Tooltip 等）
│   ├── pages/                 # 页面组件
│   │   ├── ChatPage.svelte    # 对话页面
│   │   ├── HistoryPage.svelte # 历史页面
│   │   ├── StoragePage.svelte # 存储页面
│   │   ├── ScriptsPage.svelte # 脚本页面
│   │   ├── SettingsPage.svelte# 设置页面
│   │   └── chat/              # 聊天子组件
│   │       ├── MessageBubble.svelte
│   │       ├── ChatEventHandler.ts
│   │       └── ...
│   ├── services/              # 壳层服务
│   │   └── ChromeStorageAdapter.js
│   ├── tools/                 # 内置工具实现
│   │   ├── RunUserScriptTool.js
│   │   └── ManageUserScriptsTool.js
│   ├── styles/                # 全局样式
│   │   ├── tokens.css         # 设计令牌（CSS 变量）
│   │   ├── components.css     # 组件样式
│   │   ├── pages.css          # 页面样式
│   │   └── utilities.css      # 工具类
│   └── utils/                 # 工具函数
│       ├── dom.ts
│       ├── text.ts
│       └── time.ts
├── dist/                      # 构建产物
│   ├── assets/svelte-app.css  # Svelte 5 样式
│   └── svelte-app.bundle.js   # Svelte 5 打包
├── package.json               # 依赖与构建脚本
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts             # Vite 构建配置
├── vitest.config.ts           # Vitest 测试配置
└── svelte.config.mjs          # Svelte 配置
```

## 🚀 快速开始

> 前置条件：Chrome 88+（支持 Manifest V3）

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd webagentcli
   ```

2. **安装依赖**

   ```bash
   npm install
   ```

3. **构建**

   ```bash
   npm run build
   ```

4. **加载扩展**
   - 打开 `chrome://extensions/`
   - 开启右上角 **"开发者模式"**
   - 点击 **"加载已解压的扩展程序"**，选择项目根目录（含 `manifest.json`）

5. **打开 Side Panel**
   - 在任意网页点击扩展图标
   - 或使用快捷键 `Ctrl+Shift+A`（macOS: `Cmd+Shift+A`）

6. **配置 AI Provider**
   - 进入 **设置** 页面
   - 选择 API 标准：`OpenAI` / `OpenRouter` / `LM Studio`
   - 填写 API Key、Endpoint，选择模型
   - 启用 **思考模式**（reasoning effort）可获得更好的复杂任务表现

7. **开始对话**
   - 切换到 **对话** 页面
   - 输入问题并发送，即可看到流式响应

## 🧭 文档导航

| 文档 | 内容 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 整体架构：Microkernel + IPC + Programs + Services |
| [docs/CORE_MODELS.md](docs/CORE_MODELS.md) | 数据模型字段、方法、序列化规范 |

## 🧩 五大内置页面

| 页面 | 标识 | 职责 |
|------|------|------|
| 对话 | `chat` | 多会话 Chat 主界面，发送/接收流式消息 |
| 历史 | `history` | 查看历史会话、消息列表 |
| 存储 | `storage` | 查看/搜索 `chrome.storage.local` 数据，清理缓存 |
| 脚本 | `scripts` | 用户脚本的增删改查与启用管理 |
| 设置 | `settings` | AI Provider、API Key、模型、思考模式配置 |

## 🏗️ 架构概览（v0.6 — Microkernel）

```
┌──────────────────────────────────────────────────┐
│   Service Worker (background.js)                  │
│   用户脚本自动注入 · 持续运行 · 不依赖 Kernel      │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│   Sidepanel (Svelte 5)                            │
│   ├── index.html → main.ts → Kernel 自举          │
│   ├── 5 个页面（Chat/History/Storage/Scripts/Settings）│
│   └── Svelte 组件系统                              │
└──────────────┬───────────────────────────────────┘
               │ IPC EventBus
               ▼
┌──────────────────────────────────────────────────┐
│   Kernel (TypeScript · 零外部依赖)                │
│   ├── Kernel.ts        — 服务注册/生命周期/状态机  │
│   ├── IPC.ts           — 消息总线（优先级/中间件） │
│   ├── ToolRegistry.ts  — 系统调用注册表            │
│   ├── CapabilityManager.ts — 权限门控              │
│   ├── Bootloader.ts    — 4 阶段标准化启动          │
│   └── programs/        — 内核程序（ChatProgram）   │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│   Services + Models                               │
│   SessionManager / SettingsManager / ProviderFactory│
│   Message / Session / Settings / ToolCall / Process│
└──────────────────────────────────────────────────┘
```

- **Microkernel 模式**：内核（`kernel/Kernel.ts`）只做服务注册和生命周期，不执行业务
- **Bootloader 4 阶段启动**：INIT → REGISTER → START → READY
- **两进程架构**：Service Worker（`background.js`）持续运行脚本注入；Sidepanel 按需打开，Kernel 自举
- **ProviderFactory 独立**：Provider 服务通过工厂创建，不再耦合在 Kernel 上
- **`MessageStructure.toAPIFormat` 归一化**：所有消息在发送前统一转为 OpenAI API 格式

详细分层与责任划分请阅读 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 🛠️ 调试

- **Service Worker**：在 `chrome://extensions/` 找到本扩展，点击 "服务工作线程" 打开 DevTools
- **Side Panel UI**：打开侧边栏后右键 → "检查" 进入 DevTools
- **查看事件流**：在控制台执行 `window.EventBus.getHistory()` 可查看最近 100 条事件
- **清空状态**：在控制台执行 `chrome.storage.local.clear()` 后重新加载

## 📦 版本

- **扩展版本**：`0.6.5`（见 `manifest.json` / `package.json`）
- **架构版本**：Microkernel（Kernel + Bootloader + ProviderFactory 解耦）
- **构建系统**：TypeScript 6 + Vite 8 + Vitest 4 + Svelte 5
- **Manifest**：V3

## 📄 许可

见 [LICENSE](LICENSE)。