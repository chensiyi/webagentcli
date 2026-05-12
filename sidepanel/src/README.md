# src/ - 新架构目录

## 目录结构

```
src/
├── core/                    # 核心业务层（协议无关）
│   ├── models/             # 业务模型
│   │   ├── Message.js      # 消息模型
│   │   ├── Session.js      # 会话模型
│   │   └── ToolCall.js     # 工具调用模型
│   ├── events/             # 事件系统
│   │   └── EventBus.js     # 事件总线
│   └── stores/             # 数据管理（待实现）
│       ├── SessionManager.js
│       ├── MessageStore.js
│       └── ToolRegistry.js
│
├── adapters/               # 协议适配层
│   ├── ProtocolAdapter.js  # 适配器接口定义
│   ├── openai/             # OpenAI 适配器（待迁移）
│   ├── lm-studio/          # LM Studio 适配器（待迁移）
│   └── ollama/             # Ollama 适配器（待迁移）
│
├── controllers/            # 控制器层（待实现）
│   ├── ChatController.js   # 聊天控制器
│   ├── ToolController.js   # 工具控制器
│   └── StreamController.js # 流式响应控制器
│
├── queue/                  # 并发控制（待实现）
│   ├── MessageQueue.js     # 消息队列
│   └── StreamProcessor.js  # 流处理器
│
└── ui/                     # 视图层（待实现）
    ├── components/         # React 组件
    └── hooks/              # React Hooks
```

## 设计原则

1. **业务逻辑零感知协议**：`core/` 中的代码不包含任何 `/v1`、`/api/v1` 等路径信息
2. **适配器纯粹性**：`adapters/` 只做格式转换，不调用 fetch、不管理状态
3. **事件驱动解耦**：模块间通过 EventBus 通信，不直接引用
4. **并发可控**：所有异步操作通过 MessageQueue 管理

## 当前进度

- ✅ 核心业务模型定义（Message, Session, ToolCall）
- ✅ 事件总线实现（EventBus）
- ✅ 协议适配器接口定义（ProtocolAdapter）
- ⏳ Model 层管理器（SessionManager, MessageStore）
- ⏳ 适配器实现迁移
- ⏳ 控制器层实现
- ⏳ 并发控制实现
- ⏳ 视图层实现

## 使用说明

### 加载新架构

在 HTML 中按顺序引入：

```html
<!-- 核心模型 -->
<script src="src/core/models/Message.js"></script>
<script src="src/core/models/Session.js"></script>
<script src="src/core/models/ToolCall.js"></script>

<!-- 事件系统 -->
<script src="src/core/events/EventBus.js"></script>

<!-- 适配器接口 -->
<script src="src/adapters/ProtocolAdapter.js"></script>

<!-- 具体适配器 -->
<script src="src/adapters/openai/OpenAIAdapter.js"></script>
<script src="src/adapters/lm-studio/LMStudioAdapter.js"></script>

<!-- 管理器 -->
<script src="src/core/stores/SessionManager.js"></script>

<!-- 控制器 -->
<script src="src/controllers/ChatController.js"></script>
```

### 使用示例

```javascript
// 创建消息（业务模型）
const message = new Message({
  role: 'user',
  content: '你好'
});

// 订阅事件
const listenerId = eventBus.on('MESSAGE_SENT', (data) => {
  console.log('消息已发送:', data);
});

// 发布事件
eventBus.emit('MESSAGE_SENT', { messageId: message.id });

// 卸载监听
eventBus.off(listenerId);
```

## 迁移计划

1. 逐步将现有代码迁移到新架构
2. 保持旧代码可用，直到新架构完全实现
3. 完成后整体替换 `sidepanel/` 目录
