# 代码审查与优化路线图（kernel / bridge / sidepanel）

> 日期：2026-07-09
> 范围：对 `kernel/`（43 ts）、`bridge/`（5 ts）、`sidepanel/`（29 svelte + 7 ts + 4 css + 1 html）三模块做结构、死代码、冗余、类型与安全的分层审查。
> 目的：找出不合适的结构、垃圾代码，给出可执行、带优先级的优化方案。

---

## 0. 总览（先给结论）

| 维度 | kernel | bridge | sidepanel |
|---|---|---|---|
| 分层/结构 | ✅ 零外部依赖原则守得住；循环依赖已被 `KernelRef` 解耦 | ⚠️ 反向依赖 kernel（Log/IPC），monkeypatch 破坏封装 | ⚠️ IPC 订阅泄漏（P0）、状态/通信方式混用 |
| 死代码 | ⚠️ 约 6 类导出完全无引用（Model、内容块类、getStats、clearHistory、outputSchema、findByCapability、大段 KernelEvents） | ⚠️ 3 个死类型（RpcRequest/RpcError/RpcResponse）+ 永远不触发的兜底逻辑 | 🔴 5 个无人引用文件 + 3 段孤儿 CSS + 数处死变量/死分支 |
| 冗余重复 | ⚠️ SSE 解析×3、StandardResponse×5、genId×5、clonePlain×4、joinUrl×2 | ⚠️ 跨模块魔法字符串、测试桩重复 | ⚠️ 时间/文本工具被内联版取代、Tooltip 重复实现 |
| 类型滥用 | ⚠️ ~50 处 any，Provider 层最密集 | ⚠️ 默认 `any` 兜底、冗余 `as any`、能力钩子语义错配 | 🔴 ~90 处 any，`getContext('api') as any` 直接废掉 RPC 收口 |
| 安全/正确性 | ⚠️ `Scripts.ts` 缺 `.js`、`getInvocationHistory` 永远空、`ProviderFactory` 绕过 configure | ⚠️ audit 恒 true、超时无重试、错误信息透传 stack | 🔴 XSS（`{@html renderMarkdown(LLM输出)}` 未净化）、IPC 泄漏 |

**优先级总判定**
- **P0（必须修，影响正确/安全/内存）**：sidepanel IPC 订阅泄漏、sidepanel XSS、kernel `Scripts.ts` 缺 `.js`、kernel `getInvocationHistory` 逻辑 bug、kernel `ProviderFactory` 绕过 configure。
- **P1（应修，结构/死代码/安全默认）**：bridge 反向依赖 + monkeypatch、bridge 死类型、kernel 死代码与死事件常量、sidepanel 5 个死文件、sidepanel `Sidebar` 悬空类型导入、sidepanel `getContext('api') as any`。
- **P2（清理/一致性）**：冗余逻辑抽公共、console 散落、魔法字符串、硬编码色值、大组件拆分。

---

## 1. Kernel 模块

### 1.1 结构问题
- **P1 `models/Scripts.ts:6`** `import { BaseModel } from './BaseModel';` 缺 `.js` 扩展名。其余 42 个文件全用 `./BaseModel.js`，在 NodeNext/Bundler 解析下此 import 运行/编译期会失败。**唯一例外，明显 bug。**
- **P1 `orchestration/session-tools.ts:16-20`** 用绝对别名 `kernel/...` 而非相对路径。Kernel 自称"可在任何 JS 环境运行、零外部依赖"，相对路径是唯一可移植写法。
- **P1 `ToolsManager.getInvocationHistory` 的 `since` 过滤永远为空**（`ToolsManager.ts:270` 附近）：`ToolResult` 无 `timestamp` 字段，`(e as any).timestamp` 恒 `undefined` → 传 `since` 永远返回空数组。逻辑 bug。
- **P1 `ProviderFactory._createService` 绕过 `configure()`**（`ProviderFactory.ts:85-90`）：直接 `Object.assign` 写 `config`，从不调 `configure()`。导致 `OpenRouterService.configure()`（含 apiKey 校验 + endpoint 默认值）和 `LMStudioService.configure()` 成为**死方法**；若 Shell 未预置 `endpoint`，会以 `undefined` 发请求。
- **P2** `orchestration/session.ts` 的 `TurnState`（`turns` Map）已收敛原 `ChatProgram._assistantMsgId` 与 `_currentRequest.assistantMessageId` 的重复状态，手动同步问题随之消除；`Session.ts` 构造器重复赋值 `createdAt/updatedAt`；`OpenAIService.buildHeaders` 空壳重写（仅 `return super.xxx`）。

