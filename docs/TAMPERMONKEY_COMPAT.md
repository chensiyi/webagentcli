# Tampermonkey 兼容性升级计划

> 基于 Microkernel v0.6.6 架构的渐进式兼容方案
> 目标：实现用户脚本系统与工具系统的深度整合，兼容 Tampermonkey 核心能力

---

## 一、Tampermonkey 架构研究

### 1.1 整体架构

Tampermonkey 采用**三进程架构**：

```
┌─────────────────────────────────────────────────────────────┐
│  Background Script (background.js)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Registry (模块注册表)                                 │   │
│  │  - parser.js (脚本解析)                                │   │
│  │  - convert.js (编解码)                                 │   │
│  │  - helper.js (工具函数)                                │   │
│  │  - compat.js (兼容性)                                  │   │
│  │  - xmlhttprequest.js (网络请求)                        │   │
│  │  - syncinfo.js (同步)                                  │   │
│  │  - i18n.js (国际化)                                    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  ctxRegistry (上下文注册表)                             │   │
│  │  - 按 tabId 追踪每个标签页的状态                        │   │
│  │  - 缓存 Tab.prepare() 的预计算结果                      │   │
│  │  - 追踪每个 tab 的 URL 访问记录                         │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  TM_tabs (标签页存储)                                  │   │
│  │  - 每个 tab 独立的 storage 空间                        │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  TM_storage (持久化存储层)                             │   │
│  │  - 封装 chrome.storage.local                          │   │
│  │  - 脚本数据、配置、缓存统一管理                         │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  TM_storageListener (存储监听器)                       │   │
│  │  - 页面上下文通过 sendMessage 注册监听                  │   │
│  │  - 数据变更时通知对应 tab                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  监听器:                                                    │
│  - chrome.tabs.onUpdated → loadListener                     │
│  - chrome.tabs.onRemoved → removeListener                   │
│  - chrome.webNavigation.onCommitted → onCommitedListener    │
│  - chrome.extension.onMessage → requestHandling.handler     │
└─────────────────────────────────────────────────────────────┘
         │
         │ chrome.tabs.sendMessage({ method: "executeScript", ... })
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Content Script (content.js)                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  _handler (消息处理器)                                │   │
│  │  - sendMessage(): 将代码注入到页面上下文               │   │
│  │  - 使用 eval() 或 script 标签注入                     │   │
│  │  - 维护 responseId 回调映射                           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  tmCE (Chrome 模拟层)                                 │   │
│  │  - 桥接 background 和 page 上下文                     │   │
│  │  - xmlHttpRequest / sendExtensionMessage 等           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Eventing (事件系统)                                  │   │
│  │  - 跨上下文事件传递                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  注入方式:                                                  │
│  - 安全模式: window.eval()                                  │
│  - 非安全模式: <script> 标签注入                            │
└─────────────────────────────────────────────────────────────┘
         │
         │ eval() / <script> 注入
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Page Context (页面上下文)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  environment.js (执行环境)                            │   │
│  │  - TM_mEval(): 核心执行函数                           │   │
│  │  - 创建 mask 对象作为脚本的沙箱上下文                  │   │
│  │  - 注入 GM_* API 到 mask                             │   │
│  │  - 使用 new Function() + apply(mask) 执行脚本         │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  unsafeWindow (不安全窗口)                            │   │
│  │  - 通过 DOM 技巧获取 (div.onclick)                    │   │
│  │  - 脚本可通过 unsafeWindow 访问真实 window             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计模式

#### Registry 模块注册表

Tampermonkey 使用一个简单的**服务定位器**模式：

```javascript
Registry.register('parser', scriptParser);
Registry.require('convert');
var Converter = Registry.get('convert');
```

#### ctxRegistry 上下文注册表

按 tabId 追踪每个标签页的状态——避免重复注入、缓存预计算结果。

```javascript
var ctxRegistry = {
    n: {},
    init: function(tabId) { /* 按 tabId 初始化状态 */ },
    remove: function(tabId) { delete this.n[tabId]; },
    setCache: function(tabId, frameId, url, runInfo) { /* 缓存预计算结果 */ }
};
```

#### 注入防重复机制

1. ctxRegistry 状态追踪
2. webRequest 预计算（请求阶段确定注入列表）
3. tabs.onUpdated 只处理 status='complete'
4. tabs.onRemoved 自动清理
5. content script 自身去重（initstate 状态机）

---

## 二、当前项目状态

### 已实现的能力

| 功能 | 状态 | 位置 |
|------|------|------|
| 元数据块解析 | ✅ | `ManageUserScriptsTool.js` + `ScriptsManager.ts` |
| @match 解析 | ✅ | 同上 |
| @grant 解析 | ✅ | 同上 |
| 脚本 CRUD | ✅ | `ManageUserScriptsTool.js` + `ScriptsPage.svelte` |
| 脚本启用/禁用 | ✅ | 同上 |
| 自动注入（@match） | ✅ | `background.js` — `chrome.userScripts.register()` |
| 按需执行脚本 | ✅ | `RunUserScriptTool.js` — `chrome.userScripts.execute()` |
| CSP/Trusted Types 兼容 | ✅ | `userScripts` API 绕过限制 |

### 已知问题

| 问题 | 严重性 | 说明 |
|------|--------|------|
| @grant 权限仅解析未使用 | 🟡 中 | grant 字段已存储但未被使用 |
| 无 GM_* API 沙箱 | 🟡 中 | 脚本无法调用 GM_setValue 等 API |
| 无 @require / @resource | 🟢 低 | 未解析 |
| 无 @run-at 时机控制 | 🟢 低 | 始终 document-idle |
| 无 GM_toolscript | 🟡 中 | 脚本不能注册为 AI 工具 |
| background 逻辑耦合 | 🟡 中 | `background.js` 直接管理 `userScripts.register()` |

---

## 三、RPC 框架设计

### 3.1 架构总览

RPC 框架分为三层：

```
┌─ Kernel 服务层 ────────────────────────────────────────┐
│                                                          │
│  RPCService (kernel/services/RPCService.ts)               │
│  ┌──────────────────────────────────────────────────┐    │
│  │  基于 IPC 的通用 RPC 框架                          │    │
│  │                                                    │    │
│  │  IPC 通道:                                          │    │
│  │  - rpc:request:{target}  →  { method, params, id } │    │
│  │  - rpc:response:{target} →  { method, result, id } │    │
│  │                                                    │    │
│  │  API:                                               │    │
│  │  - registerServer(target, handlers)                 │    │
│  │  - call(target, method, params) → Promise           │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Tools 通过 RPCService.call() 调用远程方法                │
│                                                          │
└──────────────────────┬───────────────────────────────────┘
                       │ IPC 事件
                       ▼
