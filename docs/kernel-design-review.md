# Kernel 设计审查与完善方案

> 基于"默认大模型足够强"和"最小工具链支撑自组织"两条核心原则的架构审查

## 一、核心判断

当前 Kernel 的架构隐喻是**操作系统内核**（service registry / IPC / syscalls / capabilities / bootloader），这套隐喻在结构上很优雅，但它**服务的是"程序"，不是"LLM"**。

一个 Agent 内核应该围绕三件事组织：

| 支柱 | OS 隐喻 | Agent 隐喻 | 当前状态 |
|---|---|---|---|
| **注意力分配** | CPU 调度 | Context window 管理 | `getContextWindow()` 返回 `[]` |
| **知识持久化** | 文件系统 | 记忆/知识层 | 不存在 |
| **行动能力** | 系统调用 | 工具链 | 仅 2 个工具，无自注册 |

结论：**OS 基础设施（IPC、服务注册、生命周期）保留，但重心从"管理程序"转向"支撑 LLM 自组织"。**

---

## 二、逐模块审查

### 2.1 ChatProgram — 唯一的 Program，但职责过重

**现状**：ChatProgram 承担了消息发送、流式处理、工具调用循环、上下文截断、缓存注入、会话管理 6 项职责，是一个"上帝类"。

**问题**：
1. **没有 system prompt**：`sendMessage()` 直接从 session.messages 构造请求，完全不组装 system prompt。LLM 不知道自己是谁、有什么工具、在什么环境。
2. **上下文截断是硬编码的**：`_truncateMessagesForRequest` 只做了简单的 `contextWindowSize` 窗口截取，`getContextWindow()` 是空实现。
3. **工具执行无权限检查**：`_executeToolCalls` 直接调用 `tool.invoke()`，从不检查 CapabilityManager。
4. **工具串行执行**：所有 toolCalls 顺序执行，无法并行。
5. **无人类审批流**：`requiresApproval: true` 在 ToolDefinition 上声明了，但 ChatProgram 从不检查这个字段。

**建议**：将 ChatProgram 拆分为三层：
- **ContextEngine**：system prompt 组装 + 上下文窗口管理 + 格式转换
- **ToolExecutor**：工具执行 + 权限检查 + 结果格式化（可独立于 ChatProgram）
- **ChatProgram**（瘦身后）：只做 ReAct 循环编排（send → stream → detect tools → execute → continue）

### 2.2 SessionManager — 上下文管理是空壳

**现状**：
```typescript
getContextWindow(session, opts) { return []; }        // 空实现
getMessagesByTokenBudget(session, opts) { return []; } // 空实现
flushAllStreamWrites() {}                               // 空实现
```

**问题**：这是 Agent 内核最关键的"注意力分配"能力，但它完全不存在。当前的消息截断在 ChatProgram 里用简单的 `contextWindowSize` 窗口做，这意味着：
- 旧的重要上下文会被无差别丢弃
- LLM 无法影响哪些消息应该保留
- 没有 token 计数，无法做精确的上下文预算

**建议**：新建 `ContextManager` 服务（SessionManager 退化为纯 CRUD）：
- 组装 system prompt（从模板 + 动态上下文）
- Token 预算分配（system prompt / pinned messages / recent messages / tool results）
- 消息截断策略（summarize-old / sliding-window / hybrid）
- 暴露给 LLM 通过 `context_inspect` 工具查看当前上下文状态

### 2.3 ProcessManager — 死基础设施

**现状**：只有 `create(name)` / `get(id)` / `remove(id)`，没有生命周期、没有状态机、没有调度。

**问题**：如果要让 LLM 自组织管理复杂任务，它需要能 spawn 子任务。比如"你在跟我聊天的同时，帮我在后台分析这个页面的数据"——这需要一个真正的任务系统。

**建议**：两种路线选一：
- **A. 删除**：如果短期内不做后台任务，直接删除 ProcessManager，减少认知负担
- **B. 激活**：如果做多任务，给它加上：
  - 生命周期：`created → running → paused → completed → failed → cancelled`
  - 每个 process 持有自己的消息流
  - 通过 `task_op` 工具暴露给 LLM

### 2.4 CapabilityManager — 设计正确但从未接入

**现状**：`declare` / `grant` / `check` / `require` / `onDeny` 全部实现，但：
- `ChatProgram._executeToolCalls` 从不调用 `capabilities.check()`
- `onDeny` 回调从未设置
- 没有任何地方调用 `declare()` 或 `grant()`

**建议**：
- **短期**：在 `ToolExecutor` 中接入 `capabilities.require(toolName, capability)` 调用
- **中期**：将 `onDeny` 连接到 UI 审批流（弹出确认框让用户批准/拒绝）
- 或者：如果判断权限系统暂时不需要（MV3 扩展本身就是沙箱），直接删除