### 1.2 死代码 / 垃圾代码（可删）
- **`models/Model.ts` 整个 `Model` 类**：kernel 内 0 引用，`index.ts` 导出但无消费方。
- **`models/MessageContent.ts` 全部内容块类**（`TextBlock/ImageBlock/ToolUseBlock/ToolResultBlock/ThinkingBlock/MediaContent`）：仅定义 + 再导出，kernel 0 引用，测试也未引用。
- **`ToolsManager.getStats()` / `clearHistory()`**：全 kernel 0 调用（讽刺的是 IPC 的 getStats/clearHistory 因"从未读取"刚被清理，这里却保留一模一样死代码）。
- **`Tool.outputSchema`**：write-only 死字段，无读取点。
- **`ToolsManager.findByCapability`**：仅定义，0 调用。
- **`CapabilityManager` 全量方法**：`check/require/declare/grant/revoke/getCapabilities/audit` 在 kernel 内均无任何调用点（已确认是待开发占位）。保留可，但建议标 `@deprecated`/明确 TODO。
- **`KernelEvents` 整片事件常量从未被 kernel 触发**：`KERNEL.*`、`SERVICE.*`、`UI.*`、`STORAGE.*`、`IPC.*`、`CAPABILITY.*`。属"声明式事件总线"占位。
- **不可达分支**：`ContextBuilder._truncate` 的 assistant 分支两边都是 `break`（`ContextBuilder.ts:123-128`），`toolCalls?.length` 判断毫无作用。
- **潜伏 bug**：`BaseModel.fromJSON` 抛错实现，`Process/Model/Tool` 未重写 → 任一处对这些类型调 `fromJSON` 会运行期炸（当前因无人调用未暴露）。
- **注释卫生良好**：kernel 内 `FIXME/TODO/HACK/XXX` 零命中。但 `Tool.ts:113` 描述"已删除的 RPC 形态"，属陈旧注释。

### 1.3 冗余重复
- **SSE 流式解析 + `tool_calls` delta 累积逻辑三份克隆**：`OpenAIService.chatStream`、`OpenRouterService.chatStream`、`LMStudioService.chatStream`（各 ~80-100 行），建议抽 `BaseStreamingProvider` / `StreamParser`。
- **`StandardResponse` 组装重复 5+ 处**：结构一致 `{content, reasoning_content, toolCalls, finishReason, usage, model}`，建议统一 `buildStandardResponse()`。
- **ID 生成器重复 5 处**：`BaseModel.generateId`、`ToolCall` 构造、`ScriptsManager.install`、`IPC._generateId`、`CapabilityManager._audit`，均为 `prefix_${Date.now()}_${Math.random()...}` → 抽 `genId(prefix)`。
- **`JSON.parse(JSON.stringify(x))` 反 proxy 克隆重复 4 次**（`SettingsManager.ts`）→ 抽 `clonePlain()`。
- **`endpoint.replace(/\/$/, '')` 拼接 base URL 重复 2 处** → 抽 `joinUrl(base, path)`。

### 1.4 类型滥用（any）
- 类型契约层最该修：`IProviderAPIService.ts` 的 `usage: any`、`buildHeaders(request?: any)`、`chat(_request: any, ...)`；`ISessionManager.ts:22` `updateMessage(_messageId, _updater: any)`。
- Kernel 核心：`Kernel.ts` `_services` map 的 `instance: any`、`get(name): any`、`options: any`。
- Provider 层最密集：`OpenRouterService`/`OpenAIService`/`LMStudioService` 几乎每个方法签名都是 `any`（约 50+ 处）。
- 建议顺序：先收窄类型契约层 → 再清 Provider 方法签名 → 最后清业务层 `(x as any)`。

