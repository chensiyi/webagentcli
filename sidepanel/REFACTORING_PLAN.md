# 架构重构计划 - 业务逻辑抽象与分层设计

## 核心问题诊断

### 当前架构缺陷
1. **协议细节泄露到业务层**：`/chat/completions` vs `/api/v1/chat` 等路径硬编码在多处
2. **适配器职责不清**：既负责协议转换，又参与业务流程控制
3. **缺少统一的事件总线**：模块间耦合严重，难以扩展
4. **并发控制缺失**：消息发送、流式响应没有任务队列管理

---

## 阶段1：业务逻辑抽象（剥离 API 标准）

### 1.1 纯业务模型定义（不依赖任何协议）

#### Message（消息）
```javascript
{
  id: string,              // 唯一标识
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string | Array<{type: 'text'|'image', ...}>,
  tool_calls?: Array<{     // 工具调用（业务概念，非协议字段）
    id: string,
    name: string,
    arguments: Object
  }>,
  tool_call_id?: string,   // 工具结果关联ID
  metadata?: {             // 元数据（思考过程、时间戳等）
    reasoning?: string,
    timestamp: number
  }
}
```

#### Session（会话）
```javascript
{
  id: string,
  title: string,
  messages: Array<Message>,
  created_at: number,
  updated_at: number,
  metadata?: Object
}
```

#### ToolCall（工具调用请求）
```javascript
{
  id: string,
  name: string,
  arguments: Object,
  status: 'pending' | 'executing' | 'completed' | 'failed',
  result?: any,
  error?: string
}
```

#### StreamEvent（流式事件 - 业务层抽象）
```javascript
{
  type: 'chunk' | 'reasoning' | 'tool_call' | 'complete' | 'error',
  data: any,
  timestamp: number
}
```

### 1.2 协议适配层接口定义

#### ProtocolAdapter（协议适配器接口）
```typescript
interface ProtocolAdapter {
  // 配置
  configure(config: AdapterConfig): void;
  
  // URL 构建（协议相关）
  buildUrl(path: string): string;
  getChatEndpoint(): string;
  getModelsEndpoint(): string;
  
  // 请求体转换（业务模型 → 协议格式）
  buildRequestBody(params: ChatParams): Object;
  buildHeaders(): Object;
  
  // 响应解析（协议格式 → 业务模型）
  parseResponse(data: any): ChatResponse;
  parseStreamChunk(data: any): StreamEvent | null;
  
  // 模型管理
  fetchModels(endpoint: string, apiKey?: string): Promise<Array<Model>>;
}
```

---

## 阶段2：MVC + 事件驱动架构

### 2.1 Model 层（纯数据管理）

#### SessionManager
- 职责：会话 CRUD、持久化
- 接口：`createSession()`, `loadSession()`, `saveSession()`, `deleteSession()`
- **无 UI 依赖，无协议依赖**

#### MessageStore
- 职责：消息增删改查、索引管理
- 接口：`addMessage()`, `updateMessage()`, `getMessages()`, `clearMessages()`
- **支持乐观更新、撤销/重做**

#### ToolRegistry
- 职责：工具注册、启用/禁用、参数验证
- 接口：`registerTool()`, `enableTool()`, `getEnabledTools()`, `validateArgs()`

### 2.2 View 层（React 组件）

#### ChatRenderer
- 职责：渲染会话列表、消息流
- 输入：`sessions`, `currentSession`
- 输出：DOM
- **无业务逻辑，只负责展示**

#### MessageComponent
- 职责：单条消息渲染（文本、代码块、工具卡片）
- 输入：`message`, `isStreaming`
- 输出：DOM

#### ToolCard
- 职责：工具调用可视化
- 输入：`toolCall`, `status`
- 输出：DOM

### 2.3 Controller 层（事件驱动）

#### EventBus（事件总线）
```javascript
class EventBus {
  on(event: string, handler: Function): string;  // 返回 listenerId
  off(listenerId: string): void;
  emit(event: string, data: any): void;
}
```

#### ChatController
- 监听：`USER_SEND_MESSAGE`, `TOOL_EXECUTION_COMPLETE`
- 发布：`MESSAGE_SENT`, `STREAM_STARTED`, `STREAM_COMPLETED`
- 职责：编排消息发送流程、管理流式状态

#### ToolController
- 监听：`TOOL_CALL_REQUESTED`
- 发布：`TOOL_EXECUTING`, `TOOL_COMPLETED`, `TOOL_FAILED`
- 职责：执行工具、处理结果、触发下一轮对话

### 2.4 Adapter 层（协议转换）

#### OpenAIAdapter
- 实现 `ProtocolAdapter` 接口
- 转换：业务 Message → OpenAI messages 数组
- 转换：OpenAI SSE → StreamEvent

#### LMStudioAdapter
- 实现 `ProtocolAdapter` 接口
- 转换：业务 Message → LM Studio input 字段
- 转换：LM Studio SSE → StreamEvent

---

## 阶段3：高并发控制流

### 3.1 MessageQueue（异步任务队列）
```javascript
class MessageQueue {
  enqueue(task: SendMessageTask): Promise<void>;
  cancel(taskId: string): void;
  getStatus(taskId: string): TaskStatus;
}
```