### 2.5 IPC — 过度工程

**现状**：优先级（4 级）、中间件链、命名空间通道、request/response、统计。

**实际使用**：
- 优先级：只有 `emitHigh` / `emitLow` 被调用过几次，`CRITICAL` 从未使用
- 中间件：只有 1 个 debug logger
- request/response：从未使用
- 统计：从未被读取

**建议**：保留 `emit` / `on` / `off` / `getOrCreateChannel`，其余标记为 deprecated 或直接移除。在 Agent 内核中，IPC 的核心作用是"模块间解耦通信"，不需要 OS 级的消息队列特性。

### 2.6 Bootloader — 8 阶段过多

**现状**：CORE_INIT → SERVICES_REGISTER → SERVICES_INIT → TOOLS_REGISTER → HANDLERS_INIT → CONFIG_LOAD → UI_RENDER → READY

**实际**：
- CORE_INIT：空操作（"IPC ready"）
- UI_RENDER：空操作（实际在 app.js 的 Phase 2 单独完成）
- HANDLERS_INIT 和 CONFIG_LOAD 之间有隐含依赖（ChatProgram 需要 settings）

**建议**：简化为 4 阶段：
```
INIT → REGISTER → START → READY
```
- INIT：创建 IPC、Log、ToolRegistry、CapabilityManager
- REGISTER：注册所有服务工厂
- START：初始化服务 + 加载配置 + 注册工具 + 创建 Programs
- READY：就绪

### 2.7 工具链 — 核心问题

**现状**：只有 2 个工具：
1. `run_user_script` — 在页面执行 JS（**优秀的设计**，这是终极原语）
2. `manage_user_scripts` — 脚本 CRUD

**问题分析**：

`run_user_script` 是一个 Turing-complete 的万能工具——强大 LLM 可以用它做任何浏览器端操作。这完全符合"最小工具链"原则。但问题是：

**LLM 的"身体"很强，"头脑"很弱**。它能操作页面，但不能：
- 看到自己的状态（我在哪个会话？有什么工具？上下文用了多少 token？）
- 记住跨会话的知识（用户上次告诉我他喜欢什么？）
- 管理自己的任务（我正在做 3 件事，进度如何？）
- 创建新的可复用工具（我写了个好用的脚本，想下次直接调用）

**建议的最小工具链（4+1）**：

```
核心工具（always available）:
┌─────────────────────────────────────────────────────┐
│ 1. browser_exec    │ 页面 JS 执行（现有，保留）       │
│    → 操作 DOM、读取页面、导航                         │
│    → "身体"                                          │
├─────────────────────┼───────────────────────────────┤
│ 2. memory_op       │ 知识存储（新建）                │
│    → set(key, value, tags?)                         │
│    → get(key) / search(query) / delete(key)         │
│    → "长期记忆"                                      │
├─────────────────────┼───────────────────────────────┤
│ 3. task_op         │ 子任务管理（激活 ProcessManager）│
│    → create(goal) / status(id) / cancel(id)         │
│    → "执行功能"                                      │
├─────────────────────┼───────────────────────────────┤
│ 4. context_inspect │ 自我感知（新建）                │
│    → summary() — token 用量、消息数                  │
│    → tools() — 可用工具列表和 schema                  │
│    → session() — 当前会话信息                        │
│    → "元认知"                                        │
├─────────────────────┼───────────────────────────────┤
│ + tool_register    │ 动态工具注册（升级 manage_scripts）│
│    → register(name, desc, code)                     │
│    → 让 LLM 自己创造工具                              │
└─────────────────────┴───────────────────────────────┘
```

**设计理念**：
- 工具是**原语**，不是**工作流**。不预设 LLM 应该怎么工作。
- 工具覆盖 LLM 的四个维度：行动（browser）、记忆（memory）、执行（task）、认知（introspect）。
- `tool_register` 让 LLM 自举地扩展能力——今天写一个"提取表格"的脚本，注册成工具，明天就能直接调用。

---

## 三、缺失的关键能力

### 3.1 System Prompt 管理（最优先）

当前完全没有 system prompt。LLM 不知道：
- 自己是 AI Agent
- 在什么浏览器环境里
- 当前在什么页面
- 有什么工具可用
- 用户的偏好是什么

**建议**：在 ContextEngine 中实现 system prompt 模板系统：
```
system_prompt = base_identity + environment_info + available_tools + user_preferences + dynamic_context
```

### 3.2 记忆/知识层（高优先）

当前所有知识都存在 session.messages 里，跨会话即丢失。

**建议**：新建 `MemoryManager` 服务：
- 底层基于 `chrome.storage.local`
- 数据结构：`{ key, value, tags[], namespace, createdAt, updatedAt }`
- 通过 `memory_op` 工具暴露给 LLM
- 支持按 key、tag、namespace 检索

