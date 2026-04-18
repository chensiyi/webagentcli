# AI Browser Agent v5.0 架构文档

**版本**: v5.0.0  
**更新日期**: 2026-04-19  
**状态**: ✅ 生产环境  
**核心理念**: 超级解耦，自动化网页交互助手

---

## 📋 目录

1. [项目概述](#项目概述)
2. [分层架构](#分层架构)
3. [目录结构](#目录结构)
4. [核心模块](#核心模块)
5. [数据流设计](#数据流设计)
6. [关键特性](#关键特性)
7. [开发指南](#开发指南)

---

## 项目概述

### 目标

AI Browser Agent 是一个 **Tampermonkey 用户脚本**，旨在通过 AI 辅助提升用户在网页中的交互能力。

**核心价值**:
- 🤖 **智能对话** - 自然语言与 AI 交互
- ⚡ **自动执行** - AI 生成代码并自动执行
- 🔄 **流式响应** - 实时逐字输出
- 💾 **状态持久化** - 刷新页面后恢复会话
- 🎯 **多模型支持** - OpenRouter、LM Studio、Ollama 等

### 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Tampermonkey (浏览器扩展) |
| UI 框架 | React 18 (生产版本) |
| 构建工具 | Node.js + 自定义 build.js |
| API 通信 | GM_xmlhttpRequest |
| 状态管理 | StorageManager (统一状态管理) |
| 事件系统 | EventManager (事件总线) |

---

## 分层架构

```
┌─────────────────────────────────────────┐
│  Main Layer (程序启动层)                 │
│  - main.js                              │
│  - 职责：初始化模块、设置监听、暴露接口    │
└──────────────┬──────────────────────────┘
               │ 启动 WebAgentClient
┌──────────────▼──────────────────────────┐
│  Business Logic Layer (业务逻辑层)       │
│  - WebAgentClient (业务编排器)           │
│  - 消息队列、执行队列、会话管理           │
└──────────────┬──────────────────────────┘
               │ 委托给 AIAgent
┌──────────────▼──────────────────────────┐
│  Infrastructure Layer (基础设施层)       │
│  - AIAgent (组合器模式)                  │
│  - 整合 ModelManager, APIRouter,         │
│    PageAnalyzer, CodeExecutor            │
└──────────────┬──────────────────────────┘
               │ 使用服务
┌──────────────▼──────────────────────────┐
│  Service Layer (服务层)                  │
│  - api/ (API 客户端)                     │
│  - core/ (核心工具)                      │
│  - page-analyzer/ (页面分析)             │
│  - model-manager/ (模型管理)             │
│  - storage/ (存储管理)                   │
│  - provider/ (供应商管理)                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  UI Layer (表现层) - React              │
│  - ChatWindow.jsx                       │
│  - MessageList.jsx                      │
│  - SettingsDialog.jsx                   │
│  - 通过事件与 WebAgentClient 通信        │
└─────────────────────────────────────────┘
```

### 各层职责

#### 1. Main Layer (程序启动层)
- ✅ 初始化所有核心模块
- ✅ 启动 WebAgentClient
- ✅ 连接 UI 事件到 Client
- ✅ 暴露全局调试接口

**禁止**:
- ❌ 包含业务逻辑
- ❌ 直接操作 DOM（除了启动按钮）
- ❌ 直接调用 AIAgent 或 API 客户端

#### 2. Business Logic Layer (业务逻辑层)
- ✅ 业务流程编排
- ✅ 消息队列管理
- ✅ 代码执行队列管理
- ✅ 会话状态管理
- ✅ 错误处理策略

**禁止**:
- ❌ 直接操作 DOM
- ❌ 直接调用 API 客户端
- ❌ 包含 UI 渲染逻辑

#### 3. Infrastructure Layer (基础设施层)
- ✅ 组合底层服务
- ✅ 构建消息上下文
- ✅ 管理对话历史
- ✅ 智能模型选择
- ✅ Token 估算和截断

**禁止**:
- ❌ 直接操作 DOM
- ❌ 包含业务流程逻辑
- ❌ 处理用户交互细节

#### 4. Service Layer (服务层)
- ✅ 实现具体功能
- ✅ 访问 Tampermonkey API
- ✅ 网络请求
- ✅ 数据存储

**禁止**:
- ❌ 包含业务逻辑
- ❌ 直接操作 DOM
- ❌ 知道上层模块的存在

#### 5. UI Layer (表现层)
- ✅ 渲染 React 组件
- ✅ 捕获用户输入
- ✅ 通过事件与 WebAgentClient 通信
- ✅ 显示状态变化

**禁止**:
- ❌ 直接调用 AIAgent
- ❌ 直接调用 API 客户端
- ❌ 包含业务逻辑

---

## 目录结构

```
webagentcli/
├── src/                          # v5 当前版本源代码
│   ├── main.js                   # 程序入口
│   │
│   ├── business/                 # 业务逻辑层
│   │   └── WebAgentClient.js     # 业务编排器
│   │
│   ├── infrastructure/           # 基础设施层
│   │   └── AIAgent/
│   │       ├── index.js          # Agent 核心
│   │       └── CodeExecutor.js   # 代码执行器
│   │
│   ├── services/                 # 服务层
│   │   ├── api/                  # API 客户端
│   │   │   ├── BaseAPIClient.js
│   │   │   ├── OpenRouterClient.js
│   │   │   ├── LMStudioClient.js
│   │   │   ├── OllamaClient.js
│   │   │   ├── APIRouter.js
│   │   │   └── index.js
│   │   ├── config/
│   │   │   └── ConfigManager.js
│   │   ├── storage/
│   │   │   └── StorageManager.js
│   │   ├── provider/
│   │   │   └── ProviderManager.js
│   │   ├── model-manager/
│   │   │   └── ModelManager.js
│   │   └── page-analyzer/
│   │       └── PageAnalyzer.js
│   │
│   ├── app/                      # 应用层
│   │   ├── ui/                   # React UI
│   │   │   ├── index.jsx
│   │   │   ├── components/
│   │   │   │   ├── ChatWindow.jsx
│   │   │   │   ├── MessageItem.jsx
│   │   │   │   └── SettingsDialog.jsx
│   │   │   └── hooks/
│   │   │       ├── useAgent.js
│   │   │       └── useSettings.js
│   │   └── shortcuts/
│   │       └── ShortcutManager.js
│   │
│   ├── core/                     # 核心工具层
│   │   ├── utils.js
│   │   ├── EventManager.js
│   │   └── ErrorTracker.js
│   │
│   └── vendor/                   # 第三方库
│       ├── react.production.min.js
│       └── react-dom.production.min.js
│
├── v3/                           # v3 旧版本归档
│   ├── src/                      # v3 源代码
│   ├── ARCHITECTURE_v3.md        # v3 架构文档
│   ├── ARCHITECTURE_v5_DESIGN.md # v5 设计文档（历史）
│   └── ARCHITECTURE_v5_SUMMARY.md # v5 总结文档（历史）
│
├── docs/                         # v5 详细文档
│   ├── STREAMING_IMPLEMENTATION.md      # 流式交互实现
│   ├── MESSAGE_QUEUE_IMPLEMENTATION.md  # 消息队列实现
│   └── AUTO_CODE_EXECUTION.md           # 自动代码执行
│
├── dist/                         # 构建产物
│   └── agent.user.js
│
├── build.js                      # 构建脚本
├── README.md                     # 项目说明
└── .gitignore
```

---

## 核心模块

### 1. WebAgentClient (业务编排层)

**文件**: `src/business/WebAgentClient.js`

**职责**:
- 消息队列管理（最大 10 条）
- 代码执行队列管理（最大 20 条）
- 自动检测和提取代码
- 会话持久化
- 错误处理策略

**核心方法**:
```javascript
{
    init(options),                    // 初始化
    handleUserMessage(message, opts), // 处理用户消息
    handleCodeExecution(code, opts),  // 执行代码
    extractAndExecuteCode(text),      // 自动提取并执行代码
    handleClearChat(),                // 清空对话
    handleCancelRequest(),            // 取消请求
    updateSettings(settings),         // 更新设置
    getState(),                       // 获取状态
    getQueueStatus()                  // 获取队列状态
}
```

### 2. AIAgent (基础设施层)

**文件**: `src/infrastructure/AIAgent/index.js`

**职责**:
- 组合多个底层服务
- 智能模型选择
- Token 估算和管理
- 消息上下文构建
- 对话历史管理

**核心方法**:
```javascript
{
    init(config),                     // 初始化
    sendMessage(message, opts),       // 发送消息
    executeCode(code, opts),          // 执行代码
    selectOptimalModel(messages),     // 智能选择模型
    estimateMessagesTokens(messages), // 估算 token
    smartTruncateHistory(history),    // 智能截断历史
    clearHistory(),                   // 清空历史
    getState()                        // 获取状态
}
```

### 3. EventManager (事件总线)

**文件**: `src/core/EventManager.js`

**职责**:
- 统一事件管理
- 防止重复注册
- 监听器 ID 管理

**核心事件**:
```javascript
const EventTypes = {
    // 消息流式处理
    MESSAGE_STREAMING: 'agent:message:streaming',
    MESSAGE_COMPLETE: 'agent:message:complete',
    MESSAGE_ERROR: 'agent:message:error',
    
    // 代码执行
    CODE_BLOCKS_DETECTED: 'agent:code:blocks:detected',
    CODE_EXECUTED: 'agent:code:executed',
    CODE_EXECUTION_ERROR: 'agent:code:execution:error',
    
    // 会话管理
    CHAT_CLEARED: 'agent:chat:cleared',
    REQUEST_CANCELLED: 'agent:request:cancelled',
    
    // 配置
    SETTINGS_UPDATED: 'agent:settings:updated'
};
```

### 4. StorageManager (统一状态管理)

**文件**: `src/services/storage/StorageManager.js`

**职责**:
- 统一管理所有状态
- 持久化到 GM_setValue
- 订阅/发布模式

**核心方法**:
```javascript
{
    init(),                         // 初始化
    getState(key),                  // 获取状态
    setState(key, value),           // 设置状态
    batchUpdate(updates),           // 批量更新
    subscribe(key, callback),       // 订阅变化
    unsubscribe(id)                 // 取消订阅
}
```

---

## 数据流设计

### 场景 1: 用户发送消息（带自动执行）

```
用户输入 "帮我点击登录按钮"
  ↓
[UI Layer] useAgent.sendMessage()
  ↓
[Business Layer] WebAgentClient.handleUserMessage()
  ├─ 检查是否正在处理 → 是则加入消息队列
  ├─ 验证消息
  └─ 调用 AIAgent.sendMessage()
  ↓
[Infrastructure Layer] AIAgent.sendMessage()
  ├─ 构建消息上下文
  ├─ 智能模型选择
  └─ 调用 APIRouter.sendRequest(onChunk)
  ↓
[Service Layer] APIRouter → OpenRouterClient
  ├─ 发起 HTTP 请求
  ├─ 接收流式响应
  └─ 逐块调用 onChunk(content)
  ↓
[Business Layer] WebAgentClient.onChunk(chunk)
  └─ 触发事件: MESSAGE_STREAMING { chunk }
  ↓
[UI Layer] useAgent 监听到事件
  └─ 更新 React 状态 → 显示流式内容
  ↓
[Infrastructure Layer] AIAgent 返回完整结果
  ↓
[Business Layer] WebAgentClient
  ├─ 检测代码块
  ├─ 如果 autoExecuteCode=true
  │   └─ extractAndExecuteCode()
  │       ├─ 提取 JavaScript 代码
  │       └─ handleCodeExecution() → 加入执行队列
  ├─ 触发 MESSAGE_COMPLETE 事件
  └─ 自动保存会话
  ↓
[Business Layer] processNextExecution()
  └─ 执行代码: document.querySelector('.login-btn').click()
  ↓
[UI Layer] 显示执行结果
```

### 场景 2: 快速连续发送多条消息

```
用户快速发送 3 条消息
  ↓
消息 1: 立即处理
  ↓
消息 2: 加入消息队列 (position: 1)
  ↓
消息 3: 加入消息队列 (position: 2)
  ↓
消息 1 处理完成
  ↓
processNextMessage()
  ↓
消息 2: 从队列取出 → 处理
  ↓
消息 2 处理完成
  ↓
processNextMessage()
  ↓
消息 3: 从队列取出 → 处理
  ↓
所有消息处理完成
```

---

## 关键特性

### 1. 双队列系统

| 队列类型 | 最大长度 | 用途 |
|---------|---------|------|
| 消息队列 | 10 条 | 用户发送的文字消息 |
| 执行队列 | 20 条 | AI 生成的 JavaScript 代码 |

**优势**:
- ✅ 用户可以连续发送消息，无需等待
- ✅ 代码按顺序执行，不会并发冲突
- ✅ 防止内存溢出和过度排队

### 2. 自动代码执行

**工作流程**:
1. AI 回复中包含 ```javascript 代码块
2. 系统自动检测并提取
3. 加入执行队列
4. 按顺序执行
5. 反馈结果

**安全机制**:
- ✅ 严格模式（禁止危险操作）
- ✅ CodeExecutor 安全检查
- ✅ 可以随时禁用（`autoExecuteCode: false`）

### 3. 智能模型路由

**功能**:
- 根据 token 数量自动选择模型
- 优先使用成功率高的模型
- 失败时自动切换

**配置**:
```javascript
AIAgent.init({
    enableModelRouter: true,  // 启用智能路由
    maxContextTokens: 8000    // 最大上下文 token
});
```

### 4. 流式交互

**数据流**:
```
API 返回 chunk → onChunk(chunk) → EventManager.emit('MESSAGE_STREAMING')
  ↓
useAgent 监听事件 → setMessages(prev => prev.map(msg => msg.content + chunk))
  ↓
React 重新渲染 → 显示最新内容
```

**关键实现**:
- ✅ `BaseAPIClient.sendStreamingRequest()` - SSE 流式接收
- ✅ `EventManager` - 事件总线传递 chunk
- ✅ `useAgent` - React Hook 监听并追加内容（非覆盖）
- ✅ 低延迟（~200ms 首字）

**注意事项**:
- 必须使用函数式更新 `setMessages(prev => ...)` 避免闭包陷阱
- 事件监听器必须在 useEffect 中直接更新状态，不能调用外部函数

### 5. 会话持久化

**存储结构**:
```javascript
// StorageManager 状态树
{
    session: {
        current: { id, startTime, messageCount },
        messages: [{ role, content, timestamp }, ...]
    }
}
```

**工作流程**:
1. 消息发送完成 → `debouncedSaveSession()` (300ms 防抖)
2. `WebAgentClient.saveSession()` → 从 AIAgent 获取历史
3. `StorageManager.setState('session.*', data)` → 持久化到 GM_setValue
4. 页面加载 → `restoreSession()` → 恢复会话

**存储键**:
- `unified_state_session` - 会话数据
- `unified_state_ui` - UI 状态（位置、大小）
- `unified_state_config` - 配置信息

**窗口可见性策略**:
- 打开窗口 → 保存 `ui.window.visible = true`
- 关闭窗口 → 删除 `ui.window.visible` 键（而非保存 false）
- 加载时 → 存在即显示，不存在即隐藏

---

## 开发指南

### 添加新功能

#### 1. 确定功能所属层级

- **UI 相关** → `src/app/ui/`
- **业务流程** → `src/business/WebAgentClient.js`
- **AI 能力** → `src/infrastructure/AIAgent/`
- **具体服务** → `src/services/`
- **工具函数** → `src/core/`

#### 2. 遵循分层原则

```javascript
// ✅ 正确：UI 通过事件与 Client 通信
EventManager.emit('USER_MESSAGE_SENT', message);

// ❌ 错误：UI 直接调用 AIAgent
AIAgent.sendMessage(message);
```

#### 3. 使用事件驱动

```javascript
// 触发事件
EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, {
    result,
    sessionId
});

// 监听事件
EventManager.on(EventManager.EventTypes.MESSAGE_COMPLETE, (data) => {
    console.log('消息完成:', data.result);
});
```

### 调试技巧

#### 1. 查看日志

打开浏览器控制台，搜索：
- `[WebAgentClient]` - 业务层日志
- `[AIAgent]` - 基础设施层日志
- `[useAgent]` - UI Hook 日志

#### 2. 使用全局接口

```javascript
// 在控制台执行
WebAgentClient.getState();
WebAgentClient.getQueueStatus();
AIAgent.getState();
```

#### 3. 检查事件流

```javascript
// 监听所有事件
window.addEventListener('agent:*', (e) => {
    console.log('Event:', e.type, e.detail);
});
```

### 构建和测试

```bash
# 构建
node build.js

# 输出
dist/agent.user.js

# 安装到 Tampermonkey
1. 打开 Tampermonkey 管理面板
2. 删除旧版本
3. 打开 file:///d:/dev/webagentcli/dist/agent.user.js
4. 点击"安装"
```

---

## 附录

### 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v5.0.0 | 2026-04-19 | 完整重构，双队列系统，自动执行 |
| v4.x | 2026-04 | 渐进式重构，引入 React |
| v3.x | 2026-03 | 初始版本，单体架构 |

### 相关文档

- [流式交互实现](./docs/STREAMING_IMPLEMENTATION.md)
- [消息队列实现](./docs/MESSAGE_QUEUE_IMPLEMENTATION.md)
- [自动代码执行](./docs/AUTO_CODE_EXECUTION.md)

### 许可证

MIT License

---

**文档维护者**: AI Assistant  
**最后更新**: 2026-04-19  
**下一个大版本**: v6.0 (计划中)