特性：
- 支持并发控制（最大同时发送数）
- 支持取消正在进行的请求
- 支持重试机制（指数退避）
- 任务优先级（用户消息 > 工具自动触发）

### 3.2 StreamProcessor（统一流处理）
```javascript
class StreamProcessor {
  process(stream: ReadableStream, adapter: ProtocolAdapter): AsyncIterator<StreamEvent>;
}
```

特性：
- 屏蔽 SSE / WebSocket / HTTP Chunked 差异
- 统一错误处理
- 支持背压（backpressure）控制

---

## 阶段4：模块化目录结构

```
sidepanel/
├── modules/
│   ├── core/                    # 核心业务模型
│   │   ├── models/
│   │   │   ├── Message.js
│   │   │   ├── Session.js
│   │   │   └── ToolCall.js
│   │   ├── stores/
│   │   │   ├── SessionManager.js
│   │   │   ├── MessageStore.js
│   │   │   └── ToolRegistry.js
│   │   └── events/
│   │       └── EventBus.js
│   │
│   ├── controllers/             # 控制器层
│   │   ├── ChatController.js
│   │   ├── ToolController.js
│   │   └── StreamController.js
│   │
│   ├── adapters/                # 协议适配层
│   │   ├── ProtocolAdapter.js   # 接口定义
│   │   ├── openai/
│   │   │   └── OpenAIAdapter.js
│   │   ├── lm-studio/
│   │   │   └── LMStudioAdapter.js
│   │   └── ollama/
│   │       └── OllamaAdapter.js
│   │
│   └── queue/                   # 并发控制
│       ├── MessageQueue.js
│       └── StreamProcessor.js
│
├── ui/                          # 视图层（React）
│   ├── components/
│   │   ├── ChatRenderer.jsx
│   │   ├── MessageComponent.jsx
│   │   └── ToolCard.jsx
│   └── hooks/
│       ├── useChat.js
│       └── useStream.js
│
└── background/                  # Service Worker
    ├── stream-core.js           # 流式请求处理（通用）
    └── message-transformer.js   # 消息转换（已废弃，由 Adapter 替代）
```

---

## 实施步骤

### Step 1: 定义核心业务模型（1天）
- [ ] 创建 `modules/core/models/Message.js`
- [ ] 创建 `modules/core/models/Session.js`
- [ ] 创建 `modules/core/models/ToolCall.js`
- [ ] 编写单元测试验证模型独立性

### Step 2: 实现 EventBus（0.5天）
- [ ] 创建 `modules/core/events/EventBus.js`
- [ ] 实现订阅/发布机制
- [ ] 添加监听器 ID 管理（支持精确卸载）

### Step 3: 重构 SessionManager（1天）
- [ ] 剥离所有 UI 相关代码
- [ ] 使用 EventBus 通知状态变化
- [ ] 实现持久化接口（Chrome Storage）

### Step 4: 定义 ProtocolAdapter 接口（0.5天）
- [ ] 创建 `modules/adapters/ProtocolAdapter.js`（TypeScript 或 JSDoc）
- [ ] 明确所有方法的输入输出契约

### Step 5: 重构现有适配器（2天）
- [ ] 重构 `OpenAIAdapter` 实现新接口
- [ ] 重构 `LMStudioAdapter` 实现新接口
- [ ] 重构 `OllamaAdapter` 实现新接口
- [ ] 确保适配器只做协议转换，不参与业务流程

### Step 6: 实现 MessageQueue（1天）
- [ ] 创建 `modules/queue/MessageQueue.js`
- [ ] 实现任务调度、取消、重试
- [ ] 集成到 ChatController

### Step 7: 实现 StreamProcessor（1天）
- [ ] 创建 `modules/queue/StreamProcessor.js`
- [ ] 统一处理 SSE 流
- [ ] 使用 Adapter 解析 chunk

### Step 8: 重构 Controller 层（2天）
- [ ] 创建 `ChatController`，监听 EventBus
- [ ] 创建 `ToolController`，处理工具执行
- [ ] 移除所有硬编码的 API 路径

### Step 9: 迁移 View 层（1天）
- [ ] 将现有 DOM 操作封装为 React 组件
- [ ] 使用 hooks 订阅 EventBus
- [ ] 实现增量更新（避免全量重绘）

### Step 10: 清理旧代码（0.5天）
- [ ] 删除 `background/message-transformer.js`
- [ ] 删除重复的适配器实现
- [ ] 更新 HTML 引用

---

## 关键原则

1. **业务逻辑零感知协议**：Message、Session 不包含任何 `/v1`、`/api/v1` 等路径信息
2. **适配器纯粹性**：Adapter 只做格式转换，不调用 fetch、不管理状态
3. **事件驱动解耦**：模块间通过 EventBus 通信，不直接引用
4. **并发可控**：所有异步操作通过 MessageQueue 管理，支持取消和重试
5. **视图纯粹性**：React 组件只负责渲染，不执行业务逻辑

---

## 预期收益

1. **新增 API 标准只需添加适配器**：无需修改业务代码
2. **高并发安全**：MessageQueue 保证请求有序、可取消
3. **易于测试**：业务模型独立，可单元测试；适配器可 Mock
4. **代码清晰**：每层职责单一，符合 SRP 原则
5. **可扩展**：EventBus 支持任意模块订阅事件，无需修改发布者
