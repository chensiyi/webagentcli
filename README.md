# Web Agent Client

> AI Agent Runtime Environment for Web · 基于 Chrome Manifest V3 的浏览器内 AI Agent 扩展

Web Agent Client 是一个轻量级、可扩展的 Chrome 侧边栏扩展，为 AI Agent 提供完整的网页端执行环境。它在浏览器侧边栏内整合了 **多 Provider 接入、多会话管理、流式对话、思考过程展示、Tool Calling、用户脚本执行、本地缓存查看** 等能力，开箱即用，代码完全运行在客户端。

## ✨ 核心特性

- 🎯 **MVC 分层架构**：View / Controller / Service / Core 四层清晰隔离，通过 EventBus 解耦通信
- 🔌 **可插拔 Provider**：内置 **OpenAI**、**OpenRouter**、**LM Studio** 支持，新增 Provider 只需实现 `IProviderAPIService` 接口
- 💬 **多会话与持久化**：基于 `chrome.storage.local` 的会话/消息/工具调用全持久化
- 🌊 **流式响应 + 思考模式**：原生支持 SSE 流式输出与 `reasoning_content`（OpenAI o-series、Claude thinking 等）
- 🛠️ **Tool Calling 闭环**：内置 `run_user_script` 工具，使用 `chrome.scripting.executeScript` 在页面 MAIN 世界执行代码
- 📜 **用户脚本管理**：支持 Tampermonkey 风格元数据解析与按 `match` 规则自动注入
- 🎨 **模块化主题**：CSS 按 UI 元素类型拆分（变量、布局、表单、卡片、聊天组件等），易于扩展深色/浅色模式
- 🔍 **本地存储查看**：内置 Storage 页面，支持搜索、容量统计、缓存清理
- 🦀 **TypeScript + Vite**：内核层使用 TypeScript 编写，Vite 构建为 ES Module IIFE，开发体验现代化

## 📂 项目结构

```
webagentcli/
├── manifest.json              # Chrome MV3 配置
├── README.md                  # 本文件（项目入口）
├── LICENSE                    # 许可证
├── assets/icons/              # 扩展图标
├── docs/                      # 设计文档
│   ├── ARCHITECTURE.md        # 架构设计（Microkernel + EventBus）
│   └── CORE_MODELS.md         # 数据模型详解
├── kernel/                    # 核心内核（TypeScript）
│   ├── index.ts               # ES Module 统一入口，Vite 打包入口
│   ├── Kernel.ts              # 内核（服务注册/生命周期）
│   ├── Bootloader.ts          # Bootloader（分阶段启动器）
│   ├── IPC.ts                 # 进程间事件总线
│   ├── Events.ts              # 事件常量与类型定义
│   ├── ToolRegistry.ts        # 工具注册中心
│   ├── models/                # 数据模型
│   │   ├── Message.ts         # 消息（role/content/reasoning/toolCalls）
│   │   ├── Session.ts         # 会话（含消息列表/思考强度）
│   │   ├── Settings.ts        # 设置（Provider/Endpoint/Model）
│   │   ├── ToolCall.ts        # 工具调用
│   │   ├── ToolResult.ts      # 工具结果
│   │   └── ...
│   ├── programs/              # 内核程序
│   │   └── ChatProgram.ts     # 聊天程序（流式/Tool循环/活动状态）
│   └── services/              # 服务层实现
│       ├── SessionManager.ts
│       ├── SettingsManager.ts
│       ├── ProviderFactory.ts  # Provider 工厂
│       └── ProviderAPIServices/
│           ├── OpenAIService.ts
│           ├── OpenRouterService.ts
│           └── LMStudioService.ts
├── sidepanel/                 # 侧边栏 UI（Chrome 环境）
│   ├── sidepanel.html         # 入口 HTML
│   ├── README.md              # Side Panel 模块说明
│   ├── js/                    # JavaScript UI 层
│   │   ├── app.js             # 应用初始化与 Bootloader 启动
│   │   ├── background.js      # Service Worker
│   │   ├── event-handlers/    # 事件处理器（控制器层）
│   │   ├── pages/             # 页面组件（View）
│   │   ├── components/        # 通用 UI 组件
│   │   └── services/          # Chrome 专用服务
│   └── theme/                 # CSS 主题
├── dist/                      # 构建产物
│   └── kernel.bundle.iife.js  # Vite 打包 IIFE
├── package.json               # 依赖与构建脚本
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts             # Vite 构建配置
└── vitest.config.ts           # Vitest 测试配置
```

