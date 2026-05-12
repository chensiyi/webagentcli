# OpenAI Tool Calling 标准实现

## 标准流程

### 1. 用户发送消息
```
messages: [
  { role: 'user', content: '美国新闻' }
]
```

### 2. 模型返回 assistant 消息（包含 tool_calls）
```
messages: [
  { role: 'user', content: '美国新闻' },
  { 
    role: 'assistant', 
    content: '',
    tool_calls: [
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query":"美国新闻"}'
        }
      }
    ]
  }
]
```

**前端渲染**：
- 创建 assistant 气泡
- 显示 tool_calls 卡片
- 不显示 content（因为为空）

### 3. 前端执行工具，创建 tool 消息
```
messages: [
  { role: 'user', content: '美国新闻' },
  { role: 'assistant', content: '', tool_calls: [...] },
  {
    role: 'tool',
    tool_call_id: 'call_123',
    name: 'web_search',
    content: '搜索结果...'
  }
]
```

**前端渲染**：
- 创建 tool 气泡
- 显示工具执行结果（折叠显示）

### 4. 发送第二轮对话
```
messages: [
  { role: 'user', content: '美国新闻' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'tool', tool_call_id: 'call_123', name: 'web_search', content: '搜索结果...' },
  { role: 'assistant', content: '' }  // 新的占位消息
]
```

**前端渲染**：
- **先全量渲染一次**：显示 assistant 的 tool_calls 卡片 + tool 消息
- 然后创建新的 assistant 占位消息
- 发送第二轮请求

### 5. 模型返回最终的 assistant 消息
```
messages: [
  { role: 'user', content: '美国新闻' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'tool', tool_call_id: 'call_123', name: 'web_search', content: '搜索结果...' },
  { 
    role: 'assistant', 
    content: '以下是美国新闻的搜索结果...'
  }
]
```

**前端渲染**：
- 创建第二个 assistant 气泡
- 显示 content 内容
- 第一个 assistant 气泡保持显示 tool_calls 卡片

## 渲染时序

```
1. 用户发送消息
   ↓
2. 创建 assistant 占位消息
   ↓
3. 流式响应开始
   ↓
4. 收到 tool_calls → 渲染 tool_calls 卡片
   ↓
5. 流式响应完成（content 为空）
   ↓
6. 【关键】执行工具
   ↓
7. 【关键】每个工具执行后 → 创建 tool 消息 → 全量渲染
   ↓
8. 【关键】工具全部执行完 → 全量渲染一次（显示 tool_calls + tool）
   ↓
9. 创建新的 assistant 占位消息
   ↓
10. 发送第二轮对话
   ↓
11. 第二轮流式响应 → 更新新的 assistant 气泡
   ↓
12. 第二轮完成 → 最终渲染
```

## 关键规则

### 消息格式
- **assistant 消息**：可以包含 `tool_calls` 字段
- **tool 消息**：必须包含 `tool_call_id` 和 `name` 字段
- **tool_calls 和 content 可以共存**：assistant 消息可以同时有 tool_calls 和 content

### 渲染规则
- **tool_calls 卡片**：显示在 assistant 气泡中，在 content 之前
- **tool 消息**：独立的气泡，显示工具执行结果
- **全量渲染**：工具执行完成后必须触发，确保 tool_calls 卡片正确显示

### 删除规则
- 删除 assistant 消息（有 tool_calls）→ 同时删除所有对应的 tool 消息
- 删除 tool 消息 → 向上查找对应的 assistant，删除整个工具调用组

## 文件结构

```
modules/tools/
├── ToolCallManager.js          # 工具调用管理器（执行、状态管理）
├── ToolCallRenderer.js         # 工具调用渲染器（卡片渲染）
── StreamMessageProcessor.js   # 流式消息处理器（标准消息处理）
── README.md                   # 本文档
```
