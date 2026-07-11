# 代码质量审查报告 — webagentcli (v0.6.7)

> 审查范围：kernel/ (5602 行) · sidepanel/ (3850 行) · background/ · bridge/ · 构建配置
> 审查日期：2026-07-10
> 验证手段：全量阅读核心链路 + 实际执行 `npm run typecheck` / `npm test`

---

## 一、总体评价

**优点（值得保留的设计决策）：**

1. **RPC 层重构到位** — 用「单一事件名 `rpc:request` + 请求 ID 关联」彻底消灭了旧版「请求名==响应名」导致的无限递归爆栈。客户端 `createApiClient` 的 Proxy 代理、服务端 `expose` 白名单分发、`sanitizeForClone` 边界净化，构成了一套自洽、可维护的跨进程调用范式。
2. **IPCTransport 用 Port 长连接** — 解决了 MV3 最经典的「SW 被回收导致 RPC Promise 永久挂起」问题；`onDisconnect` 自动重连 + 重连后内核重推 `bootComplete`，断线自愈逻辑完整。
3. **Kernel/Bootloader/Service 分层清晰** — 依赖注入走 `register/factory` + `dependsOn` 拓扑初始化，生命周期 `boot/shutdown` 守卫完善，`onSuspend` 优雅清理考虑了 `RUNNING` 幂等。
4. **SSE 流式解析已抽公共工具** (`sse.ts`)，三份 Provider 不再各自克隆 reader 循环。
5. **测试全绿** — 120 个单测全通过，构建 ~1.4s。

**核心问题分布：** 类型系统基本关闭（致命）、1 处明确 bug、多处"空转/假安全"代码、构建配置内部矛盾、Svelte 5 响应式隐患、服务层零测试。

---

## 二、明确 Bug（高优先级）

### B1. `ToolsManager.getInvocationHistory` 的过滤是死代码
`kernel/services/ToolsManager.ts:262-272`

```ts
if (filters.toolName) r = r.filter(e => {
  const callId = e.toolCallId || '';
  return callId.includes(filters.toolName!);   // ❌ toolCallId 永远不含 toolName → 永远返回空
});
if (filters.since) r = r.filter(e => e.toolCallId && (e as any).timestamp >= filters.since); // ❌ ToolResult 无 timestamp 字段 → 永远 false
```

- `toolCallId` 形如 `tool-xxxx`，不可能 `includes(toolName)`，导致按工具名查历史永远空。
- `ToolResult` 上没有 `timestamp`（`models/Tool.ts:43-58` 只有 `duration`），`(e as any).timestamp` 永远是 `undefined`，`since` 过滤完全失效。

**修复：** 给 `ToolResult` 增加 `toolName: string` 与 `timestamp: number` 字段（`constructor` 接收、`toJSON/fromJSON` 同步、invoke 时填充 `toolName: toolCall.toolName, timestamp: Date.now()`），过滤改为精确 `e.toolName === filters.toolName` 与 `e.timestamp >= filters.since`。

---

## 三、类型与构建（高优先级）

### T1. `tsconfig` 关闭严格模式，且 `typecheck` 脚本实际是红的
- `tsconfig.json:7-8`：`strict: false` + `strictNullChecks: false`。全仓 `any` 泛滥（仅 kernel 内 `get(name): any`、facade 内 `kernel: any` 就不计其数），失去 TS 的保护意义。
- `typecheck` 脚本 (`tsc --noEmit`) **当前有 5 个编译错误**，CI/本地跑会失败：
  - `kernel/index.ts:35`：`export type` 问题（见 T3）
  - `sse.ts:22` + `OpenAIService.ts:113` + `OpenRouterService.ts:111` + `LMStudioService.ts:210`：SSE 流式类型错误（见 T2）
- `tsconfig.include` 仅 `["kernel/**/*.ts"]`，**没有覆盖 sidepanel/background/bridge**。也就是说 Shell 侧与 RPC 层完全不受类型检查保护。
- **建议：** 新建 `tsconfig.strict.json`（放宽 `include` 到全仓），分模块逐步开启 `strict`（先 `strictNullChecks`，再 `noImplicitAny`）。脚手架先行、业务代码逐步收紧，符合项目既有"分模块逐步开启"的既定策略。

### T2. SSE 流式类型错误（4 个错误的共同根因）
`kernel/services/ProviderAPIServices/sse.ts:14`

```ts
export async function forEachSSEData(
  reader: ReadableStream<Uint8Array>,   // ❌ 应为 reader，而非 stream
  onData: (json: any) => void,
  logTag: string
): Promise<void> {
  ...
  const { done, value } = await reader.read();   // ❌ ReadableStream 无 .read()，.read() 在 reader 上
```

