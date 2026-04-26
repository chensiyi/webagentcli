# Web Agent Client - Chrome Extension

AI Agent 运行时环境，为 AI 提供浏览器交互能力。
js实现一切软件的时代到了，用天量用户的热情，冲烂软件行业护城河吧！

## 项目结构

```
├── manifest.json                    # Chrome 扩展清单
├── sidepanel/                       # Side Panel UI + Background Service Worker
│   ├── background.js                # Service Worker（核心运行时）
│   ├── sidepanel.html               # 主页面
│   ├── app.js                       # 应用入口
│   │
│   ├── pages/                       # UI 页面组件
│   │   ├── dom.js                   # DOM 工具库
│   │   ├── chat/
│   │   │   ├── context.js           # 聊天上下文管理
│   │   │   ├── render.js            # 消息渲染逻辑
│   │   │   └── chat.js              # 聊天页面主逻辑
│   │   ├── scripts.js               # 用户脚本页面
│   │   ├── history.js               # 历史对话页面
│   │   ├── settings.js              # 设置页面
│   │   └── storage.js               # 存储管理页面
│   │
│   ├── modules/                     # 功能模块
│   │   ├── agent/                   # Agent 核心
│   │   │   ├── models/
│   │   │   │   ├── ModelCapabilityDetector.js  # 模型能力检测
│   │   │   │   └── ModelManager.js             # 模型管理器（含 API 调用）
│   │   │   ├── SessionManager.js    # 会话管理
│   │   │   └── agent.js             # Agent 主逻辑
│   │   │
│   │   ├── tools/                   # 工具集
│   │   │   ├── SearchTool.js        # 网络搜索（DuckDuckGo + 百度）
│   │   │   ├── FetchTool.js         # 网页抓取（含内容提取）
│   │   │   ├── CodeTool.js          # 代码执行
│   │   │   └── BaseToolManager.js   # 工具管理器
│   │   │
│   │   └── scripts/                 # 用户脚本系统
│   │       ├── UserScriptStorage.js     # 脚本存储
│   │       ├── UserScriptMetadata.js    # 脚本元数据解析
│   │       ├── UserScriptSandbox.js     # 沙盒执行环境
│   │       └── UserScriptManager.js     # 脚本管理器
│   │
│   └── utils/                       # 通用工具
│       ├── dom.js                   # DOM 操作工具
│       ├── markdown.js              # Markdown 渲染
│       ├── media.js                 # 媒体处理
│       ├── time.js                  # 时间工具
│       ├── toast.js                 # Toast 提示
│       ├── confirm.js               # 确认对话框
│       ├── messageTypes.js          # 消息类型定义
│       ├── thinkingMode.js          # 思考模式
│       └── ragCodeExtension.js      # RAG 代码扩展
│
└── assets/                          # 静态资源
```

## 快速开始

### 安装

1. **下载源码**
   - 从 GitHub 下载最新 release 的 Source code (zip)
   - 或克隆项目：`git clone <repository-url>`

2. **加载扩展**
   - 打开 Chrome，访问 `chrome://extensions/`
   - 启用右上角的“开发者模式”
   - 点击“加载已解压的扩展程序”
   - 选择项目根目录（包含 manifest.json 的目录）

3. **使用**
   - 打开任意网页
   - 点击浏览器工具栏中的扩展图标
   - 右侧会出现 Side Panel 聊天界面
   - 在设置页面配置 API Key 后即可使用

