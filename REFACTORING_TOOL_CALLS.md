# 工具调用架构重构说明

## 📋 重构概述

按照 OpenAI/Anthropic 业界最佳实践，将工具调用从自定义格式迁移到标准的 `tool` 角色消息格式。

## 🎯 核心改进

### 1. **标准化的消息格式**

#### 之前（自定义格式）
```javascript
// Assistant 消息中嵌入 tool_results
{
  role: 'assistant',
  content: '清理后的文本',
  tool_results: [  // ❌ 非标准字段
    { tool_call: {...}, tool_result: {...} }
  ]
}
```

#### 现在（OpenAI 标准格式）
```javascript
// 独立的消息序列
[
  {
    role: 'assistant',
    content: '',
    tool_calls: [  // ✅ 标准字段
      { id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{}' } }
    ]
  },
  {
    role: 'tool',  // ✅ 独立的 tool 角色
    tool_call_id: 'call_1',
    name: 'web_search',
    content: '{ "results": [...] }'
  },
  {
    role: 'assistant',
    content: '根据搜索结果...'
  }
]
```

### 2. **级联删除机制**

在 `SessionManager` 中新增 `deleteMessageWithTools()` 方法：

```javascript
// 删除 assistant 消息时，自动删除关联的 tool 消息
sessionManager.deleteMessageWithTools(sessionId, messageIndex);
```

**逻辑**：
- 如果删除的是 `assistant` 消息且有 `tool_calls`
- 查找后续所有 `role === 'tool'` 且 `tool_call_id` 匹配的消息
- 一并删除

### 3. **简化的递归流程**

#### 之前的问题
- 使用复杂的嵌套函数 `executeToolsAndGetSummary`
- 深度可达 10 层，状态管理混乱
- 工具结果临时存储在 `tool_results` 字段

#### 现在的方案
```javascript
// 统一的递归函数
async function triggerNextTurn(session, targetSession, depth) {
  // 1. 检查停止条件
  // 2. 准备消息（包含 tool 角色）
  // 3. 发送 API 请求
  // 4. 监听响应
  // 5. 如果新消息有工具调用，递归调用自身
}
```

**优势**：
- ✅ 代码结构清晰
- ✅ 易于调试
- ✅ 符合 OpenAI 官方推荐模式

## 📝 修改的文件

### 1. `sidepanel/modules/agent/SessionManager.js`

**新增方法**：
```javascript
deleteMessageWithTools(sessionId, messageIndex)
```

**功能**：
- 删除指定消息及其关联的 tool 消息
- 通过 `tool_call_id` 精确匹配
- 从后往前删除避免索引偏移

### 2. `sidepanel/pages/chat/chat.js`

#### A. 工具执行流程重构（第 1250-1360 行）

**改动点**：
1. 解析工具调用后立即创建标准的 `tool_calls` 字段
2. 依次执行每个工具
3. 每次执行完成后创建独立的 `tool` 消息并保存
4. 清理 `content` 中的工具代码块
5. 调用 `triggerNextTurn()` 触发下一轮对话

**示例代码**：
```javascript
// 创建标准的 tool 消息
const toolMessage = {
  role: 'tool',
  tool_call_id: call.id,
  name: toolType,
  content: result.output || JSON.stringify(result)
};

sessionManager.addMessage(session.id, toolMessage);
await sessionManager.saveConversations();
```

#### B. 新增 `triggerNextTurn()` 函数（文件末尾）

**职责**：
- 准备消息历史（包含所有 tool 消息）
- 发送到 API
- 监听流式响应
- 检测新的工具调用并递归

**关键特性**：
- 最大递归深度 10 层
- 支持用户中断（`isStopRequested`）
- 完整的错误处理

#### C. 渲染逻辑简化（第 283-320 行）

**之前**：
- 从 `msg.tool_results` 读取工具结果
- 复杂的正则表达式解析 content 中的工具代码块