┌─ Transport 层 ─────────────────────────────────────────┐
│                                                          │
│  BackgroundBridge (sidepanel/services/BackgroundBridge.ts)│
│  ┌──────────────────────────────────────────────────┐    │
│  │  纯传输层：IPC ↔ chrome.runtime.sendMessage       │    │
│  │                                                    │    │
│  │  职责：                                             │    │
│  │  1. 监听 rpc:request:background → sendMessage      │    │
│  │  2. 收到 background 响应 → emit rpc:response       │    │
│  │  3. 转发 GM_toolscript 主动推送 → IPC 事件          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────┬───────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─ Server 层 ────────────────────────────────────────────┐
│                                                          │
│  background.js                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  纯 RPC 服务端，不关心业务逻辑                      │    │
│  │                                                    │    │
│  │  chrome.runtime.onMessage → { rpc, params }        │    │
│  │  → 路由到 handler → 返回结果                        │    │
│  │                                                    │    │
│  │  registerRPC(method, handler) 注册方法              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 RPCService — 内核级 RPC 框架

```typescript
// kernel/services/RPCService.ts
// 基于 IPC 的通用 RPC 框架
//
// 设计原则：
// - 利用 kernel IPC 通道实现请求/响应模式
// - 服务端通过 registerServer() 注册方法
// - 客户端通过 call() 调用远程方法
// - 支持超时、错误处理

import { IPC } from '../IPC.js';
import { Log } from './Log.js';

type RPCHandler = (params: any) => Promise<any> | any;

type PendingCall = {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export class RPCService {
    private ipc: IPC;
    private _pending: Map<string, PendingCall> = new Map();
    private _servers: Map<string, Map<string, RPCHandler>> = new Map();
    private _initialized = false;
    
    constructor(ipc: IPC) {
        this.ipc = ipc;
    }
    
    /**
     * 初始化 RPC 框架
     * - 监听 rpc:request:* 事件（服务端接收请求）
     * - 监听 rpc:response:* 事件（客户端接收响应）
     */
    init(): void {
        if (this._initialized) return;
        this._initialized = true;
        
        // ─── 服务端：监听 rpc:request:{target} ───
        // 使用 IPC 的 on 监听，事件名格式: rpc:request:{target}
        // 例如: rpc:request:background
        this.ipc.on('rpc:request', (data: any, message) => {
            // 从事件名提取 target: rpc:request:background → background
            const eventParts = message.event.split(':');
            const target = eventParts[2]; // ['rpc', 'request', 'background']
            if (!target) return;
            
            const server = this._servers.get(target);
            if (!server) {
                Log.warn('RPCService', `No server registered for target: ${target}`);
                return;
            }
            
            const { method, params, requestId } = data as any;
            const handler = server.get(method);
            if (!handler) {
                Log.warn('RPCService', `No handler for ${target}.${method}`);
                this.ipc.emit(`rpc:response:${target}`, {
                    method, requestId, error: `Unknown method: ${method}`
                });
                return;
            }
            
            // 执行 handler 并返回结果
            Promise.resolve()
                .then(() => handler(params))
                .then(result => {
                    this.ipc.emit(`rpc:response:${target}`, {
                        method, requestId, result
                    });
                })
                .catch(error => {
                    this.ipc.emit(`rpc:response:${target}`, {
                        method, requestId, error: error.message
                    });
                });
        });
        
        // ─── 客户端：监听 rpc:response:{target} ───
        this.ipc.on('rpc:response', (data: any, message) => {
            const eventParts = message.event.split(':');
            const target = eventParts[2];
            if (!target) return;
            
            const { requestId, result, error } = data as any;
            const pending = this._pending.get(requestId);
            if (!pending) return;
            
            clearTimeout(pending.timeout);
            this._pending.delete(requestId);
            
            if (error) {
                pending.reject(new Error(error));
            } else {
                pending.resolve(result);
            }
        });
        
        Log.info('RPCService', 'RPC framework initialized');
    }
    
    /**
     * 注册一个 RPC 服务端
     * @param target 服务端名称（如 'background'）
     * @param handlers 方法名 → 处理函数 的映射
     */
    registerServer(target: string, handlers: Record<string, RPCHandler>): void {
        if (this._servers.has(target)) {
            Log.warn('RPCService', `Server "${target}" already registered, overwriting`);
        }
        this._servers.set(target, new Map(Object.entries(handlers)));
        Log.info('RPCService', `Server "${target}" registered with ${Object.keys(handlers).length} methods`);
    }
    
    /**
     * 调用远程 RPC 方法
     * @param target 服务端名称
     * @param method 方法名
     * @param params 参数
     * @param timeout 超时时间（毫秒）
     */
    call(target: string, method: string, params: any = {}, timeout = 30000): Promise<any> {
        return new Promise((resolve, reject) => {
            const requestId = `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const timer = setTimeout(() => {
                this._pending.delete(requestId);
                reject(new Error(`RPC call "${target}.${method}" timed out after ${timeout}ms`));
            }, timeout);
            
            this._pending.set(requestId, { resolve, reject, timeout: timer });
            
            // 发射 rpc:request:{target} 事件
            this.ipc.emit(`rpc:request:${target}`, { method, params, requestId });
        });
    }
    
    destroy(): void {
        this._pending.forEach((p) => clearTimeout(p.timeout));
        this._pending.clear();
        this._servers.clear();
        this._initialized = false;
    }
}
```

### 3.3 BackgroundBridge — 纯传输层

BackgroundBridge 不再包含业务逻辑，只做 IPC ↔ chrome.runtime.sendMessage 的翻译：

```typescript
// sidepanel/services/BackgroundBridge.ts
// 纯传输层：IPC ↔ chrome.runtime.sendMessage 的双向桥接
//
// 职责：
// 1. 监听 rpc:request:background → 转发到 background Service Worker
// 2. 收到 background 响应 → 转发回 rpc:response:background
// 3. 转发 GM_toolscript 主动推送 → IPC 事件