### 1.5 其它
- ✅ 无散落 `console.log`，全走 `Log` 单例，符合统一原则。
- 魔法数字：`ProcessManager` 的 `10000`/`5*60*1000`、`Process.ts` 的 `5000`、`ToolExecutor` 的 `RETRY_DELAY=2000/MAX_RETRIES=3` 应提命名常量。
- **Provider 副作用式改写入参**：`LMStudioService.ts:144,182` 与 `OpenRouterService.ts:74` 直接 `request.stream = ...` 改写调用方传入对象，而 `OpenAIService` 在本地 `body` 上设 → 三者不一致，应改为不改入参。
- `LMStudioService.buildRequestBody` 读 `request.system/metadata`，但 `MessagesRequest` 未定义这些字段 → 永不会触发的死分支。

---

## 2. Bridge 模块

### 2.1 结构问题
- **P1 反向依赖 kernel（分层倒置）**：`RPC.ts:23-24`、`IPCTransport.ts:30-31` 直接 `import { IPC } from 'kernel/IPC.js'`、`import { Log } from 'kernel/services/Log.js'`。桥接层本应中立，却硬依赖 kernel 实现级模块。建议把 `Log` 下沉为 `shared/` 或让 `IPCTransport` 接收注入 logger。
- **P1 monkeypatch 共享对象方法**：`IPCTransport.ts:117-123` 在 `init()` 里重写 `this.ipc.getOrCreateChannel`，破坏封装且与 middleware 设计自相矛盾。`destroy()` 也未还原该方法 → 同一 `ipc` 实例复用会残留闭包指向已 `_disposed` 的旧 transport（泄漏隐患）。
- **P1 expose 安全默认路径在生产从未触发**：`RPC.ts:184` `collectExposeMethods` 仅在调用方不传 `methods` 时执行，但 `background/main.ts` 5 处 `expose` 全显式传白名单 → 拒绝名单 `RPC_EXPOSE_DENY` 与自动收集逻辑实际不可达（死代码）。
- **P2 契约分裂**：`RpcCapabilityHook`（`RPC.ts:60-62`）与 `CapabilityManager.audit` 靠注释"对齐"，非联合类型。

### 2.2 死代码 / 垃圾代码
- **死类型（全仓零消费）**：`RPC.ts:36-52` 的 `RpcRequest` / `RpcError` / `RpcResponse`，运行时请求/响应均为内联字面量，从未引用。应删。
- **未触发的兜底逻辑**：`RPC.ts:76-94` 的 `RPC_EXPOSE_DENY` + `collectExposeMethods`（见 2.1）。
- **重复测试桩**：`RPC.test.ts:17-72` 与 `IPCTransport.test.ts:12-72` 两份几乎逐字相同的 `installChromeStub` chrome 桩 → 抽共享 helper。
- **误导性注释**：`serialize.ts:2,5-7` 写"转换为 `chrome.runtime.sendMessage` 可结构化克隆的安全值"，但 `IPCTransport` 实际走 **Port 长连接**（`chrome.runtime.connect`），注释与实现不符。
- ✅ 无 FIXME/HACK/被注释代码残留。

### 2.3 冗余重复
- **跨模块魔法字符串**：`kernel/Events.ts` 已定义 `KernelEvents.KERNEL.BOOT_COMPLETE/BOOT_ERROR`，但 `background/main.ts:45,65,146,149-150` 与 `sidepanel/main.ts:46,52,60` 仍用裸字符串 `'kernel:bootComplete'`/`'kernel:bootError'`/`'kernel:ping'`（且 `main.ts` 已 import `KernelEvents` 却不用）；`kernel:ping` 在 `Events.ts` 中**根本没有**常量 → 双份裸字符串漂移风险。应新增 PING 常量并统一引用。