**现在**：
```javascript
// 查找对应的 tool 消息
const toolResults = [];
for (let i = index + 1; i < messages.length; i++) {
  if (messages[i].role === 'tool') {
    const toolMsg = messages[i];
    const matchingCall = msg.tool_calls.find(tc => tc.id === toolMsg.tool_call_id);
    if (matchingCall) {
      toolResults.push({
        tool_call: matchingCall,
        tool_result: { success: true, output: toolMsg.content }
      });
    }
  } else {
    break;
  }
}

// 渲染工具卡片
msg.tool_calls.forEach((call, idx) => {
  const result = toolResults[idx];
  const card = window.ChatRender.renderToolCallCard(call, idx, result, session.isLoading);
  bubble.appendChild(card);
});
```

#### D. 删除逻辑更新（第 238-256 行）

**之前**：
```javascript
// 手动查找连续的 tool 消息
if (msgToDelete.role === 'assistant') {
  let deleteCount = 1;
  for (let i = index + 1; i < session.messages.length; i++) {
    if (session.messages[i].role === 'tool') {
      deleteCount++;
    } else {
      break;
    }
  }
  session.messages.splice(index, deleteCount);
}
```

**现在**：
```javascript
// 使用 SessionManager 的级联删除
const deleted = sessionManager.deleteMessageWithTools(session.id, index);
if (deleted) {
  await sessionManager.saveConversations();
  render();
}
```

## 🔄 数据流转对比

### 之前的流程
```
用户发送 
  → AI 回复（content 包含工具代码块）
  → 前端解析 code blocks
  → 执行工具
  → 临时存储到 tool_results
  → 清理 content
  → 重新渲染
  → 构造 API 请求（动态生成 tool 消息）
  → 发送下一轮
```

### 现在的流程
```
用户发送
  → AI 回复（content 包含工具代码块）
  → 前端解析并创建 tool_calls 字段
  → 执行工具
  → 创建独立的 tool 消息并持久化
  → 清理 content
  → 重新渲染
  → 发送完整消息历史（包含 tool 消息）
  → AI 继续回复
```

**关键区别**：
- ✅ tool 消息现在是**持久化**的，不是动态生成的
- ✅ 消息历史更清晰，易于调试
- ✅ 符合 OpenAI/Anthropic 标准

## 🧪 测试要点

### 1. 基本工具调用
- [ ] 发送需要工具的查询
- [ ] 验证 tool_calls 字段正确创建
- [ ] 验证 tool 消息正确添加到历史
- [ ] 验证工具卡片正确渲染

### 2. 多轮工具调用
- [ ] 第一次工具执行后，AI 继续调用新工具
- [ ] 验证递归深度限制生效
- [ ] 验证消息顺序正确

### 3. 删除消息
- [ ] 删除 assistant 消息
- [ ] 验证关联的 tool 消息也被删除
- [ ] 验证 UI 正确更新

### 4. 用户中断
- [ ] 在工具执行过程中点击"停止"
- [ ] 验证当前工具执行完成但不再继续
- [ ] 验证空消息被清理

### 5. 错误处理
- [ ] 模拟工具执行失败
- [ ] 验证错误信息作为 tool 消息保存
- [ ] 验证 UI 显示错误状态

## 📊 性能影响

### 正面影响
- ✅ 减少了动态生成 tool 消息的计算开销
- ✅ 消息历史更紧凑（不重复存储）
- ✅ 渲染逻辑更简单（不需要解析 code blocks）

### 潜在影响
- ⚠️ 消息数量增加（每条工具调用产生 2 条消息）
- ⚠️ 存储空间略微增加

**优化建议**：
- 启用 `autoContextTruncation` 自动截断长历史
- 定期清理旧会话

## 🚀 后续优化方向

1. **工具执行进度实时显示**
   - 在执行中显示 loading 动画
   - 显示已完成的工具数量

2. **支持并行工具执行**
   - 对于无依赖的工具调用并行执行
   - 减少总等待时间

3. **工具调用缓存**
   - 相同参数的工具调用返回缓存结果
   - 减少 API 调用次数

4. **可视化调试工具**
   - 显示完整的消息流转图
   - 标注 tool_call_id 关联关系

## 📚 参考资料

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