4. **启用用户脚本支持（可选）**
   
   如需运行自定义用户脚本，需要启用 Tampermonkey 兼容模式：
   
   - Chrome 地址栏输入 `chrome://extensions/`
   - 找到 Web Agent Client 扩展
   - 点击“详细信息”
   - 开启“允许访问文件 URL”（如需要）
   - 参考 [Tampermonkey 用户脚本指南](https://tampermonkey.net/faq.php#Q203) 了解更多

### 调试

**Background Service Worker**：
- `chrome://extensions/` → 找到扩展 → 点击 "Service Worker"

**Content Script**：
- 在网页中按 F12 → Console 标签

**Side Panel UI**：
- 在 Side Panel 中右键 → "检查" → Console

详细测试指南见 [TESTING.md](TESTING.md)

## 架构说明

### 通信流程

```
Side Panel (UI)
    ↓ chrome.runtime.connect (长连接)
Background (Runtime)
    ↓ fetch API
AI Provider (OpenRouter/OpenAI/Claude...)
```

### 核心模块

#### 1. SessionManager - 会话管理器
**职责**：管理多个对话的状态和流式请求

**核心功能**：
- **多会话管理**：支持同时存在多个对话，每个会话独立维护消息历史
- **流式请求绑定**：将 AI 请求的 port 绑定到特定会话，切换会话不影响正在进行的请求
- **状态同步**：isLoading、port、messages 等状态统一管理
- **会话生命周期**：创建、切换、清除、删除

**设计原则**：
- 单一数据源：所有会话状态集中在 `sessions` 对象中
- 解耦 UI 和业务逻辑：SessionManager 不关心 UI 如何渲染
- 自动清理：监听 port.onDisconnect 自动更新状态

#### 2. ModelManager - 模型管理器
**职责**：模型列表获取、能力检测、缓存管理

**核心功能**：
- **API 调用**：直接从 OpenAI 兼容 API 获取模型列表
- **能力检测**：自动识别模型的视觉、流式、工具调用等能力
- **缓存管理**：5分钟缓存，避免频繁请求
- **模型映射**：维护常见模型的上下文窗口大小

**工作流程**：
```javascript
// 获取模型列表
const models = await window.ModelManager.fetchModels(apiKey, apiEndpoint);
// 控制台输出：[ModelManager] Fetched 50 models from https://api.openrouter.ai/v1
```

#### 3. SearchTool - 网络搜索工具
**职责**：提供网络搜索能力（DuckDuckGo + 百度）

**核心功能**：
- **双引擎支持**：优先使用 DuckDuckGo，失败后降级到百度
- **分页支持**：通过 `|page=N` 参数实现翻页
- **结果格式化**：自动提取标题、链接、摘要
- **智能解析**：多种正则表达式策略，适配不同网站结构

**使用示例**：
```javascript
// Agent 调用
const result = await window.SearchTool.execute('latest AI news');
// 返回：{ success: true, results: [...], output: '第 1 页，找到 10 条结果...' }
```

#### 4. FetchTool - 网页抓取工具
**职责**：抓取网页内容并提取正文

**核心功能**：
- **类 Readability 算法**：智能识别文章容器，移除导航、页脚等噪音
- **HTML 转 Markdown**：完整的格式转换（标题、段落、链接、图片等）
- **媒体提取**：自动提取页面中的链接、图片、视频等资源
- **超时控制**：10秒超时，避免长时间等待

**工作流程**：
```javascript
const result = await window.FetchTool.execute('https://example.com/article');
// 返回：{ title, content, links, images, media, output }
```

#### 5. UserScriptManager - 用户脚本管理器
**职责**：管理 Chrome userScripts API，实现动态脚本注入

**核心功能**：
- **脚本注册**：通过 chrome.userScripts.register() 动态注册脚本
- **URL 匹配**：根据配置的 URL patterns 自动在对应页面执行
- **MAIN world 执行**：绕过 CSP 限制，直接访问页面 DOM
- **脚本生命周期**：安装、启用、禁用、卸载

**工作流程**：
```javascript
// 注册脚本
await chrome.userScripts.register({
  id: scriptId,
  matches: ['*://*.example.com/*'],
  js: [{ code: scriptCode }],
  world: 'MAIN'  // 关键：在 MAIN world 执行
});
```

#### 6. Background Service Worker - 后台运行时
**职责**：处理流式聊天请求、转发消息

**核心功能**：
- **长连接处理**：监听 chrome.runtime.onConnect，维持与 sidepanel 的 port 连接
- **流式转发**：接收 AI 的 SSE 流，逐块转发给 sidepanel
- **错误处理**：网络错误、API 错误的统一处理
- **直接 API 调用**：sidepanel 直接调用 fetch，无需 background 中转

**通信协议**：
```javascript
// Sidepanel → Background
port.postMessage({
  messages: [...],
  apiKey: 'sk-...',
  apiEndpoint: 'https://...',
  model: 'gpt-4',
  temperature: 0.7
});

// Background → Sidepanel
port.postMessage({ type: 'chunk', content: '...' });  // 流式片段
port.postMessage({ type: 'complete' });                // 完成
port.postMessage({ type: 'error', error: '...' });     // 错误
```

### 分层架构设计

```
┌─────────────────────────────────────┐
│         Pages (UI Layer)            │  ← 页面组件
│  chat | history | scripts | settings│
├─────────────────────────────────────┤
│      Modules (Business Logic)       │  ← 业务逻辑层
│ Agent | Tools | UserScripts         │
├─────────────────────────────────────┤
│       Utils (Utilities)             │  ← 通用工具
│   dom | markdown | media | toast    │
└─────────────────────────────────────┘
```

**设计原则**：
- **单向依赖**：Pages → Modules → Utils
- **职责分离**：每层只关注自己的职责
- **可测试性**：各层独立，易于单元测试
- **可扩展性**：新增功能只需在对应层添加模块

### 功能特性

#### ✅ 已实现
- **多会话管理**：支持同时存在多个对话，切换不影响正在进行的请求
- **流式响应**：SSE 协议逐块接收 AI 回复，实时显示
- **模型管理**：动态获取模型列表，自动检测能力
- **网络搜索**：DuckDuckGo + 百度双引擎，支持分页
- **网页抓取**：智能提取正文，HTML 转 Markdown
- **Markdown 渲染**：AI 回复支持 Markdown 格式
- **主题系统**：亮色/暗色主题，CSS 变量驱动，完整工具类库
- **历史对话**：持久化存储，支持搜索、删除
- **存储管理**：可视化查看和编辑 chrome.storage 数据
- **用户脚本管理**：动态注册和执行用户脚本（MAIN world）
- **模型配置**：支持自定义 API 端点、模型、温度等参数
- **多模态支持**：图片上传和视觉理解
- **统一交互组件**：Toast 提示、确认对话框，替代系统 alert/confirm
- **扩展能力框架**：预留 RAG、思考模式、代码执行、工具调用等接口

#### 🚧 计划中
- [ ] 语音输入/输出
- [ ] 代码高亮和语法检测
- [ ] 导出对话（Markdown/PDF）

## 开发注意事项

1. **ES Modules**：background.js 使用 `type: "module"`，支持 import/export
2. **异步消息**：所有消息处理都是异步的，返回 Promise
3. **持久化**：使用 chrome.storage.local 存储会话数据
4. **隔离世界**：Content Script 运行在独立上下文，无法直接访问页面 JS
5. **CSP 限制**：sidepanel 可直接调用 fetch API，不受 CSP 限制
6. **长连接**：使用 chrome.runtime.connect 维持与 background 的连接，避免超时
7. **单一数据源**：SessionManager 是会话状态的唯一来源，UI 层不应维护副本
8. **工具合并**：SearchTool、FetchTool 等包含完整实现，无需外部 API 模块

## 技术栈

- **Manifest V3** - Chrome Extension 最新架构
- **Service Worker** - 后台运行时
- **Content Scripts** - 页面交互
- **原生 JavaScript** - 无框架，轻量级实现
- **Side Panel API** - 浏览器侧边栏 UI

## 许可证

MIT