import { IPC } from 'kernel/IPC.js';
import { Log } from 'kernel/services/Log.js';

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export class BackgroundBridge {
    private ipc: IPC;
    private _pending: Map<string, PendingRequest> = new Map();
    private _initialized = false;
    
    constructor(ipc: IPC) {
        this.ipc = ipc;
    }
    
    init(): void {
        if (this._initialized) return;
        this._initialized = true;
        
        // ─── 转发 RPC 请求到 background ───
        this.ipc.on('rpc:request:background', (data: any) => {
            const { method, params, requestId } = data;
            
            chrome.runtime.sendMessage({ rpc: method, requestId, params }, (response) => {
                if (chrome.runtime.lastError) {
                    this.ipc.emit('rpc:response:background', {
                        method, requestId, error: chrome.runtime.lastError.message
                    });
                } else {
                    this.ipc.emit('rpc:response:background', {
                        method, requestId, ...response
                    });
                }
            });
        });
        
        // ─── 转发 GM_toolscript 主动推送 → IPC 事件 ───
        chrome.runtime.onMessage.addListener((message) => {
            switch (message.method) {
                case 'GM_toolscript_return':
                    this.ipc.emit('background:toolScriptReturn', {
                        scriptId: message.scriptId, result: message.result
                    });
                    break;
                case 'GM_toolscript_error':
                    this.ipc.emit('background:toolScriptError', {
                        scriptId: message.scriptId, error: message.message
                    });
                    break;
                case 'GM_toolscript_progress':
                    this.ipc.emit('background:toolScriptProgress', {
                        scriptId: message.scriptId, message: message.message, percentage: message.percentage
                    });
                    break;
            }
        });
        
        Log.info('BackgroundBridge', 'Transport bridge initialized');
    }
    
    destroy(): void {
        this._pending.clear();
        this._initialized = false;
    }
}
```

### 3.4 background.js — 纯 RPC 服务端

background.js 只注册 RPC 方法，不关心谁调用：

```javascript
// background.js — RPC 服务端
//
// 职责：
// 1. 注册 RPC 方法（通过 registerRPC）
// 2. 接收 chrome.runtime.onMessage 路由到对应 handler
// 3. 不包含业务逻辑，只做执行