### 2.4 类型滥用
- `as any`：`IPCTransport.ts:74,119,183`；`RPC.ts:195-196` 的 `(opts.capabilities as any).audit` 冗余（`opts.capabilities` 已是 `RpcCapabilityHook`，可直接 `.audit`）。
- 默认 `any` 兜底：`RPCClient.call<T = any>`、`createApiClient<T extends Record<string, any> = any>` → 一旦调用方漏传 `KernelAPIContract` 整条链路退回 any，浪费 `api-contract.ts` 的类型投入。
- **语义错配**：`RPC.ts:200` 把 `capabilities` 实参传成方法名数组 `[m]`，而 `CapabilityManager` 的 `capabilities` 语义是能力枚举（`'network'` 等）。类型能编译，但记录的内容是谎言。

### 2.5 其它坏味道
- **能力钩子是"装饰品"**：`capHook(..., true, {})` 的 `result` 恒 `true`，叠加 `CapabilityManager.audit` 不鉴权，整条 audit 链路不产生任何决策，仅记 log。误以为"已接入鉴权"会踩坑。
- **多 Shell 连接被静默丢弃**：`IPCTransport.ts:52,160-161` 内核侧 `this.port = port` 只保留"最近一个"端口，多 sidepanel 并发时旧连接回传消息静默丢失（注释已注明限制，建议在公开文档明示）。
- **超时无重试**：`RPCClient` 默认 20s 超时，`scripts.install/loadAll` 等慢操作超 20s 会误 reject，且超时后 kernel 端 handler 仍可能执行（竞态/资源浪费）。
- **错误信息透传**：`RPCServer._onRequest` 把 `err.stack` 经 IPC 回传前端，生产建议过滤 `stack` 避免敏感上下文泄漏。
- **重复 init 无保护**：`chrome.runtime.onConnect.addListener`（`IPCTransport.ts:126`）没有去重，多次 `init()` 会重复注册。

---

## 3. Sidepanel 模块（Svelte 5）

> 重要澄清：本项目 `sidepanel/` 已是纯 Svelte 5 工程（无旧 `sidepanel/js/`、无全局 window 事件总线）。"新旧并存"在此表现为**重构中途残留的孤儿 Svelte 代码 vs 已被内联取代的逻辑**。

### 3.1 结构问题
- **🔴 P0 IPC 订阅泄漏（幽灵监听器 + 内存泄漏）**：
  - `ChatPage.svelte:206` 声明 `cleanups` 数组并在 `onMount` 把 13 个 `chatChannel.on(...)` 退订函数 push 进去，但 `onDestroy`（332-334）**只移除了 keydown，从未遍历执行 `cleanups`**。
  - `HistoryPage.svelte:27-32` 在 `$effect` 里注册订阅却未返回清理函数。
  - `ScriptsPage.svelte:45-53` 在 `onMount` 注册订阅却**无 `onDestroy`**。
  - 叠加 `Sidepanel.svelte:60` 用 `{#key activePage}` 切换页面 = 销毁+重建，每次进入都向同一持久 IPC 实例累加一批永不退订的监听器 → 重复触发、闭包持有已销毁组件、内存/CPU 持续泄漏。
  - 正确范式参考：`EffortControl.svelte:36-41`、`CodeEditor.svelte:105-108`。
- **P1 `Sidebar.svelte:2` 悬空类型导入**：`import type { PageId, PageDef } from '../../lib/types.js';` —— `lib/types.js` 不存在（`tsconfig.json` 仅映射 `kernel/*`），类型检查会失败。应从 `Sidepanel` 经 props 传入（Sidepanel 已本地定义同名类型）。
- **P1 状态/通信方式混用**：`Sidepanel.svelte:34-41` 注入 `ipc/rpc/api/navigate` 4 个 context 设计上希望走 `api.*`，但各页面全 `getContext('ipc')` 后直接 `ipc.getOrCreateChannel(...)` 监听魔法事件，绕过 RPC；同一文件又混用 `api.*`。`ipc` 被声明 `unknown` 再 `as any`。
- **P1 `ChatEventHandler.ts` 重写版 vs 内联版并存**：文件头注释"对标旧版 event-handlers/ChatEventHandler.js"，但**源码中无任何文件 import 它**，其职责已被 `ChatPage.svelte:107-120` 的 `handleSend/handleStop` 内联取代 → 重构残留孤儿。
- **P2 `SettingsPage.svelte` 过大（~770 行）**：混合设置读写、Provider 切换、模型列表 HTTP 拉取、一整套模型下拉浮窗定位算法（~120 行几何计算）→ 应抽"模型下拉浮窗"独立组件。
- **P2 `ChatPage` 把 IPC 监听回调与业务逻辑全塞主组件**（~460 行），而本应承载转译的 `ChatEventHandler.ts` 被废弃。