调用方传的是 `response.body.getReader()`（返回 `ReadableStreamDefaultReader`），但参数被标成 `ReadableStream`。
**修复：** 把参数类型改为 `ReadableStreamDefaultReader<Uint8Array>`（或 `ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>` 以匹配新 lib）。一处改动同时消掉 4 个错误。

### T3. `index.ts` 值/类型混用再导出
`kernel/index.ts:35`

```ts
export { IStorageManager, BaseSettings, BaseProviderAPIService, BaseScriptsManager, BaseSessionManager };
```

其中 `IStorageManager` / `BaseProviderAPIService` / `BaseScriptsManager` / `BaseSessionManager` 是 interface（类型），在 `isolatedModules` 下必须用 `export type` 分离。
**修复：**
```ts
export { BaseSettings };
export type { IStorageManager, BaseProviderAPIService, BaseScriptsManager, BaseSessionManager };
```

### T4. `package.json` `"type": "commonjs"` 与 ESM 实践矛盾
- `package.json:22` 写 `"type": "commonjs"`，但：manifest 后台脚本 `type: module`、所有 `import` 用 `.js` 扩展名、Vite 输出 `format: 'es'`、Node 运行时也是 ESM。
- 这是历史遗留的配置噪音，会让阅读者误判模块系统。
- **修复：** 浏览器扩展不需要 Node 的 `type` 字段判定，直接删除 `"type"` 或改为 `"module"`，并加注释说明"浏览器扩展，ESM 由 Vite 处理"。

---

## 四、架构 / 设计债务（中优先级）

### A1. `CapabilityManager` 空转 = 假安全
`bridge/RPC.ts:198-202` 每次调用：`capHook('invoke', service, [m], true, {})` ——**`result` 硬编码 `true`**，且 `CapabilityManager.check/require` 的**拒绝路径零调用**。公开 API 里有 `CapabilityError` / `require` / `onDeny` 等完整"鉴权"语义，但实际从不拒绝任何调用。

**风险：** 阅读者会误以为存在能力门控；未来有人基于 `capabilities` 做安全决策会踩空。
**建议（二选一）：**
- 落地真正的门控：在 `expose` 里用 `capabilities.check(key, ...)===false` 时 reject；或
- 明确降级为"纯审计日志"，重命名为 `AuditHook`、移除 `CapabilityError/require/deny` 等误导性语义，注释写明"仅记录，不鉴权"。

### A2. `RPCServer.expose` 默认 fail-open
`bridge/RPC.ts:184`

```ts
const methods = opts.methods && opts.methods.length ? opts.methods : collectExposeMethods(impl);
```

省略 `methods` 时回落到自动收集对象上**所有函数属性**（靠 `RPC_EXPOSE_DENY` 黑名单兜底）。黑名单永远滞后于新加的方法——万一某 Manager 新增了 `shutdown/destroy/reset` 之类，漏写白名单就会把危险方法暴露到跨进程边界。当前 5 处都显式白名单所以受控，但这是脆弱的默认行为。
**建议：** 默认 **fail-closed**——省略 `methods` 时直接抛错/告警，要求显式声明；如确需自动收集，用显式 `allowAutoCollect: true` 开关打开。

### A3. Shell 侧 `ipc` 以 `unknown` 注入 context，类型链断裂
`sidepanel/Sidepanel.svelte:36` `setContext('ipc', ipc)` 但 `ipc` 被注解为 `unknown`，导致每个子组件都要 `(ipc as any).on(...)`。
**建议：** 封装一个强类型 context helper：
```ts
// shell-context.ts
import type { IPC } from 'kernel/IPC.js';
import { getContext, setContext } from 'svelte';
export const IPC_KEY = Symbol('ipc');
export const setIpc = (ipc: IPC) => setContext(IPC_KEY, ipc);
export const getIpc = () => getContext<IPC>(IPC_KEY);
```

### A4. `rpc-facades.ts` 脆弱链式可选调用 + 每次 getCurrent 全量查 settings
`background/rpc-facades.ts:28` `kernel?.getSettingsManager?.()?.getSettings?.()` —— `kernel` 在 facade 内其实已确定非 null，可选链纯属防御性噪音；且 `sessionView` 每次被调都重新 `getSettings()` 全量读取。
**建议：** facade 构造时持有 `settingsManager` 引用；`reasoningEffort` 这类低频配置可缓存（settings 变更走事件失效）。

### A5. 内置工具注册依赖隐式初始化时序
`background/main.ts:183` `kernel.getToolsManager()` 在 Phase START 取实例，依赖 Phase REGISTER 已 register 且 `boot()` 内部 init 顺序。当前可用但脆弱。
**建议：** 把"注册内置工具"收敛为 `ToolsManager` 自身职责或一个显式 Bootloader 钩子，避免 main.ts 隐式依赖 boot 内部顺序。

---

## 五、代码质量 / 一致性（低-中优先级）

