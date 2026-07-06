# Tampermonkey 兼容性升级计划

> 基于 Microkernel v0.6.6 架构的渐进式兼容方案
> 目标：实现用户脚本系统与工具系统的深度整合，兼容 Tampermonkey 核心能力

---

## 一、研究摘要

### 1.1 Tampermonkey 核心模式

| 模式 | 说明 |
|------|------|
| Registry | 服务定位器：`Registry.register()` / `Registry.get()` |
| ctxRegistry | 按 tabId 追踪注入状态，避免重复注入 |
| 注入防重复 | ctxRegistry + webRequest 预计算 + tabs.onUpdated(complete) + tabs.onRemoved |
| GM_* API | 注入时包裹在脚本代码前，运行在 MAIN world，通过 `chrome.runtime.sendMessage` 与 background 通信 |

### 1.2 当前项目状态

| 功能 | 状态 | 位置 |
|------|------|------|
| 元数据块解析 | ✅ | `ManageUserScriptsTool.js` + `ScriptsManager.ts` |
| @match / @grant 解析 | ✅ | 同上 |
| 脚本 CRUD | ✅ | `ManageUserScriptsTool.js` + `ScriptsPage.svelte` |
| 自动注入（@match） | ✅ | `background.js` — `chrome.userScripts.register()` |
| 按需执行脚本 | ✅ | `RunUserScriptTool.js` — `chrome.userScripts.execute()` |
| CSP/Trusted Types 兼容 | ✅ | `userScripts` API 绕过限制 |

### 1.3 已知问题

| 问题 | 优先级 | 说明 |
|------|--------|------|
| @grant 权限仅解析未使用 | P0 | grant 字段已存储但未被使用 |
| 无 GM_* API 沙箱 | P0 | 脚本无法调用 GM_setValue 等 API |
| 无 GM_toolscript | P1 | 脚本不能注册为 AI 工具 |
| background 逻辑耦合 | P1 | `background.js` 直接管理 `userScripts.register()`，未通过 RPC |
| 无 @require / @resource | P2 | 未解析 |
| 无 @run-at 时机控制 | P2 | 始终 document-idle |
| 无权限面板 | P2 | 没有 GM_* 权限开关 UI |

---

## 二、现有资产分析

### 2.1 已有组件（不需要开发）

| 组件 | 来源 | 用途 |
|------|------|------|
| `IPC` + `getOrCreateChannel()` | `kernel/IPC.ts` | 内核事件总线，命名空间通道 |
| `ToolsManager.invoke()` | `kernel/ToolsManager.ts` | 工具执行入口 |
| `Tool` / `ToolCall` / `ToolResult` | `kernel/models/Tool.ts` | 工具模型定义 |
| `chrome.userScripts` | Chrome 内置 API | 脚本注入（已在用） |
| `chrome.runtime.sendMessage` / `onMessage` | Chrome 内置 API | 跨上下文通信（已在用） |

### 2.2 npm 选型：json-rpc-2.0

| 包名 | 版本 | 协议 | 依赖 | 说明 |
|------|------|------|------|------|
| **json-rpc-2.0** | 1.7.1 | MIT | **零依赖** | JSON-RPC 2.0 客户端/服务端实现，纯协议层 |
| @metamask/json-rpc-engine | - | - | 有依赖 | MetaMask 的 JSON-RPC 引擎，Ethereum 相关 |
| rpc | - | - | 有依赖 | 通用 RPC 库，功能过重 |

**推荐 `json-rpc-2.0`**：
- 零依赖，适合 Chrome 扩展场景
- 纯协议层：只有 `JSONRPCRequest` / `JSONRPCResponse` 类型 + `JSONRPCClient` / `JSONRPCServer`
- 只需要包装 `chrome.runtime.sendMessage` 作为传输层

---

## 三、架构设计

### 3.1 通信协议