### 3.2 死代码 / 垃圾代码（确定可删，零风险）
| 文件 | 证据 |
|---|---|
| `components/atoms/IconButton.svelte` | 全仓无 `import ...IconButton` / `<IconButton` |
| `components/overlays/Tooltip.svelte` | 同上；功能被 `Sidebar` 内联 `.sidebar-tooltip` 重复实现 |
| `components/layout/PagePlaceholder.svelte` | 同上 |
| `pages/chat/ChatEventHandler.ts` | 无源码引用（仅 docs/dist） |
| `utils/time.ts` | 无任何 import，`formatTime/formatRelativeTime` 被 `HistoryPage` 内联版取代 |
| `utils/text.ts:22` `escapeHtml()` | 全仓仅定义、无调用 |
| `styles/components.css:770-822` `.icon-btn*` | 仅死 `IconButton.svelte` 使用 |
| `styles/components.css:1241-1297` `.tooltip*` | 仅死 `Tooltip.svelte` 使用 |
| `styles/components.css:1497-1597` `.placeholder-page*` | 仅死 `PagePlaceholder.svelte` 使用 |
| `SettingsPage.svelte:14` `settingsChannel` | 定义后全文未再用 |
| `ChatPage.svelte:206` `cleanups` | push 后从未遍历（直接造成 3.1 P0 泄漏） |
| `ChatPage.svelte:212` `if (chatChannel) {` | 前一行已 `if (!chatChannel) return`，恒真死分支 |
| `Sidebar.svelte:30-41` 被注释掉的品牌区 | 整块注释，应删 |

**疑似（需二次确认）**：`MessageBubble.svelte:20-21` 的 `findToolNameByCallId`/`messages` props 未使用（真正消费在 `ToolMessageCard.svelte`）；`ToolPanel.svelte:13` `const def = tool` 别名 + 恒真 `{#if def}`。

### 3.3 冗余重复
- **时间格式化重复**：`utils/time.ts` 与 `HistoryPage.svelte:77-89` 内联版重复（`time.ts` 因此沦为死代码）。
- **文本内容提取重复**：`utils/text.ts:9` `extractText` 与 `HistoryPage.svelte:55-70` 内联 `.filter(c=>c.type==='text')` 重复 → 统一调 `extractText`。
- **Tooltip 实现重复**：死 `Tooltip.svelte` 与 `Sidebar.svelte` 内联 `.sidebar-tooltip` 重复（保留后者，删前者）。
- **模型 endpoint 构造重复**：`SettingsPage.svelte:47-51` 与 `:156-164` 重复。
- **输入框样式重复**：`pages.css:388-414` `.model-search-input` 与 `components.css:855-894` `.input` 高度重合（SettingsPage 没复用 `Input` 组件而自绘）。
- **魔法色值硬编码**：`components.css:698` `#c0392b`、`pages.css:495` `#f5f7fa`、`pages.css:503` `#1a1d21` 等，应改用 `--color-*`/`--radius-*` token。
- **疑似跨模块重复**：`SettingsPage.svelte:184-198` 模型对象归一化，大概率与 kernel 侧 Provider 返回归一化重复，建议核对后统一到一处。

### 3.4 类型滥用（~90 处 any）
- **强转废掉 RPC 收口**：`SettingsPage.svelte:15` `const api: any = getContext('api')`（已注入 `KernelAPIContract` 却转 any，RPC 收口白做）；`main.ts:52` `(d: any)`；各页面 `const ipc: any = getContext('ipc')`。
- **业务数据全 any**：`ChatPage.svelte` `messages = $state<any[]>`、`session = $state<any>`、`allTools = $state<any[]>`、所有事件回调 `(data: any)` 等十余处；其余页面同。
- **整文件 any 且文件本身死**：`ChatEventHandler.ts:19-24` 四个 `private ...: any` + 构造参数 `any`。
- 修复建议：`getContext('api')` 改 `getContext<KernelAPIContract>('api')`；`ipc` 用真实 `IPC` 类型替代 `any`。