### C1. Svelte 5 响应式隐患（已确认会偶发）
`sidepanel/components/forms/CodeEditor.svelte:22,23`
```ts
let containerEl: HTMLDivElement;   // ❌ 非 $state
let editorView: any = null;        // ❌ 非 $state
```
`$effect`（line 32/112）读取了这两个变量，但非 `$state` 的 `let` 在 Svelte 5 runes 下**不被追踪**。`bind:this={containerEl}` 的赋值不触发 effect 重跑——编辑器初始化依赖挂载时序，存在偶发"编辑器永远不渲染"的风险。`editorView` 同理（异步加载完成后 effect 不会因它重新同步）。
**修复：** `let containerEl = $state<HTMLDivElement>();` 与 `let editorView = $state<any>(null);`。

### C2. `RPCClient._onResponse` 吞掉错误栈
`bridge/RPC.ts:132` `reject(new Error(payload.error?.message || 'RPC error'))` —— 服务端明明回了 `error.stack`，客户端丢弃了，调试时只能看到一句 message。
**建议：** `reject(Object.assign(new Error(...), { stack: payload.error?.stack }))` 或直接透传 error 对象。

### C3. `Kernel.get(name): any` 破坏类型链
`kernel/Kernel.ts:116` 建议改为 `get<T = any>(name: string): T`，调用方 `kernel.get<ToolsManager>('toolsManager')` 即可去掉大量 `as`。`getToolsManager()` 等强类型 getter 已存在，但 `get` 通用入口仍是 `any`。

### C4. 自研 JSON-Schema 校验覆盖不全
`ToolsManager._validateArgs` 只校验顶层 `type`/`enum`/`required`，**不支持嵌套 object、array item、additionalProperties**。长期建议引入 `ajv`（按需 import 控制体积）；短期至少在 tool handler 入口补一层运行时校验，避免 LLM 传入畸形参数导致 handler 抛无法定位的错。

### C5. `sanitizeForClone` 边界场景静默丢数据
`bridge/serialize.ts`：`bigint → Number` 会静默溢出；`Symbol → null` 无记录；超大 `Map/Set` 无大小上限告警。对已知大 payload（如长对话 messages 数组）每次 IPC 边界都递归净化有性能成本。
**建议：** 对 `Map/Set` 加大小上限 + warn；对大数组（messages）考虑针对性轻量克隆或标记跳过以降成本。

---

## 六、测试覆盖（中优先级）

120 个测试全在**叶子层**（`models/*`、`IPC`、`bridge`、`orchestration/request`），以下**核心服务零测试**：
- `SessionManager` / `SettingsManager` / `ScriptsManager` / `ProcessManager` / `ProviderFactory`
- `ChatProgram` / `ToolExecutor` / `ToolsManager` / `CapabilityManager`

而这些恰好是最容易回归的地方（恰好 B1 的 bug 就藏在 `ToolsManager` 里，且零测试拦截）。
**建议：** 优先给 `ToolsManager.invoke`（含校验/钩子/历史记录）、`CapabilityManager`（check/require/audit）、`SessionManager`（create/switch/transient 丢弃）补单测——它们依赖少、可纯 Node 测、ROI 最高。

---

## 七、优先级排序与建议落地顺序

| 优先级 | 项 | 工作量 | 影响 |
|---|---|---|---|
| P0 | B1 `getInvocationHistory` 死过滤 | 小（加字段+改两行） | 修一个真实 bug |
| P0 | T2 SSE 类型 + T3 类型再导出（消掉 typecheck 红） | 小 | 让 typecheck 真正可用 |
| P1 | T4 `package.json type` 矛盾 | 极小 | 消除误导 |
| P1 | A1 CapabilityManager 假安全（二选一落地） | 中 | 安全语义正确 |
| P1 | A2 expose 默认 fail-closed | 小 | 防未来误暴露 |
| P1 | C1 CodeEditor `$state` 响应式 | 极小 | 修偶发不渲染 |
| P2 | T1 全仓 strict + 扩展 tsconfig include | 大 | 长期质量基线 |
| P2 | A3 强类型 context / C3 `get<T>` | 小 | 类型链连贯 |
| P2 | 六、核心服务补单测 | 中 | 防回归 |
| P3 | A4/A5/C2/C4/C5 打磨项 | 中 | 一致性/性能 |

---

## 八、一句话总结

> 这套代码**架构骨架是 senior 级别的**，但被"关闭的严格类型 + 几处空转/假安全逻辑 + 一个真实 bug"拉低了下限。先把 typecheck 跑绿、修掉 B1、把 CapabilityManager 从"假安全"变成"真安全或明确审计"，性价比最高；再逐步把 `strict` 打开、补核心服务测试，代码质量会有一个明显的台阶式提升。

需要我直接动手修其中哪几项？（推荐从 P0 的 B1 + T2/T3 开始，能立刻让 `typecheck` 通过并消除一个真实 bug。）