```
JSON-RPC 2.0 over chrome.runtime.sendMessage

请求：
{
    "jsonrpc": "2.0",
    "method": "syncUserScripts",
    "params": {},
    "id": "req_123"
}

响应：
{
    "jsonrpc": "2.0",
    "result": { "success": true },
    "id": "req_123"
}

错误响应：
{
    "jsonrpc": "2.0",
    "error": { "code": -32601, "message": "Method not found" },
    "id": "req_123"
}
```

### 3.2 三层架构

```
┌─ Kernel / Sidepanel ─────────────────────────────┐
│                                                    │
│  JSONRPCClient (json-rpc-2.0)                     │
│    │                                               │
│    │  client.request('syncUserScripts', {})        │
│    │                                               │
│    │  传输适配器: chrome.runtime.sendMessage()      │
│    │                                               │
└──────────────────┬────────────────────────────────┘
                   │ chrome.runtime.sendMessage
┌─ Service Worker ──────────────────────────────────┐
│                                                    │
│  传输适配器: chrome.runtime.onMessage              │
│    │                                               │
│  JSONRPCServer (json-rpc-2.0)                     │
│    │                                               │
│    │  server.addMethod('syncUserScripts', handler) │
│    │                                               │
└────────────────────────────────────────────────────┘
```

### 3.3 json-rpc-2.0 使用示例

```typescript
// sidepanel 端（客户端）
import { JSONRPCClient } from 'json-rpc-2.0';

const client = new JSONRPCClient((request) => {
    chrome.runtime.sendMessage(request, (response) => {
        client.receive(response);
    });
});

// 调用 remote 方法
const result = await client.request('syncUserScripts', {});
```

```javascript
// background.js 端（服务端）
import { JSONRPCServer } from 'json-rpc-2.0';

const server = new JSONRPCServer();

server.addMethod('syncUserScripts', async (params) => {
    const success = await syncRegisteredScripts();
    return { success };
});

server.addMethod('initAutoInject', async (params) => {
    // 注册 storage 监听 + 首次同步
    return { success: true };
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    server.receive(request).then((response) => {
        sendResponse(response);
    });
    return true;
});
```

### 3.4 ToolsManager 注册为 Remote 方法

```typescript
// main.ts START 阶段
import { JSONRPCClient } from 'json-rpc-2.0';
import { JSONRPCServer } from 'json-rpc-2.0';

// ─── sidepanel 端：JSON-RPC 客户端 ───
const rpcClient = new JSONRPCClient((request) => {
    chrome.runtime.sendMessage(request, (response) => {
        rpcClient.receive(response);
    });
});

// ─── sidepanel 端：本地 JSON-RPC 服务端（接收 background 请求） ───
const rpcServer = new JSONRPCServer();

// 将 ToolsManager.invoke 暴露为远程 RPC 方法
rpcServer.addMethod('tools.invoke', async (params) => {
    const { toolName, input, context } = params;
    const toolCall = new ToolCall(null, toolName, input);
    const result = await toolsManager.invoke(toolCall, context || {});
    return result.toJSON();
});

rpcServer.addMethod('tools.getDefinitions', async () => {
    return toolsManager.getDefinitionsForLLM('openai');
});

// 接收 background 发来的请求（如 GM_toolscript 结果回传）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.method?.startsWith('tools.')) {
        rpcServer.receive(request).then(sendResponse);
        return true;
    }
});

// ─── 后台自动注册 ───
rpcClient.request('initAutoInject', {}).catch(() => {});
```

---

## 四、实施步骤

### Step 1: 安装依赖

```bash
npm install json-rpc-2.0
```

零依赖，TypeScript 类型内置。

### Step 2: 重构 background.js

**文件**：`background.js`（修改）

用 JSON-RPC 2.0 替代直接 switch-case：

```javascript
import { JSONRPCServer } from 'json-rpc-2.0';

const server = new JSONRPCServer();

server.addMethod('initAutoInject', async () => {
    // 注册 storage 监听 + 首次同步
});

server.addMethod('syncUserScripts', async () => {
    return { success: await syncRegisteredScripts() };
});

server.addMethod('GM_xmlhttpRequest', async (params) => {
    const resp = await fetch(params.details.url, { /* ... */ });
    return { responseText: await resp.text(), status: resp.status };
});

server.addMethod('GM_notification', async (params) => {
    chrome.notifications.create({ /* ... */ });
    return { success: true };
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    server.receive(request).then(sendResponse);
    return true; // 异步响应
});
```