### 3.5 其它坏味道
- **🔴 XSS 风险（安全）**：`MessageBubble.svelte:87` `<div class="message-content markdown-body">{@html renderMarkdown(displayContent)}</div>` 与 `ToolMessageCard.svelte:30` `{@html rendered}` 直接把 **LLM 输出**经 `marked` 渲染后注入 HTML。`marked` 默认不做净化，模型返回 `<script>`/`<img onerror>` 即被执行。建议 `renderMarkdown` 内接入 DOMPurify，或先 `escapeHtml`。
- **console 散落**：`main.ts:22,87` `console.log`（启动调试未清）、`main.ts:78` `console.error`、`StoragePage.svelte:99,132` `console.error`（其余页面走 `Log`）。应统一走 `kernel/services/Log.js`。
- **违反自身 CSS 准则**：`Sidepanel.svelte:5` 注释明令"避免硬编码 css"，但 `MessageBubble.svelte:91`、`Card.svelte:41` 等仍内联硬编码样式。
- **魔法字符串**：channel 名 `'chat'/'tool'/'storage'/'scripts'/'settings'` 散落各页面；版本号 `'v0.6.0'` 硬编码 `Sidebar.svelte:75`。
- **性能**：`SettingsPage.svelte:594,640,601` 多次重复调用 `getFilteredModelIds()`/`getExactMatchId()`（含 sort），应改 `$derived`；`ChatPage.svelte` 流式滚动 effect 依赖 `messages.length`（流式中不变）→ 流式过程不跟手滚动；`ToolMessageCard` 每次渲染 `renderMarkdown` 无缓存。
- **a11y**：`Dialog.svelte:58` 的 Escape 处理依赖聚焦，但 backdrop 未自动聚焦 → Escape 实际不生效。

---

## 4. 跨模块共性问题

1. **死代码规模大但集中在"预留/占位"**：CapabilityManager、KernelEvents 大片常量、Model/内容块类、bridge 死类型，都是"声明式预留"未被消费。删除前建议全局 grep 确认 Shell 是否引用（尤其公共导出 `Model`/`MediaContent`）。
2. **any 双轨**：kernel Provider 层 + sidepanel 业务层 + bridge 默认 any 兜底，三处共同拉低类型收益。建议先修"契约层"（IProviderAPIService / ISessionManager / KernelAPIContract）再向下渗透。
3. **魔法字符串三处漂移**：事件名（kernel:boot* / kernel:ping）、channel 名、版本号，均应有单一常量源。
4. **"注释即文档"已失真**：`serialize.ts`、`Tool.ts:113`、被注释掉的 Sidebar 品牌区、`ChatEventHandler.ts` 头注释，均与实现不符。

---

## 5. 优化路线图（按可立即动手 → 需决策排序）

### Phase 1 — 零风险死代码删除（可立即执行，不影响运行路径）
- [ ] 删 sidepanel 死文件：`IconButton.svelte` + 其 CSS；`Tooltip.svelte` + CSS；`PagePlaceholder.svelte` + CSS；`ChatEventHandler.ts`；`utils/time.ts`（或反向：让 HistoryPage 调它、删内联版）；`utils/text.ts:22` `escapeHtml`（或接入 markdown 净化）。
- [ ] 删 kernel 死代码：`Model` 类、`MessageContent` 内容块类、`ToolsManager.getStats/clearHistory`、`Tool.outputSchema`、`findByCapability`、`ContextBuilder._truncate` 死 if、`OpenAIService.buildHeaders` 空壳、`BaseModel.fromJSON` 补全子类重写。
- [ ] 删 bridge 死类型：`RpcRequest`/`RpcError`/`RpcResponse`；修正 `serialize.ts` 误导注释。
- [ ] 删 sidepanel 死变量/分支：`SettingsPage.settingsChannel`、`ChatPage.cleanups`(配合 Phase 3 修泄漏)、`ChatPage:212` 死 if、`Sidebar` 被注释品牌区、`MessageBubble`/`ToolPanel` 未用 props。
- [ ] 删除前统一做：`grep` 确认无 Shell 引用 `Model`/`MediaContent`/`KernelEvents` 大片常量。