// ─── RPC 处理器注册表 ───
const rpcHandlers = {};

function registerRPC(method, handler) {
    rpcHandlers[method] = handler;
}

// ─── 消息入口 ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.rpc) return; // 非 RPC 消息（GM_toolscript 回传等）
    
    const handler = rpcHandlers[message.rpc];
    if (!handler) {
        sendResponse({ error: `Unknown RPC method: ${message.rpc}` });
        return;
    }
    
    Promise.resolve()
        .then(() => handler(message.params, sender))
        .then(result => sendResponse({ result }))
        .catch(error => sendResponse({ error: error.message }));
    
    return true; // 异步响应
});

// ─── 注册 RPC 方法 ───

registerRPC('initAutoInject', async (params) => {
    if (_autoInjectInitialized) return { success: true };
    _autoInjectInitialized = true;
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.user_scripts) {
            syncRegisteredScripts();
        }
    });
    
    await syncRegisteredScripts();
    return { success: true };
});

registerRPC('syncUserScripts', async (params) => {
    const success = await syncRegisteredScripts();
    return { success };
});

registerRPC('GM_xmlhttpRequest', async (params) => {
    const response = await fetch(params.details.url, {
        method: params.details.method || 'GET',
        headers: params.details.headers,
        body: params.details.data
    });
    const text = await response.text();
    return { responseText: text, status: response.status };
});

registerRPC('GM_notification', async (params) => {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: params.details?.title || 'Script Notification',
        message: params.details?.text || ''
    });
    return { success: true };
});

// ─── 内部实现 ───
let _autoInjectInitialized = false;