### Step 3: 修改 main.ts

**文件**：`sidepanel/main.ts`（修改）

START 阶段创建 JSON-RPC 客户端 + 服务端。

### Step 4: 创建 GM API 包裹

**文件**：`shared/gm-api.js`（新建，~150 行）

GM_* API 实现，直接在 MAIN world 操作 `chrome.storage.local` 或通过 `chrome.runtime.sendMessage` 转发。

### Step 5: 更新 ManageUserScriptsTool

**文件**：`sidepanel/tools/ManageUserScriptsTool.js`（修改）

CRUD 后调用 `rpcClient.request('syncUserScripts', {})`。

### Step 6: GM_toolscript（脚本即工具）

- `ScriptsManager.registerScriptTool()` — 检测 `@grant GM_toolscript`，自动注册为 Tool
- `RunUserScriptTool` — 通过 `chrome.runtime.onMessage` 监听 `GM_toolscript_return`
- `rpcServer.addMethod('tools.invoke')` — 供 background 或其他扩展远程调用

### Step 7: 权限面板 UI

- `ToolPanel.svelte` — 权限按钮
- `ScriptPermissionDialog.svelte` — 权限开关对话框

---

## 五、改动清单

| # | 文件 | 操作 | 行数 |
|---|------|------|------|
| — | `package.json` | 新增依赖 `json-rpc-2.0` | 1 行 |
| 1 | `background.js` | **重构**：JSON-RPC 服务端模式 | ~50 行改动 |
| 2 | `sidepanel/main.ts` | **修改**：创建 rpcClient + rpcServer | ~30 行 |
| 3 | `shared/gm-api.js` | **新建**：GM_* API 包裹 | ~150 行 |
| 4 | `sidepanel/tools/ManageUserScriptsTool.js` | **修改**：CRUD + RPC 通知 | ~10 行 |
| 5 | `kernel/Events.ts` | **修改**：新增事件常量 | ~10 行 |
| 6 | `kernel/services/ScriptsManager.ts` | **修改**：GM_toolscript 注册 | — |
| 7 | `sidepanel/pages/chat/ToolPanel.svelte` | **修改**：权限按钮 | — |
| 8 | `sidepanel/components/dialogs/ScriptPermissionDialog.svelte` | **新建** | — |

---

## 六、UI 示意

```
┌─────────────────────────────────────┐
│  可用工具                     [刷新] │
│                                     │
│  ─── 内置工具 ───                    │
│  ☑ run_user_script     [已启用]      │
│  ☑ manage_user_scripts [已启用]      │
│                                     │
│  ─── 用户脚本工具 ───               │
│  ☑ 页面数据提取         [已启用] [🔑] │
│     ↳ 匹配: *://*.example.com/*      │
└─────────────────────────────────────┘
```

---

## 七、注意事项

1. **userScripts API 是唯一执行路径**：YouTube 等站点通过 Trusted Types 拦截 `new Function()`、`eval()`。`chrome.userScripts` 使用 Chrome 内部 V8 API 编译注入，不受限制。

2. **json-rpc-2.0 零依赖**：纯协议层，只有类型定义 + 客户端/服务端实现。正好满足 sidepanel ↔ background 的通信需求。

3. **JSON-RPC 2.0 是标准协议**：如果未来有其他扩展或外部客户端需要调用工具，可以直接用标准 JSON-RPC 协议通信，不需要额外适配。

4. **ToolsManager.invoke 通过 rpcServer.addMethod('tools.invoke') 暴露**：远程调用者只需知道工具名称和 inputSchema。

5. **background.js 只注册 RPC 方法**：不关心谁调用、不关心业务上下文。