### Phase 2 — 正确性 / 安全 P0（必须修）
- [ ] **sidepanel IPC 泄漏**：`ChatPage.onDestroy` 遍历 `cleanups` 退订；`HistoryPage` `$effect` 返回退订；`ScriptsPage` 加 `onDestroy` 退订（参考 EffortControl/CodeEditor 范式）。
- [ ] **XSS**：`renderMarkdown` 接入 DOMPurify 或先 `escapeHtml`（`MessageBubble.svelte:87` / `ToolMessageCard.svelte:30`）。
- [ ] **kernel `Scripts.ts:6`** 补 `.js` 扩展名。
- [ ] **kernel `getInvocationHistory`**：`ToolResult` 无 `timestamp` → 加 `createdAt` 或改按已有字段过滤；`toolName` 用 `callId.includes` 脆弱，建议在历史里存 `toolName`。
- [ ] **kernel `ProviderFactory`**：调用 `configure()` 或在 `_createService` 设 endpoint 默认值，消除死 configure 方法 + endpoint 隐患。

### Phase 3 — 结构 / 安全默认 P1
- [ ] bridge 不再直接 `import kernel/...`：把 `Log` 下沉 `shared/`，或 `IPCTransport` 接收注入 logger；去除 `getOrCreateChannel` monkeypatch，改注册式接入并在 `destroy()` 还原。
- [ ] bridge expose 兜底：要么让 `expose` 未传 `methods` 时真正启用 `RPC_EXPOSE_DENY` 并补测试，要么删除（连同测试用例）。
- [ ] sidepanel `Sidebar.svelte:2` 删悬空 `lib/types.js` 导入，改 props 传入。
- [ ] sidepanel `getContext('api')` 改 `getContext<KernelAPIContract>('api')`，`ipc` 用真实 `IPC` 类型；清 `main.ts` / `StoragePage` 的 `console.*` 改 `Log`。
- [ ] kernel `ToolExecutor.ts` 改相对 import，去掉 `kernel/` 别名。

### Phase 4 — 类型收紧与冗余重构 P2
- [ ] 收窄契约层 any：`IProviderAPIService`、`ISessionManager`、`MessageContent.toAPIFormat`、bridge 默认 `any` 兜底。
- [ ] 抽公共工具：`genId(prefix)`、`clonePlain()`、`joinUrl()`、`buildStandardResponse()`、SSE `StreamParser`/`BaseStreamingProvider`。
- [ ] 统一魔法字符串：新增 `kernel:ping` 常量、channel 名常量、版本号常量；`background/main.ts` 与 `sidepanel/main.ts` 改用 `KernelEvents`。
- [ ] 拆分大组件：`SettingsPage` 的"模型下拉浮窗"抽独立组件；`ChatPage` 抽 `ChatEventHandler` 转译（与删除孤儿文件二选一，避免又留死文件）。
- [ ] 性能：`SettingsPage` 的 `getFilteredModelIds/getExactMatchId` 改 `$derived`；`ChatPage` 流式滚动 effect 修正依赖。
- [ ] CSS：硬编码色值/圆角改用 design token；复用 `Input` 组件替代 `.model-search-input` 自绘。

---

## 6. 一句话建议

**先 Phase 1（纯删，零风险）→ 再 Phase 2（修 P0 泄漏与 XSS，关乎运行正确与安全）→ 最后 Phase 3/4（结构收敛与类型收紧）。** 其中 "CapabilityManager 仍空转" 与 "RPC 收口后 `getContext('api') as any` 废掉类型" 是两个最该在 Phase 3 拍板的点：**要么落地鉴权，要么整体降级为注释明确的占位并从 expose 链路移除**。

---

## 附：2026-07-09 结构变更（本审计之后的演进）

本审计成文后，kernel 已完成一次结构演进，以下发现需要按新结构重新理解：