## 🚀 快速开始

> 前置条件：Chrome 88+（支持 Manifest V3）

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd webagentcli
   ```

2. **加载扩展**
   - 打开 `chrome://extensions/`
   - 开启右上角 **"开发者模式"**
   - 点击 **"加载已解压的扩展程序"**，选择项目根目录（含 `manifest.json`）

3. **打开 Side Panel**
   - 在任意网页点击扩展图标
   - 或使用快捷键 `Ctrl+Shift+A`（macOS: `Cmd+Shift+A`）

4. **配置 AI Provider**
   - 进入 **设置** 页面
   - 选择 API 标准：`OpenAI` / `OpenRouter` / `LM Studio` / `Ollama` / `Anthropic`
   - 填写 API Key、Endpoint，选择模型
   - 启用 **思考模式**（reasoning effort）可获得更好的复杂任务表现

5. **开始对话**
   - 切换到 **对话** 页面
   - 输入问题并发送，即可看到流式响应

## 🧭 文档导航

| 文档 | 内容 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 整体架构、MVC 分层、EventBus、ServiceCenter 设计 |
| [sidepanel/README.md](sidepanel/README.md) | Side Panel 模块说明（JS 子目录详解） |

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
│   Shell (View + EventHandlers)                  │
│   sidepanel/js/ · pages / components / handlers │
│   （JavaScript · Chrome 环境）                    │
└──────────────┬───────────────────────────────────┘
               │ IPC EventBus
               ▼
┌──────────────────────────────────────────────────┐
│   Kernel / Programs (ChatProgram)               │
│   kernel/ · TypeScript · Platform-agnostic      │
│   提供：流式请求、Tool 循环、会话、生命周期管理  │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│   Services + Models                              │
│   SessionManager / ProviderFactory / ...          │
│   Message / Session / Settings / ToolCall         │
└──────────────────────────────────────────────────┘
```

- **Microkernel 模式**：内核（`kernel/Kernel.ts`）只做服务注册和生命周期，不执行业务
- **Bootloader 分阶段启动**：CORE_INIT → SERVICES_REGISTER → SERVICES_INIT → TOOLS_REGISTER → HANDLERS_INIT → CONFIG_LOAD → UI_RENDER → READY
- **ProviderFactory 独立**：Provider 服务通过工厂创建，不再耦合在 Kernel 上
- **Build 分离**：内核用 TypeScript + Vite 构建为 IIFE（`dist/kernel.bundle.iife.js`），侧边栏 UI 通过 `<script>` 加载
- **`MessageStructure.toAPIFormat` 归一化**：所有消息在发送前统一转为 OpenAI API 格式，确保 role/content/tool_calls 字段完整

详细分层与责任划分请阅读 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 🛠️ 调试

- **Service Worker**：在 `chrome://extensions/` 找到本扩展，点击 "服务工作线程" 打开 DevTools
- **Side Panel UI**：打开侧边栏后右键 → "检查" 进入 DevTools
- **查看事件流**：在控制台执行 `window.EventBus.getHistory()` 可查看最近 100 条事件
- **清空状态**：在控制台执行 `chrome.storage.local.clear()` 后重新加载

## 📦 版本

- **扩展版本**：`0.6.0`（见 `manifest.json` / `kernel/index.ts`）
- **架构版本**：Microkernel（Kernel + Bootloader + ProviderFactory 解耦）
- **构建系统**：TypeScript 6 + Vite 8 + Vitest 4
- **Manifest**：V3
- **v0.6 里程碑**：内核层纯 TypeScript 化，Vite 替换手写 IIFE，ProviderFactory 独立，消息序列化归一化

## 📄 许可

见 [LICENSE](LICENSE)。