### 3.3 Token 计数（中优先）

当前没有任何 token 计数能力。`contextWindowSize` 是消息条数而非 token 数，这对现代 LLM 来说不精确。

**建议**：在 ContextEngine 中集成轻量 tokenizer（如 `tiktoken` 的 wasm 版本或 `gpt-tokenizer`），用于：
- 精确计算上下文窗口占用
- 为截断策略提供数据基础

### 3.4 工具结果结构化（低优先）

当前工具结果被 `JSON.stringify` 后作为 tool message 的 content。对于复杂结果（如页面 DOM 分析），这会浪费大量 token。

**建议**：ToolResult 支持 `structured` 输出模式，ContextEngine 在序列化时做智能压缩（截断长字段、移除冗余空格等）。

---

## 四、简化建议（删除 / 合并）

| 模块 | 建议 | 理由 |
|---|---|---|
| IPC 优先级系统 | 标记 deprecated | 从未有意义使用 |
| IPC 中间件链 | 保留但简化 | 只有 1 个实际用户（debug logger） |
| IPC request/response | 删除 | 从未使用 |
| IPC 统计 | 删除 | 从未读取 |
| CapabilityManager | 接入或删除 | 当前是死代码 |
| ProcessManager | 激活或删除 | 当前是空壳 |
| Bootloader 8 阶段 | 简化为 4 阶段 | CORE_INIT 和 UI_RENDER 是空操作 |
| `_sidepanelShim` | 删除 | Shell 已 ES import 化，无消费者 |
| `getContextWindow` stub | 实现 or 移除到 ContextEngine | 当前返回 `[]` 误导 |

---

## 五、实施优先级

### Phase 1：补齐 Agent 基础（最高优先）
1. **新建 ContextEngine** — system prompt 组装 + 上下文窗口管理
2. **新建 MemoryManager** — 跨会话知识存储
3. **新增 `memory_op` 工具** — 暴露记忆能力给 LLM
4. **新增 `context_inspect` 工具** — LLM 自我感知

### Phase 2：激活自组织（高优先）
5. **激活 ProcessManager** — 子任务生命周期
6. **新增 `task_op` 工具** — 子任务管理
7. **升级 `manage_user_scripts` → `tool_register`** — 动态工具注册
8. **ChatProgram 拆分** — 抽出 ToolExecutor

### Phase 3：清理简化（中优先）
9. **IPC 精简** — 移除未用特性
10. **Bootloader 简化** — 8 阶段 → 4 阶段
11. **CapabilityManager 决策** — 接入 or 删除
12. **移除 `_sidepanelShim`**

---

## 六、与主流 Agent 设计的对比

| 维度 | 本项目(当前) | OpenAI Assistants | Claude Computer Use | LangGraph | 本项目(提议) |
|---|---|---|---|---|---|
| **工具链** | 2 个(脚本执行+管理) | 3 个(code/retrieval/function) | 3 个(computer/editor/bash) | 用户定义 | 4+1 原语 |
| **上下文管理** | 空实现 | 自动截断 | 无(靠模型自身) | 用户定义 | ContextEngine |
| **记忆/知识** | 无 | Threads | 无 | 检查点 | MemoryManager |
| **任务编排** | 固定 ReAct | Run 状态机 | 固定 ReAct | 图编排 | ProcessManager |
| **动态工具** | 不支持 | 不支持 | 不支持 | 不支持 | tool_register |
| **LLM 自感知** | 无 | 无 | 无 | 无 | context_inspect |

**本项目的独特优势**：
1. `run_user_script` 是比 Claude 的 `bash` 更强的浏览器原语（直接操作 DOM）
2. `tool_register` 是所有框架都没有的——让 LLM 自举创建工具
3. `context_inspect` 让 LLM 看到自己的"注意力状态"，主动管理上下文

**核心理念差异**：
- 其他框架假设"LLM 需要被编排"（预设工作流、状态机、图）
- 本项目假设"LLM 足够聪明，给它好的上下文和最小工具，让它自己组织"

---

## 七、总结

当前 Kernel 的 OS 基础设施（服务注册、IPC、生命周期）是扎实的，但**重心错位**——它服务于"管理程序"的隐喻，而非"支撑 LLM 自组织"的目标。

三条核心改动：
1. **补 Context Engine** — 让 LLM 知道自己在哪、有什么、该关注什么
2. **补 Memory Layer** — 让 LLM 能记住跨会话的知识
3. **补 4+1 最小工具链** — 让 LLM 能行动、记忆、执行、认知、自举

删减三条：
1. **砍 IPC 过度工程** — 优先级、request/response、统计
2. **砍 Bootloader 空阶段** — 8 → 4
3. **决 CapabilityManager/ProcessManager** — 接入 or 删除，不留死代码
