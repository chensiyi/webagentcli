# Web Agent Client - Chrome Extension

AI Agent 运行时环境，为 AI 提供浏览器交互能力。

## 项目结构

```
├── manifest.json                    # Chrome 扩展清单
├── background.js                    # Service Worker（核心运行时）
├── content.js                       # Content Script（页面交互）
├── sidepanel/                       # Side Panel UI
│   ├── sidepanel.html               # 主页面
│   ├── app.js                       # 应用入口
│   ├── dom.js                       # DOM 工具库
│   ├── theme.css                    # CSS 主题系统
│   │
│   ├── managers/                    # 业务逻辑层
│   │   ├── SessionManager.js        # 会话管理（多会话、流式请求绑定）
│   │   ├── ContextManager.js        # 上下文管理（token 估算、自动截断）
│   │   └── UserScriptManager.js     # 用户脚本管理（安装、启用、执行）
│   │
│   ├── services/                    # 外部服务层
│   │   └── ai/
│   │       └── AIManager.js         # AI 服务（API 调用、流式交互）
│   │
│   ├── utils/                       # 通用工具
│   │   └── markdown.js              # Markdown 渲染
│   │
│   └── pages/                       # UI 页面组件
│       ├── chat.js                  # 聊天页面
│       ├── history.js               # 历史对话页面
│       ├── scripts.js               # 用户脚本页面
│       └── settings.js              # 设置页面
│
└── assets/                          # 静态资源
```

## 快速开始

### 安装

1. 克隆项目
```bash
git clone <repository-url>
cd webagentcli
```

2. 加载扩展
- 打开 Chrome，访问 `chrome://extensions/`
- 启用右上角的"开发者模式"
- 点击"加载已解压的扩展程序"
- 选择项目根目录（包含 manifest.json 的目录）

### 测试

1. 打开任意网页（如 https://www.baidu.com）
2. 点击浏览器工具栏中的扩展图标
3. 右侧会出现 Side Panel 聊天界面
4. 输入消息并发送，查看响应

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

#### 2. ContextManager - 上下文窗口管理器
**职责**：智能估算 token 数量并截断历史消息

**核心功能**：
- **模型映射表**：维护常见模型的上下文窗口大小（GPT-4: 8K, GPT-4o: 128K, Claude-3: 200K）
- **Token 估算**：简化算法（字符数 ÷ 2.5），平衡准确性和性能
- **智能截断策略**：
  - 始终保留 system 消息
  - 从最新消息往前选择，优先保留最近的对话
  - 预留输出空间（maxTokens）
- **使用率统计**：实时显示当前上下文使用情况

**工作流程**：
```javascript
// 发送消息前
chatMessages = contextManager.truncateMessages(
  chatMessages,
  settings.model,
  settings.maxTokens || 2000
);
// 控制台输出：[Chat] Context usage: 3500/128000 (3%)
```

#### 3. AIManager - AI 服务管理器
**职责**：统一的 AI API 调用接口（LangChain 兼容）

**核心功能**：
- **多提供商支持**：可注册多个 AI 提供商（OpenRouter、OpenAI、Claude 等）
- **标准接口**：invoke()、stream() 方法，兼容 LangChain 风格
- **流式响应处理**：SSE 协议解析，逐块返回内容
- **多模态支持**：文本、图片、文件等多种内容类型
- **功能检测**：supportsFeature() 检查流式、视觉、工具等能力

**使用示例**：
```javascript
const ai = new AIManager();
ai.registerProvider('default', {
  endpoint: 'https://api.openrouter.ai/v1',
  apiKey: 'sk-...',
  defaultModel: 'gpt-4'
});
ai.setProvider('default');

// 非流式调用
const result = await ai.invoke(messages, { temperature: 0.7 });

// 流式调用
await ai.stream(messages, {}, (chunk) => {
  console.log(chunk.content); // 逐块接收
});
```

#### 4. UserScriptManager - 用户脚本管理器
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

#### 5. Background Service Worker - 后台运行时
**职责**：处理流式聊天请求、转发消息

**核心功能**：
- **长连接处理**：监听 chrome.runtime.onConnect，维持与 sidepanel 的 port 连接
- **流式转发**：接收 AI 的 SSE 流，逐块转发给 sidepanel
- **错误处理**：网络错误、API 错误的统一处理
- **CSP 绕过**：在 background 中发起 fetch 请求，避免扩展 CSP 限制

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
│  chat.js | history.js | scripts.js  │
├─────────────────────────────────────┤
│      Managers (Business Logic)      │  ← 业务逻辑层
│ SessionManager | ContextManager     │
├─────────────────────────────────────┤
│       Services (External APIs)      │  ← 外部服务层
│        AIManager (AI APIs)          │
├─────────────────────────────────────┤
│         Utils (Utilities)           │  ← 通用工具
│   dom.js | markdown.js              │
└─────────────────────────────────────┘
```

**设计原则**：
- **单向依赖**：Pages → Managers → Services → Utils
- **职责分离**：每层只关注自己的职责
- **可测试性**：各层独立，易于单元测试
- **可扩展性**：新增功能只需在对应层添加模块

### 功能特性

#### ✅ 已实现
- **多会话管理**：支持同时存在多个对话，切换不影响正在进行的请求
- **流式响应**：SSE 协议逐块接收 AI 回复，实时显示
- **智能上下文管理**：根据模型限制自动截断历史消息
- **Markdown 渲染**：AI 回复支持 Markdown 格式
- **主题切换**：亮色/暗色主题，自动保存偏好
- **历史对话**：持久化存储，支持搜索、删除
- **用户脚本管理**：动态注册和执行用户脚本（MAIN world）
- **模型配置**：支持自定义 API 端点、模型、温度等参数

#### 🚧 计划中
- [ ] 多模态支持（图片、文件上传）
- [ ] 工具调用（浏览器自动化操作）
- [ ] 语音输入/输出
- [ ] 代码高亮和语法检测
- [ ] 导出对话（Markdown/PDF）

## 开发注意事项

1. **ES Modules**：background.js 使用 `type: "module"`，支持 import/export
2. **异步消息**：所有消息处理都是异步的，返回 Promise
3. **持久化**：使用 chrome.storage.local 存储会话数据
4. **隔离世界**：Content Script 运行在独立上下文，无法直接访问页面 JS
5. **CSP 限制**：扩展内不能执行 eval() 或 inline script，需在 background 中发起 fetch
6. **长连接**：使用 chrome.runtime.connect 维持与 background 的连接，避免超时
7. **单一数据源**：SessionManager 是会话状态的唯一来源，UI 层不应维护副本

## 技术栈

- **Manifest V3** - Chrome Extension 最新架构
- **Service Worker** - 后台运行时
- **Content Scripts** - 页面交互
- **原生 JavaScript** - 无框架，轻量级实现
- **Side Panel API** - 浏览器侧边栏 UI

## 许可证

MIT