async function syncRegisteredScripts() {
    let scripts = [];
    try {
        const result = await chrome.storage.local.get(['user_scripts']);
        scripts = result.user_scripts || [];
    } catch (e) {
        console.error('[Background] Read scripts failed:', e);
        return false;
    }
    const enabled = scripts.filter(s => s.enabled && s.match && s.match.length > 0);
    try { await chrome.userScripts.unregister(); } catch {}
    if (enabled.length === 0) return true;
    const registrations = enabled.map(s => ({
        id: s.id,
        matches: s.match,
        js: [{ code: wrapWithGM(s.code, s) }],
        world: 'MAIN',
        runAt: RUN_AT_MAP[s.runAt || 'document-idle']
    }));
    try {
        await chrome.userScripts.register(registrations);
        console.log(`[Background] Registered ${registrations.length} user scripts`);
        return true;
    } catch (e) {
        console.error('[Background] Register failed:', e);
        return false;
    }
}
```

### 3.5 工具代码调用方式

工具代码通过 `RPCService.call()` 调用 background 方法：

```javascript
// ManageUserScriptsTool.js
class ManageUserScriptsTool extends Tool {
    constructor() {
        super({
            name: 'manage_user_scripts',
            handler: async (args, context) => {
                const kernel = context?.kernel;
                const rpc = kernel?.getRPCService?.();
                const storage = kernel?.getStorageManager?.();
                if (!storage) throw new Error('Storage manager not available');
                
                // ... CRUD 操作 ...
                
                switch (args.action) {
                    case 'install':
                    case 'update':
                    case 'toggle':
                    case 'delete':
                        const script = await /* 执行 CRUD */;
                        // 通过 RPC 框架通知 background 重新注册
                        if (rpc) await rpc.call('background', 'syncUserScripts', {});
                        return script;
                }
            }
        });
    }
}
```

```javascript
// RunUserScriptTool.js
class RunUserScriptTool extends Tool {
    constructor() {
        super({
            name: 'run_user_script',
            handler: async (args, context) => {
                const kernel = context?.kernel;
                const ipc = kernel?.getIPC?.();
                
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) throw new Error('无法找到当前活动标签页');
                
                // 通过 IPC 监听 GM_toolscript 回传
                const waitForResult = new Promise((resolve, reject) => {
                    if (!ipc) return;
                    const unsubReturn = ipc.on('background:toolScriptReturn', (data) => {
                        unsubReturn(); unsubError();
                        resolve(data.result);
                    });
                    const unsubError = ipc.on('background:toolScriptError', (data) => {
                        unsubReturn(); unsubError();
                        reject(new Error(data.error));
                    });
                });
                
                await chrome.userScripts.execute({
                    target: { tabId: tab.id },
                    js: [{ code: args.code }],
                    world: 'MAIN',
                    injectImmediately: true
                });
                
                const effectiveTimeout = (typeof args.timeout === 'number' && args.timeout > 0) ? args.timeout : 300000;
                return await Promise.race([
                    waitForResult,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('脚本执行超时')), effectiveTimeout)
                    )
                ]);
            }
        });
    }
}
```

### 3.6 初始化流程

```
1. Service Worker 启动 (background.js)
   │  chrome.runtime.onMessage 监听器就绪
   │  RPC 方法已注册（initAutoInject, syncUserScripts, ...）
   │  等待 sidepanel 连接
   │
2. 用户打开 sidepanel
   │  Kernel 启动 → Bootloader.START 阶段
   │
3. main.ts START 阶段
   │  ├── 创建 RPCService(ipc).init()      ← 内核级 RPC 框架
   │  ├── 创建 BackgroundBridge(ipc).init() ← 传输层桥接
   │  ├── 注册所有工具到 ToolsManager
   │  └── 创建 ChatProgram / ChatEventHandler
   │
4. 初始化自动注入
   │  rpc.call('background', 'initAutoInject', {})
   │       → IPC emit('rpc:request:background', { method: 'initAutoInject' })
   │       → BackgroundBridge → sendMessage({ rpc: 'initAutoInject' })
   │       → background → 注册 storage.onChanged + syncRegisteredScripts()
   │       → 响应原路返回
   │
5. ManageUserScriptsTool CRUD 操作
   │  rpc.call('background', 'syncUserScripts', {})
   │       → IPC → BackgroundBridge → background → 重新 register()
   │
