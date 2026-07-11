# 会话编排与事件处理（原 ChatProgram 拆解）

> 基于现有架构（Microkernel v0.6.7）的渐进式改进，不破坏现有代码结构

## 一、当前状态总结

### 消息发送管线（已实现）

```
用户输入
  │
  ▼ ChatPage.svelte → api.session.send()（RPC 统一入口）
  ▼ createSessionFacade.send() 直接调用 runConversation(kernel, data, { onEvent: emit })
  ▼ orchestration/session.ts runConversation()
      ├── Provider 检查
      ├── 会话管理（创建/获取/更新）
      ├── 用户消息写入 Session + 自动标题
      ├── ContextBuilder.buildMessages()（session-context.ts）
      │     ├── System Prompt（角色 + 页面环境 + 工具列表名称 + 行为原则）
      │     └── 历史消息截断（保护 tool_call/tool_result 配对）
      ├── MessagesRequest → API 流式请求
      ├── Stream 处理 → 分片写入 + UI 更新
      └── 收到 tool_calls → ToolExecutor.execute()（session-tools.ts）
              ├── 参数类型校验（ToolsManager._validateArgs）
              ├── 最多重试 3 次（ToolExecutor._invokeWithRetry）
              └── 工具结果写入 → 继续 runConversation(isToolContinuation)
```

### 新增特性

```
新增：
  - 工具执行超时控制（RunUserScriptTool 支持 timeout 参数）
  - 参数类型校验（ToolsManager 执行前按 inputSchema 校验）
  - 工具失败自动重试（ToolExecutor 最多 3 次，间隔 2s）
  - 删除进行中会话时自动取消（createSessionFacade.delete() 内联 cancelConversation，SessionManager.deleteSession 发射 SESSION_DELETED）
```

### 待改进项（按优先级）

| 优先级 | 项目 | 对应意见 | 状态 |
|-------|------|---------|------|
| P0 | 完善工具描述 | 点5 | ✅ 已完成 |
| P0 | System Prompt 工具部分简化 | 点4 | ✅ 已完成 |
| P0 | 工具执行超时 | 点6 | ✅ 已完成 |
| P0 | 参数类型校验 | 点7 | ✅ 已完成 |
| P0 | 工具重试机制 | 点9 | ✅ 已完成 |
| P1 | 会话删除时自动取消请求 | 需求补充 | ✅ 已完成 |
| P1 | System Prompt 自适应监控 | 点3 | ⏳ 待实现 |
| P2 | 记忆·感知·表达综合系统设计 | 点10 | ⏳ 待设计 |

---

## 二、已完成改动清单

### P0-1: 完善工具描述 ✅

#### RunUserScriptTool — `sidepanel/tools/RunUserScriptTool.js`

- description 从通用描述改为结构化说明，包含适用场景和注意事项
- code 参数描述优化，建议使用 IIFE 包裹代码
- 新增 `timeout` 参数（number，默认 300000ms）

#### ManageUserScriptsTool — `sidepanel/tools/ManageUserScriptsTool.js`

- description 从一行改为分点列出所有操作 + 注意事项

### P0-2: System Prompt 工具描述简化 ✅

**文件**：`kernel/orchestration/session-context.ts`

- 工具列表改为仅列出名称（`可用工具：run_user_script、manage_user_scripts`）
- 完整定义通过 API tools 参数传递
- 行为原则优化为 4 条清晰规则

### P0-3: 工具执行超时 ✅

**文件**：`sidepanel/tools/RunUserScriptTool.js`

- inputSchema 新增 `timeout` 参数
- handler 中 `Promise.race([executePromise, timeoutPromise])`
- 超时后 reject Error(`脚本执行超时（${effectiveTimeout}ms）`)

### P0-4: 参数类型校验 ✅

**文件**：`kernel/services/ToolsManager.ts`

- 新增 `_validateArgs(args, schema)` 私有方法
- 在 invoke() 中 handler 执行前校验
- 校验内容：
  - required 字段缺失
  - 参数类型匹配（string/number/boolean/array/object/integer）
  - enum 值有效性
- 校验失败直接返回 ToolResult(failed)

### P0-5: 工具重试机制 ✅

**文件**：`kernel/orchestration/session-tools.ts`

- 提取 `_invokeWithRetry()` 方法
- `_isRetryableError()` 识别可重试错误（超时/网络/5xx/429/rate_limit）
- 最多重试 3 次，间隔 2s
- 非可重试错误不重试直接返回

### 补充修复：会话删除自动取消 ✅

**事件链路**：

```
HistoryPage.svelte → api.session.delete({ sessionId })
    │ createSessionFacade.delete() 先 cancelConversation(kernel, emit, sessionId)
    ▼
SessionManager.deleteSession() → 发射 SESSION_DELETED { sessionId }
```

**改动文件**：
1. `kernel/services/SessionManager.ts` — deleteSession() 发射 `SESSION_DELETED` 事件
2. `background/rpc-facades.ts` — createSessionFacade.delete() 内联 cancelConversation(kernel, emit, sessionId)

---

## 三、待实现方案

### P1: System Prompt 自适应监控

#### 实现位置：ContextBuilder._buildSystemPrompt()（session-context.ts）

- 统计最近消息中来自系统/用户的"主动行为"消息数量
- 如果连续主动行为超过10条（从最近一条 user 或 tool 结果往前数），在原则末尾附加：
  "自主行动行为较多，请尽量保持严谨，重要操作前可向用户确认"
- 如果用户插入了新消息（新一轮对话），重置计数器

### P2: 记忆·感知·表达综合系统设计方案

详见独立设计文档（docs/COGNITIVE_SYSTEM.md）
