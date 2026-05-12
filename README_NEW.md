# src/ - React 风格重构后的新架构

## 目录结构

```
src/
├── core/                    # 核心业务层（协议无关）
│   ├── models/             # 业务模型
│   │   ├── Model.js        # AI 模型能力描述
│   │   ├── MediaContent.js # 多媒体内容
│   │   ├── ToolIntention.js# 工具调用意图
│   │   ├── Message.js      # 消息模型（含节流渲染）
│   │   ├── Session.js      # 会话模型
│   │   └── index.js        # 模型导出
│   ├── events/             # 事件系统
│   │   └── EventBus.js     # 事件总线
│   └── stores/             # 数据管理
│       ├── SessionManager.js
│       └── ToolRegistry.js
│
├── adapters/               # 协议适配层
│   ├── ProtocolAdapter.js  # 适配器接口定义
│   └── lm-studio/          # LM Studio 适配器
│
├── controllers/            # 控制器层（React 风格）
│   ├── ChatController.js   # 聊天控制器
│   └── ToolController.js   # 工具控制器（待实现）
│
├── services/               # 服务层
│   └── AdapterService.js   # 适配器服务
│
└── ui/                     # 视图层（React 风格）
    ├── components/         # UI 组件
    │   └── ChatMessageList.js
    ├── hooks/              # 自定义 Hooks
    │   └── useChat.js
    └── pages/              # 页面组件（待实现）
```

## 设计原则

### 1. React 风格的状态管理

**Controller 层**类似 React 的 `useState` + `useReducer`：

```javascript
// 状态管理
const state = {
  messages: [],
  isLoading: false,
  isThinking: false,
  error: null
};

// 状态更新触发 UI 重新渲染
setState({ isLoading: true });
```

**Hook 层**提供类似 React Hooks 的 API：

```javascript
const chat = useChat();

// 访问状态
console.log(chat.messages);
console.log(chat.isLoading);

// 调用方法
await chat.sendMessage('你好');
chat.stopGeneration();
```

### 2. 组件化 UI

UI 组件是纯函数，接收状态并渲染：

```javascript
function ChatMessageList({ messages, isLoading, isThinking }) {
  // 渲染逻辑
}
```

### 3. 服务层抽象

AdapterService 统一管理适配器：

```javascript
const adapterService = new AdapterService();
adapterService.registerAdapter('lm-studio', new LMStudioAdapter());
adapterService.selectAdapter('lm-studio', config);

// 统一的 API 调用
await adapterService.chatStream(params, onChunk, onComplete, onError);
```

## 使用示例

### 初始化

```javascript
// 1. 创建管理器
const sessionManager = new SessionManager();
const toolManager = new ToolManager();
const adapterService = new AdapterService();

// 2. 注册并选择适配器
adapterService.registerAdapter('lm-studio', new LMStudioAdapter());
adapterService.selectAdapter('lm-studio', {
  endpoint: 'http://localhost:1234',
  defaultModel: 'local-model'
});

// 3. 初始化 ChatController
await initChatController({
  sessionManager,
  toolManager,
  adapter: adapterService.getCurrentAdapter()
});
```

### 在 UI 中使用

```javascript
// 获取 Hook
const chat = useChat();

// 渲染消息列表
ChatMessageList({
  messages: chat.messages,
  isLoading: chat.isLoading,
  isThinking: chat.isThinking
});

// 发送消息
document.getElementById('send-btn').addEventListener('click', async () => {
  const text = document.getElementById('input').value;
  await chat.sendMessage(text);
});

// 停止生成
document.getElementById('stop-btn').addEventListener('click', () => {
  chat.stopGeneration();
});
```

### 状态变更回调

```javascript
// 当状态变更时自动更新 UI
window.renderChatUI = (state) => {
  ChatMessageList({
    messages: state.messages,
    isLoading: state.isLoading,
    isThinking: state.isThinking
  });
};
```

## 与旧架构的对比

| 特性 | 旧架构 | 新架构（React 风格） |
|------|--------|---------------------|
| 状态管理 | 分散在各处 | 集中在 Controller |
| UI 更新 | 手动调用 render | 状态变更自动触发 |
| 代码组织 | 按功能分文件 | 按层次分目录 |
| 可测试性 | 低（耦合严重） | 高（分层清晰） |
| 可维护性 | 中 | 高 |

## 下一步工作

- [ ] 实现 ToolController
- [ ] 实现更多 UI 组件（InputBox、ModelSelector 等）
- [ ] 实现页面组件（ChatPage、SettingsPage 等）
- [ ] 添加错误边界处理
- [ ] 添加加载状态管理
- [ ] 编写单元测试

## 迁移指南

从旧架构迁移到新架构的步骤：

1. 保留 `core/models` 和 `adapters`（已兼容）
2. 逐步替换 `pages/chat/` 中的代码为新的 Controller + Hook + Component
3. 测试每个功能模块
4. 删除旧代码

## 相关文件

- [CORE_MODELS.md](../../docs/CORE_MODELS.md) - 核心模型层设计
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - 整体架构文档