6. AI 调用脚本工具
   │  RunUserScriptTool → chrome.userScripts.execute()
   │  页面内脚本调用 GM_toolscript.return(result)
   │       → chrome.runtime.sendMessage({ method: 'GM_toolscript_return' })
   │       → BackgroundBridge onMessage 收到
   │       → ipc.emit('background:toolScriptReturn')
   │       → RunUserScriptTool 的 IPC 监听器 → Promise resolve
```

---

## 四、升级路线（4 阶段）

### 第一阶段：基础兼容（P0）

| 文件 | 改动 |
|------|------|
| `kernel/services/RPCService.ts` | **新文件**：基于 IPC 的通用 RPC 框架（registerServer / call） |
| `kernel/Events.ts` | 新增 `BACKGROUND` 命名空间事件常量 |
| `sidepanel/services/BackgroundBridge.ts` | **新文件**：纯传输层（IPC ↔ chrome.runtime.sendMessage） |
| `sidepanel/main.ts` | START 阶段创建 RPCService.init() + BackgroundBridge.init() |
| `background.js` | 重构为 RPC 服务端（registerRPC + 消息路由） |
| `shared/gm-api.js` | **新文件**：GM_* API 包裹 + wrapWithGM + RUN_AT_MAP |
| `sidepanel/tools/ManageUserScriptsTool.js` | CRUD 后 `rpc.call('background', 'syncUserScripts', {})` |
| `kernel/services/ScriptsManager.ts` | @grant → capability 映射 |
| `kernel/models/Scripts.ts` | UserScript 增加 `permissions` 字段 |

### 第二阶段：GM_toolscript（P0）

| 文件 | 改动 |
|------|------|
| `kernel/models/Scripts.ts` | UserScript 增加 `inputSchema?: object` |
| `kernel/services/ScriptsManager.ts` | `registerScriptTool()` 脚本→Tool 注册 |
| `kernel/ToolsManager.ts` | 脚本安装/启用时自动注册，卸载/禁用时注销 |
| `RunUserScriptTool.js` | 通过 IPC 监听 `toolScriptReturn` 等待结果 |
| `BackgroundBridge.ts` | 转发 `GM_toolscript_return` 为 IPC 事件 |
| `shared/gm-api.js` | 新增 `buildGMToolscriptAPI()` |

### 第三阶段：权限面板（P1）

| 文件 | 改动 |
|------|------|
| `ToolPanel.svelte` | 工具项增加权限按钮 |
| `ScriptPermissionDialog.svelte` | 新组件 |
| `ScriptsManager.ts` | 权限状态持久化 |

### 第四阶段：高级功能（P2）

| 文件 | 改动 |
|------|------|
| `shared/gm-api.js` | @require 预加载 |
| `background.js` | @run-at 映射 |
| `ScriptsPage.svelte` | GM_registerMenuCommand 菜单展示 |

---

## 五、UI 设计示意

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
│  ☐ 自动登录助手         [已禁用] [🔑] │
│     ↳ 匹配: *://*.login.com/*        │
└─────────────────────────────────────┘
```

---

## 六、注意事项

1. **userScripts API 是唯一执行路径**：YouTube 等站点通过 Trusted Types 策略拦截 `new Function()`、`eval()`、`<script>`。`chrome.userScripts` 使用 Chrome 内部 V8 API 编译注入，不受限制。

2. **RPCService 在内核 service 层**：基于 kernel IPC 通道实现，`registerServer()` 注册服务端，`call()` 发起远程调用。新增 background 功能只需在 `background.js` 中 `registerRPC(method, handler)`。

3. **BackgroundBridge 是纯传输层**：不包含业务逻辑，只做 IPC ↔ chrome.runtime.sendMessage 的翻译。`rpc:request:background` → sendMessage，sendMessage 响应 → `rpc:response:background`。

4. **background.js 是纯 RPC 服务端**：通过 `registerRPC()` 注册方法，`chrome.runtime.onMessage` 统一路由。不关心谁调用、不关心业务上下文。

5. **回传通道**：`userScripts.execute()` 注入的代码运行在 MAIN world，可以直接调 `chrome.runtime.sendMessage`。background 收到后通过 chrome.onMessage 传给 BackgroundBridge，后者发射 IPC 事件给等待的 Tool。