- **`programs/chat/` → `orchestration/`**：会话编排层扁平化，`chat.ts → session.ts`（`runConversation` / `cancelConversation`）、`chat-context.ts → session-context.ts`（`ContextBuilder`）、`chat-tools.ts → session-tools.ts`（`ToolExecutor`）、新增 `request.ts`。
- **新增 `eventhandler/`**：按消息组接管 IPC 接线。`eventhandler/session.ts` 的 `registerSessionHandlers` 负责 `SESSION.ADD_MESSAGE`/`SESSION.STOP_STREAM` → `runConversation`/`cancelConversation`、会话生命周期事件 → `cancelConversation`。**这意味着原审计中"`sidepanel/pages/chat/ChatEventHandler.ts` 孤儿文件"相关条目（§1.1 / §4 / Phase 1 / Phase 4）已过时**：事件处理概念已落地到 `kernel/eventhandler/session.ts`，sidepanel 侧的 `ChatEventHandler.ts` 也不再被引用。
- **`CHAT` 消息组 → `SESSION`**：`KernelEvents.CHAT → SESSION`、`KernelChannels.CHAT → SESSION`，线协议 `chat:*` → `session:*`。Shell（ChatPage/HistoryPage）与 RPC facade 已同步更新。
- **命令用时态区分（去 `cmd:` 中缀）**：`CMD.SEND`/`CMD.STOP` → `SESSION.ADD_MESSAGE`（`session:addMessage`）/`SESSION.STOP_STREAM`（`session:stopStream`）。祈使式命令与过去式事件（`messageAdded`）配对，`cmd:` 中缀移除，授权命令现并入 `KernelEvents.SESSION` 组。
- **发送/停止消息统一走 RPC**：原 `USER_APPLY_SEND`/`USER_APPLY_STOP`（`sessionChannel.emit` 的意图层）已移除；`createSessionFacade` 新增 `send()`/`stop()` RPC 方法，由 facade 直接 `emit(SESSION.ADD_MESSAGE/STOP_STREAM)`，`eventhandler` 仍独占命令→编排接线。至此所有 Shell→Kernel 可执行命令（含发送/停止）统一经 RPC 入口，流式 `STREAM_*` 事件仍走 IPC 通道回灌。
- **`ChatProgram._assistantMsgId` / `_currentRequest` 重复状态** → 收敛为 `orchestration/session.ts` 的 `TurnState`（`turns` Map），手动同步问题随之消除（见 §1.1 P2 修正）。
- **`ToolExecutor.ts` 绝对别名 `kernel/...`**（原 P1）→ 路径现为 `orchestration/session-tools.ts`，别名问题按 Phase 3 收敛。
- **`ToolsManager` / `CapabilityManager` 迁移 + 改注册**：先移入 `kernel/services/`，再从「构造器注入子系统」改为常规注册服务（Phase 2 `kernel.register('toolsManager'/'capabilities')`，经 `kernel.getToolsManager()`/`getCapabilities()` 访问）。Kernel 构造器仅注入 `ipc`/`storage`；shutdown 服务循环泛化为 `shutdown()` 优先、退化 `destroy()`，两 Manager 的 teardown 收敛进统一循环（原 `this.toolsManager?.destroy()` 显式调用移除）。
- **`eventhandler/` 层已移除（会话命令接线内联进 RPC facade）**：原 `eventhandler/session.ts` 把 `SESSION.ADD_MESSAGE`/`STOP_STREAM` 在同进程内由 facade emit 出来再接住转调编排，属冗余绕弯。`createSessionFacade.send()` 现直接 `runConversation(kernel, data, { onEvent: emit })`、`stop()` 直接 `cancelConversation(kernel, emit)`；`create()`/`switch()`/`delete()` 内联 `cancelConversation`（覆盖原对 `CURRENT_SESSION_CHANGED`/`SESSION_DELETED` 的订阅反应）。`background/main.ts` 移除 `registerHandlers(kernel, ipc)` 调用，`kernel/eventhandler/` 目录删除。本审计中 §1.1/§4/Phase 1/Phase 4 关于 `ChatEventHandler.ts` 孤儿文件、`eventhandler/session.ts` 接线的条目现已过时。
