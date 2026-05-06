# Web Agent Client - 架构文档

> 本文档记录系统的整体架构设计、模块关系、数据流向和核心设计模式。根据此文档可以快速理解和重构整个项目。

**最后更新**: 2026-05-06  
**版本**: v1.0.0

---

## 目录

- [1. 系统概览](#1-系统概览)
- [2. 技术栈](#2-技术栈)
- [3. 架构分层](#3-架构分层)
- [4. 核心模块详解](#4-核心模块详解)
- [5. 数据流设计](#5-数据流设计)
- [6. 通信协议](#6-通信协议)
- [7. 设计模式](#7-设计模式)
- [8. 扩展机制](#8-扩展机制)
- [9. 重构指南](#9-重构指南)

---

## 1. 系统概览

### 1.1 项目定位

Web Agent Client 是一个 Chrome Extension，为 AI Agent 提供浏览器运行时环境，使 AI 能够：
- 与用户进行多轮对话
- 执行工具调用（搜索、网页抓取、代码执行等）
- 处理多模态内容（图片、音频、视频）
- 注入和执行用户脚本

### 1.2 核心价值

```
AI 模型 + 浏览器能力 = 智能助手
```

通过 Chrome Extension API，将 AI 的能力扩展到：
- DOM 操作
- 网络请求（绕过 CSP）
- 本地存储
- 脚本注入

### 1.3 项目结构

```
├── manifest.json                    # Chrome 扩展清单（MV3）
├── content.js                       # Content Script（页面交互）
├── sidepanel/                       # Side Panel UI + Background
│   ├── background/                  # 后台服务层（Service Worker）
│   │   ├── background.js            # Service Worker 协调器
│   │   ├── stream-core.js           # 核心流式引擎
│   │   ├── message-transformer.js   # 消息转换逻辑
│   │   └── script-injector.js       # 脚本注入管理
│   │
│   ├── pages/                       # UI 页面组件
│   │   ├── chat/                    # 聊天页面（模块化）
│   │   ├── history.js               # 历史对话页面
│   │   ├── settings.js              # 设置页面
│   │   └── scripts.js               # 用户脚本页面
│   │
│   ├── modules/                     # 功能模块（业务逻辑层）
│   │   ├── agent/                   # Agent 核心
│   │   ├── tools/                   # 工具集
│   │   ├── scripts/                 # 用户脚本系统
│   │   └── storage/                 # 存储管理
│   │
│   └── utils/                       # 通用工具
│
└── assets/                          # 静态资源
```

---

## 2. 技术栈

### 2.1 核心技术

- **Manifest V3** - Chrome Extension 最新架构
- **Service Worker** - 后台运行时（background/）
- **Side Panel API** - 浏览器侧边栏 UI
- **Content Scripts** - 页面交互（content.js）
- **原生 JavaScript** - 无框架，轻量级实现

### 2.2 关键 API

- `chrome.runtime.connect` - 长连接通信
- `chrome.storage.local` - 持久化存储
- `chrome.userScripts` - 动态脚本注册
- `fetch` - 网络请求（Service Worker 中不受 CSP 限制）

---

## 3. 架构分层

### 3.1 四层架构

```
┌─────────────────────────────────────┐
│         Pages (UI Layer)            │  ← 页面组件层
│  chat | history | scripts | settings│     - 负责 UI 渲染和用户交互
│                                     │     - 调用 Modules 层业务逻辑
├─────────────────────────────────────┤
│      Modules (Business Logic)       │  ← 业务逻辑层
│ Agent | Tools | UserScripts         │     - 封装核心业务逻辑
│                                     │     - 不依赖 UI，可独立测试
├─────────────────────────────────────┤
│       Utils (Utilities)             │  ← 通用工具层
│   markdown | media | toast | ...    │     - 纯函数，无状态
│                                     │     - 被上层模块调用
├─────────────────────────────────────┤
│     Background (Service Worker)     │  ← 后台服务层
│ stream-core | message-transformer   │     - 处理 API 请求
│                                     │     - 转发流式响应
└─────────────────────────────────────┘
```

### 3.2 依赖关系

**单向依赖**：Pages → Modules → Utils

- Pages 可以调用 Modules 和 Utils
- Modules 可以调用 Utils
- Utils 不依赖任何层
- Background 独立运行，通过消息通信与 Pages 交互

### 3.3 职责分离原则

| 层级 | 职责 | 示例 |
|------|------|------|
| Pages | UI 渲染、用户交互 | ChatRenderer, ModelSelector |
| Modules | 业务逻辑、状态管理 | SessionManager, ToolManager |
| Utils | 工具函数、数据处理 | markdown.render(), Toast.show() |
| Background | API 请求、流式转发 | handleStreamPort(), processChunk() |

---

## 4. 核心模块详解

### 4.1 SessionManager - 会话管理器

**文件**: `sidepanel/modules/agent/SessionManager.js`

**职责**: 管理多个对话的状态和流式请求

**核心数据结构**:
```javascript
{
  sessions: {
    [sessionId]: {
      id: string,
      messages: Array<Message>,
      isLoading: boolean,
      port: chrome.runtime.Port | null,
      enabledTools: { [toolId]: boolean },
      createdAt: number,
      updatedAt: number
    }
  },
  currentSessionId: string | null
}
```

**关键方法**:
- `createSession(sessionId, initialMessages)` - 创建新会话
- `getSession(sessionId)` - 获取会话
- `startStreamRequest(sessionId, port)` - 开始流式请求（绑定 port）
- `completeStreamRequest(sessionId)` - 完成流式请求
- `addMessage(sessionId, message)` - 添加消息
- `deleteMessageWithTools(sessionId, messageIndex)` - 删除消息及关联 tool 消息
- `switchSession(sessionId)` - 切换会话（不断开其他会话的请求）

**设计亮点**:
- **单一数据源**: 所有会话状态集中在 `sessions` 对象
- **流式请求绑定**: port 绑定到特定会话，切换会话不影响正在进行的请求
- **自动清理**: 监听 `port.onDisconnect` 自动更新状态
- **工具联动删除**: 删除 assistant 消息时自动删除对应的 tool 消息

---

### 4.2 ToolManager - 工具管理器

**文件**: `sidepanel/modules/tools/BaseToolManager.js`

**职责**: 工具的注册、解析、执行调度

**核心数据结构**:
```javascript
{
  tools: Map<toolId, ToolConfig>,
  // ToolConfig 结构见各工具文件（SearchTool.js, CodeTool.js 等）
}
```

**关键方法**:
- `registerTool(tool)` - 注册工具
- `getTool(id)` - 获取工具配置
- `getAllTools()` - 获取所有工具（含启用状态）
- `getOpenAIToolsDefinition()` - 生成 OpenAI 标准格式的工具定义
- `buildToolParameters(tool)` - 构建工具的参数 Schema
- `toggleTool(id, enabled)` - 切换工具开关
- `isToolEnabled(id)` - 检查工具是否启用
- `getEnabledTools()` - 获取所有启用的工具
- `generateSystemPrompt()` - 生成系统提示（包含启用工具的说明）

**工具定义格式** (OpenAI 标准):
```javascript
{
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索网络信息',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  }
}
```

**工具执行流程**:
1. BaseToolManager 生成工具定义
2. 适配器转换为对应 API 标准（如 Anthropic 的 input_schema）
3. API 返回 tool_calls
4. ToolExecutor 执行工具
5. 创建 tool 消息并添加到会话

---

### 4.3 StreamCore - 流式处理引擎

**文件**: `sidepanel/background/stream-core.js`

**职责**: 处理 API 请求和流式响应

**核心流程**:
```
handleStreamPort(port)
  ↓
processMessages(messages, toolsEnabled)
  ↓
buildRequestBody(processedMessages, model, ...)
  ↓
fetch(apiEndpoint, { method: 'POST', ... })
  ↓
handleStreamResponse(response, port, isDisconnected)
  ↓
processChunk(trimmed, port, accumulatedToolCalls)
  ↓
port.postMessage({ type: 'chunk' | 'tool_call' | 'complete' })
```

**关键方法**:
- `handleStreamPort(port)` - 处理流式聊天端口连接
- `processMessages(messages, toolsEnabled)` - 处理消息转换
- `handleStreamResponse(response, port, isDisconnected)` - 处理流式响应
- `processChunk(trimmed, port, accumulatedToolCalls)` - 处理单个数据块

**tool_calls 累积逻辑**:
```javascript
// 用于累积 tool_calls 片段
let accumulatedToolCalls = {};

// 在 processChunk 中
if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
  for (const delta of toolCallsDelta) {
    const index = delta.index;
    
    // 初始化该索引的 tool_call
    if (!accumulatedToolCalls[index]) {
      accumulatedToolCalls[index] = {
        id: '',
        type: 'function',
        function: { name: '', arguments: '' }
      };
    }
    
    // 累积字段
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.function.name += delta.function.name;
    if (delta.function?.arguments) current.function.arguments += delta.function.arguments;
  }
  
  // 发送完整的 tool_calls 到前端
  port.postMessage({ 
    type: 'tool_call', 
    tool_calls: Object.values(accumulatedToolCalls)
  });
}
```

---

### 4.4 AdapterManager - 适配器管理器

**文件**: `sidepanel/modules/agent/adapters/AdapterManager.js`

**职责**: 管理不同 API 提供商的适配器

**支持的适配器**:
- OpenAIAdapter - OpenAI 标准格式
- AnthropicAdapter - Anthropic Claude 格式
- OllamaAdapter - Ollama 本地模型
- LMStudioAdapter - LM Studio 本地模型
- OpenRouterAdapter - OpenRouter 聚合平台

**关键方法**:
- `select(adapterType)` - 选择适配器
- `configure(config)` - 配置适配器
- `getCurrentAdapter()` - 获取当前适配器
- `buildUrl(path)` - 构建 API URL
- `formatMessages(messages)` - 格式化消息
- `buildRequestBody(params)` - 构建请求体
- `parseResponse(data)` - 解析响应
- `parseStreamChunk(data)` - 解析流式片段

**Anthropic 特殊处理**:
```javascript
// 工具定义转换
convertToolsForAnthropic(openaiTools) {
  return openaiTools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters  // parameters → input_schema
  }));
}

// 消息格式转换
formatMessages(messages) {
  // role: 'tool' → role: 'user' + content: [{ type: 'tool_result' }]
}
```

详见 [TOOL_CALL_STANDARDS.md](./adapters/TOOL_CALL_STANDARDS.md)

---

### 4.5 ModelManager - 模型管理器

**文件**: `sidepanel/modules/models/ModelManager.js`

**职责**: 模型列表获取、能力检测、缓存管理

**核心功能**:
- **API 调用**: 直接从 OpenAI 兼容 API 获取模型列表
- **能力检测**: 自动识别模型的视觉、流式、工具调用等能力
- **缓存管理**: 5分钟缓存，避免频繁请求
- **模型映射**: 维护常见模型的上下文窗口大小

**关键方法**:
- `fetchModels(apiKey, apiEndpoint)` - 获取模型列表
- `detectCapabilities(modelName)` - 检测模型能力
- `getModelInfo(modelId)` - 获取模型详细信息
- `isVisionModel(modelId)` - 是否为视觉模型
- `getContextWindow(modelId)` - 获取上下文窗口大小

**缓存策略**:
```javascript
// chrome.storage.local 缓存（非 localStorage）
const cacheData = {
  apiEndpoint: this.currentApiEndpoint,
  models: this.models,
  modelDetails: this.modelDetails,
  capabilities: this.capabilities,
  timestamp: Date.now()
};

chrome.storage.local.set({ [this.storageKey]: cacheData });

// 加载时检查缓存（24小时有效期）
if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
  return cached; // 24小时内使用缓存
}
```

---

### 4.6 UserScriptManager - 用户脚本管理器

**文件**: `sidepanel/modules/scripts/UserScriptManager.js`

**职责**: 管理 Chrome userScripts API，实现动态脚本注入

**核心功能**:
- **脚本注册**: 通过 `chrome.userScripts.register()` 动态注册脚本
- **URL 匹配**: 根据配置的 URL patterns 自动在对应页面执行
- **MAIN world 执行**: 绕过 CSP 限制，直接访问页面 DOM
- **脚本生命周期**: 安装、启用、禁用、卸载

**工作流程**:
```javascript
await chrome.userScripts.register({
  id: scriptId,
  matches: ['*://*.example.com/*'],
  js: [{ code: scriptCode }],
  world: 'MAIN'  // 关键：在 MAIN world 执行
});
```

---

## 5. 数据流设计

### 5.1 消息发送流程

```
用户输入文本
  ↓
MessageSender.sendMessage(sessionId, text, media)
  ↓
SessionManager.addMessage(sessionId, userMessage)
  ↓
prepareMessages(session, settings)  // 准备消息列表
  ↓
chrome.runtime.connect({ name: 'chat-stream' })
  ↓
port.postMessage({ messages, apiKey, apiEndpoint, model, tools })
  ↓
Background: handleStreamPort(port)
  ↓
fetch(apiEndpoint, { body: JSON.stringify(requestBody) })
  ↓
AI Provider 返回 SSE 流
  ↓
Background: handleStreamResponse(response, port)
  ↓
Background: processChunk(chunk) → port.postMessage({ type: 'chunk' })
  ↓
Frontend: StreamMessageHandler.handleMessage(msg)
  ↓
StreamMessageProcessor.processMessage(responseMsg, sessionId)
  ↓
SessionManager.updateLastMessage(sessionId, content)
  ↓
ChatRenderer.renderMessages()  // UI 更新
```

### 5.2 工具调用流程

```
AI 返回 tool_calls
  ↓
Background: processChunk(chunk) 累积 tool_calls
  ↓
Background: port.postMessage({ type: 'tool_call', tool_calls: [...] })
  ↓
Frontend: StreamMessageHandler.handleMessage(msg)
  ↓
StreamMessageProcessor.handleToolCall(msg, session)
  ↓
currentMsg.tool_calls = msg.tool_calls  // 保存到消息对象
  ↓
onToolCall callback → renderCallback()  // UI 显示工具卡片
  ↓
stream complete
  ↓
ToolExecutor.executeToolCalls(sessionId, assistantMessage)
  ↓
for each tool_call:
  ToolManager.getTool(toolType).execute(args)
  ↓
SessionManager.addMessage(sessionId, toolMessage)
  ↓
renderCallback()  // UI 显示工具结果
  ↓
等待用户输入（不再自动发送第二轮请求）
```

### 5.3 会话切换流程

```
用户点击会话
  ↓
SessionManager.switchSession(sessionId)
  ↓
currentSessionId = sessionId
  ↓
UI 重新渲染新会话的消息
  ↓
注意：其他会话的 port 不断开，请求继续完成
```

---

## 6. 通信协议

### 6.1 Frontend → Background

```javascript
port.postMessage({
  messages: Array<Message>,
  apiKey: string,
  apiEndpoint: string,
  model: string,
  temperature: number,
  maxTokens: number,
  toolsEnabled: boolean,
  tools: Array<ToolDefinition> | null
});
```

### 6.2 Background → Frontend

**流式片段**:
```javascript
port.postMessage({
  type: 'chunk',
  content: string
});
```

**思考内容**:
```javascript
port.postMessage({
  type: 'reasoning',
  reasoning_content: string
});
```

**工具调用**:
```javascript
port.postMessage({
  type: 'tool_call',
  tool_calls: Array<{
    id: string,
    type: 'function',
    function: {
      name: string,
      arguments: string  // JSON 字符串
    }
  }>
});
```

**完成**:
```javascript
port.postMessage({
  type: 'complete'
});
```

**错误**:
```javascript
port.postMessage({
  type: 'error',
  error: string
});
```

---

## 7. 设计模式

### 7.1 适配器模式 (Adapter Pattern)

**应用**: 不同 API 提供商的统一接口

```
ProviderAdapter (统一接口)
  ├─ OpenAIAdapter
  ├─ AnthropicAdapter
  ├─ OllamaAdapter
  ├─ LMStudioAdapter
  └─ OpenRouterAdapter
```

**优势**:
- 新增 API 提供商只需添加新适配器
- 上层代码无需关心具体 API 标准
- 内部统一使用 OpenAI 格式

---

### 7.2 单例模式 (Singleton Pattern)

**应用**: SessionManager、ModelManager、AdapterManager 等全局管理器

```javascript
// 在文件末尾创建全局单例
(function() {
  'use strict';
  
  class SessionManager {
    // ... 实现
  }
  
  // 全局单例
  window.SessionManager = new SessionManager();
})();
```

**优势**:
- 全局唯一实例，避免重复创建
- 通过 IIFE 封装，避免污染全局命名空间
- 所有模块共享同一状态

---

### 7.3 观察者模式 (Observer Pattern)

**应用**: Port 断开监听

```javascript
port.onDisconnect.addListener(() => {
  session.port = null;
  session.isLoading = false;
});
```

**优势**:
- 自动清理资源
- 解耦状态管理

---

### 7.4 策略模式 (Strategy Pattern)

**应用**: 消息渲染器系统

虽然各个渲染器没有统一的基类，但通过约定俗成的接口实现了策略模式：

```javascript
// TextRenderer.js
class TextRenderer {
  render(text) { /* 渲染逻辑 */ }
  update(text, container) { /* 增量更新 */ }
}

// ImageRenderer.js
class ImageRenderer {
  render(message) { /* 渲染逻辑 */ }
}

// 在 ChatMessageRenderer 中注册和使用
this.renderers = [
  new TextRenderer(),
  new ImageRenderer(),
  new AudioRenderer(),
  // ...
];

// 选择合适的渲染器
for (const renderer of this.renderers) {
  if (renderer.canRender?.(message) || matchesMessageType(message)) {
    return renderer.render(message);
  }
}
```

**优势**:
- 新增媒体类型只需添加新渲染器
- 每个渲染器职责单一，易于维护
- 运行时动态选择渲染策略

---

## 8. 扩展机制

### 8.1 添加工具

1. 创建工具类（继承 BaseTool 或独立实现）
2. 在 `BaseToolManager` 构造函数中注册
3. 实现 `config` 对象（id, name, description, systemPrompt, execute）
4. 在 `buildToolParameters` 中添加参数 Schema

**示例**:
```javascript
// MyTool.js
window.MyTool = {
  config: {
    id: 'my_tool',
    name: 'My Tool',
    description: '工具描述',
    systemPrompt: '工具使用说明',
    execute: async (args) => {
      // 执行逻辑
      return result;
    }
  }
};

// BaseToolManager.js
this.registerTool(window.MyTool.config);
```

---

### 8.2 添加 API 适配器

1. 创建适配器类（实现统一接口）
2. 在 `AdapterManager` 中注册
3. 实现必要方法：`buildUrl`, `formatMessages`, `buildRequestBody`, `parseResponse`, `parseStreamChunk`
4. 如有需要，添加工具定义转换方法

**示例**:
```javascript
// NewAdapter.js
class NewAdapter {
  buildUrl(path) { ... }
  formatMessages(messages) { ... }
  buildRequestBody(params) { ... }
  parseResponse(data) { ... }
  parseStreamChunk(data) { ... }
}

// AdapterManager.js
this.adapters.set('new', new NewAdapter());
```

---

### 8.3 添加渲染器

1. 创建渲染器类（继承 BaseRenderer 或独立实现）
2. 在 `ChatMessageRenderer` 中注册
3. 实现 `canRender(message)` 和 `render(message)` 方法

**示例**:
```javascript
// CustomRenderer.js
class CustomRenderer {
  canRender(message) {
    return message.type === 'custom';
  }
  
  render(message) {
    // 渲染逻辑
    return element;
  }
}

// ChatMessageRenderer.js
this.renderers.push(new CustomRenderer());
```

---

## 9. 重构指南

### 9.1 重构原则

1. **保持接口兼容**: 修改内部实现时，保持对外接口不变
2. **单向依赖**: 严格遵守 Pages → Modules → Utils 的依赖方向
3. **单一职责**: 每个模块只负责一个功能
4. **可测试性**: 模块应可独立测试，不依赖全局状态

### 9.2 常见重构场景

#### 场景 1: 添加新的 UI 页面

1. 在 `pages/` 目录下创建新页面文件
2. 在 `sidepanel.html` 中添加导航
3. 在 `app.js` 中注册路由
4. 如需业务逻辑，在 `modules/` 中创建新模块

#### 场景 2: 修改消息格式

1. 更新 `SessionManager.addMessage` 的数据验证
2. 更新相关渲染器
3. 更新 `message-transformer.js` 中的转换逻辑
4. 更新适配器中的 `formatMessages` 方法

#### 场景 3: 更换 AI Provider

1. 在 `AdapterManager` 中添加新适配器
2. 在设置页面添加选项
3. 更新 `ProviderAdapter.selectTemplate` 方法
4. 测试工具调用、流式响应等功能

### 9.3 调试技巧

**Background Service Worker**:
- `chrome://extensions/` → 找到扩展 → 点击 "Service Worker"

**Content Script**:
- 在网页中按 F12 → Console 标签

**Side Panel UI**:
- 在 Side Panel 中右键 → "检查" → Console

**日志级别**:
```javascript
console.log('[Module] Message')  // 普通日志
console.warn('[Module] Warning') // 警告
console.error('[Module] Error')  // 错误
```

### 9.4 性能优化

1. **消息截断**: 使用 `ChatContext.truncateMessages` 控制上下文长度
2. **模型缓存**: ModelManager 使用 5 分钟缓存
3. **懒加载**: 按需加载模块，避免一次性加载所有代码
4. **防抖**: 输入框使用防抖，避免频繁触发

---

## 附录

### A. 关键文件清单

| 文件 | 职责 | 行数 |
|------|------|------|
| `background.js` | Service Worker 协调器 | ~191 |
| `stream-core.js` | 核心流式引擎 | ~248 |
| `SessionManager.js` | 会话管理器 | ~396 |
| `BaseToolManager.js` | 工具管理器 | ~362 |
| `AdapterManager.js` | 适配器管理器 | ~XXX |
| `ModelManager.js` | 模型管理器 | ~XXX |
| `UserScriptManager.js` | 用户脚本管理器 | ~XXX |

### B. 相关文档

- [TOOL_CALL_STANDARDS.md](./adapters/TOOL_CALL_STANDARDS.md) - 工具调用 API 标准对照
- [README.md](../../README.md) - 项目总览
- [modules/README.md](../modules/README.md) - 模块说明

### C. 版本历史

- v1.0.0 (2026-05-06) - 初始版本，完成架构文档

---

**维护者**: Lingma  
**更新频率**: 每次重大功能更新后同步更新此文档
