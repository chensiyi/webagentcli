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

## 三、背景通信架构：BackgroundBridge

### 3.1 多上下文问题

项目横跨两个 JS 执行上下文：

```
┌─ Sidepanel (Svelte App) ─────────────────────────────┐
│                                                        │
│  Kernel (IPC 事件总线)                                  │
│    │                                                    │
│    │  ToolsManager  /  ScriptsManager  /  ChatProgram   │
│    │                                                    │
│    │  工具 handler 中不能直接调 chrome.userScripts       │
│    │  （userScripts API 只能在 Service Worker 调用）     │
│    │                                                    │
│    └──→ 需要桥接到 background Service Worker             │
│                                                        │
└──────────────────────┬─────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─ Service Worker (background.js) ──────────────────────┐
│                                                        │
│  chrome.userScripts.register() / .execute()             │
│  chrome.storage.local (直接访问)                       │
│  chrome.tabs / chrome.notifications                    │
│                                                        │
│  只能通过 chrome.runtime.onMessage 接收指令              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 3.2 BackgroundBridge 设计

为 background 操作定义一个**标准 IPC 通道**，让工具代码通过 kernel IPC 发送`background:*`事件，由 `BackgroundBridge` 统一翻译为 `chrome.runtime.sendMessage`：

```
工具/服务 代码
    │
    │  kernel.ipc.emit('background:syncUserScripts', { scripts })
    │
    ▼
BackgroundBridge (sidepanel/services/BackgroundBridge.ts)
    │
    │  监听 background:* 事件
    │  翻译为 chrome.runtime.sendMessage({ method: 'syncUserScripts', ... })
    │  等待 background 响应
    │  通过 IPC 回传结果
    │
    ▼
background.js
    │
    │  chrome.runtime.onMessage 处理
    │  chrome.userScripts.register()
    │  chrome.storage.local
    │  返回结果
    │
    ▼
BackgroundBridge 收到响应 → IPC emit('background:syncUserScripts:result')
    │
    ▼
原始工具代码通过 Promise 拿到结果
```

### 3.3 事件定义

在 `kernel/Events.ts` 中新增 `BACKGROUND` 命名空间：

```typescript
// kernel/Events.ts 新增
export const KernelEvents = {
  // ... 现有事件 ...
  
  BACKGROUND: {
    // ─── 初始化 ───
    INIT_AUTO_INJECT:        'background:initAutoInject',        // 初始化自动注入
    INIT_AUTO_INJECT_RESULT: 'background:initAutoInject:result', // 初始化结果
    
    // ─── 脚本同步 ───
    SYNC_USER_SCRIPTS:        'background:syncUserScripts',        // 同步注册所有脚本
    SYNC_USER_SCRIPTS_RESULT: 'background:syncUserScripts:result', // 同步结果
    
    // ─── GM_toolscript 回传 ───
    TOOL_SCRIPT_RETURN:  'background:toolScriptReturn',   // 脚本工具结果回传
    TOOL_SCRIPT_ERROR:   'background:toolScriptError',    // 脚本工具错误回传
    TOOL_SCRIPT_PROGRESS:'background:toolScriptProgress', // 脚本工具进度
    
    // ─── GM_* API 代理 ───
    GM_XMLHTTP_REQUEST:        'background:gmXmlhttpRequest',        // GM_xmlhttpRequest
    GM_XMLHTTP_REQUEST_RESULT: 'background:gmXmlhttpRequest:result', // 请求结果
    GM_NOTIFICATION:           'background:gmNotification',           // GM_notification
  },
};
```

### 3.4 BackgroundBridge 实现

```typescript
// sidepanel/services/BackgroundBridge.ts
// 职责：IPC 事件 ↔ chrome.runtime.sendMessage 的双向桥接
//
// 设计原则：
// - 只做事件翻译，不包含业务逻辑
// - 所有 background:* 事件统一处理
// - 支持请求-响应模式（带 Promise 等待）

import { IPC } from 'kernel/IPC.js';
import { KernelEvents } from 'kernel/Events.js';
import { Log } from 'kernel/services/Log.js';

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export class BackgroundBridge {
    private ipc: IPC;
    private _pendingRequests: Map<string, PendingRequest> = new Map();
    private _initialized = false;
    
    constructor(ipc: IPC) {
        this.ipc = ipc;
    }
    
    /**
     * 初始化桥接：
     * 1. 监听 background:* IPC 事件
     * 2. 设置 chrome.runtime.onMessage 接收 background 响应
     */
    init(): void {
        if (this._initialized) return;
        this._initialized = true;
        
        // ─── 监听 IPC 事件 → 转发到 background ───
        
        // 初始化自动注入
        this.ipc.on(KernelEvents.BACKGROUND.INIT_AUTO_INJECT, async (data) => {
            try {
                const result = await this._sendToBackground('initAutoInject', data);
                this.ipc.emit(KernelEvents.BACKGROUND.INIT_AUTO_INJECT_RESULT, result);
            } catch (e) {
                this.ipc.emit(KernelEvents.BACKGROUND.INIT_AUTO_INJECT_RESULT, { error: (e as Error).message });
            }
        });
        
        // 同步用户脚本
        this.ipc.on(KernelEvents.BACKGROUND.SYNC_USER_SCRIPTS, async (data) => {
            try {
                const result = await this._sendToBackground('syncUserScripts', data);
                this.ipc.emit(KernelEvents.BACKGROUND.SYNC_USER_SCRIPTS_RESULT, result);
            } catch (e) {
                this.ipc.emit(KernelEvents.BACKGROUND.SYNC_USER_SCRIPTS_RESULT, { error: (e as Error).message });
            }
        });
        
        // GM_xmlhttpRequest
        this.ipc.on(KernelEvents.BACKGROUND.GM_XMLHTTP_REQUEST, async (data) => {
            try {
                const result = await this._sendToBackground('GM_xmlhttpRequest', data);
                this.ipc.emit(KernelEvents.BACKGROUND.GM_XMLHTTP_REQUEST_RESULT, result);
            } catch (e) {
                this.ipc.emit(KernelEvents.BACKGROUND.GM_XMLHTTP_REQUEST_RESULT, { error: (e as Error).message });
            }
        });
        
        // GM_notification（无需等待响应）
        this.ipc.on(KernelEvents.BACKGROUND.GM_NOTIFICATION, (data) => {
            chrome.runtime.sendMessage({ method: 'GM_notification', ...data }).catch(() => {});
        });
        
        // ─── 监听 background 主动推送到 sidepanel ───
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // GM_toolscript_return 是脚本在页面执行后通过 background 转发回来的
            if (message.method === 'GM_toolscript_return') {
                this.ipc.emit(KernelEvents.BACKGROUND.TOOL_SCRIPT_RETURN, {
                    scriptId: message.scriptId,
                    result: message.result
                });
            }
            if (message.method === 'GM_toolscript_error') {
                this.ipc.emit(KernelEvents.BACKGROUND.TOOL_SCRIPT_ERROR, {
                    scriptId: message.scriptId,
                    error: message.message
                });
            }
            if (message.method === 'GM_toolscript_progress') {
                this.ipc.emit(KernelEvents.BACKGROUND.TOOL_SCRIPT_PROGRESS, {
                    scriptId: message.scriptId,
                    message: message.message,
                    percentage: message.percentage
                });
            }
        });
        
        Log.info('BackgroundBridge', 'Bridge initialized');
    }
    
    /**
     * 发送请求到 background 并等待响应
     */
    private _sendToBackground(method: string, data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const requestId = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const timeout = setTimeout(() => {
                this._pendingRequests.delete(requestId);
                reject(new Error(`Background request "${method}" timed out`));
            }, 30000);
            
            this._pendingRequests.set(requestId, { resolve, reject, timeout });
            
            chrome.runtime.sendMessage({ method, requestId, ...data }, (response) => {
                const pending = this._pendingRequests.get(requestId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this._pendingRequests.delete(requestId);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                }
            });
        });
    }
    
    destroy(): void {
        this._pendingRequests.forEach((p) => clearTimeout(p.timeout));
        this._pendingRequests.clear();
        this._initialized = false;
    }
}
```

### 3.5 background.js 对应处理

```javascript
// background.js — 只做消息处理，无业务逻辑
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.method) {
        case 'initAutoInject':
            initAutoInject().then(() => sendResponse({ success: true }));
            return true;
            
        case 'syncUserScripts':
            syncRegisteredScripts().then((r) => sendResponse({ success: r }));
            return true;
            
        case 'GM_xmlhttpRequest':
            fetch(message.details.url, {
                method: message.details.method || 'GET',
                headers: message.details.headers,
                body: message.details.data
            })
            .then(r => r.text())
            .then(body => sendResponse({ responseText: body, status: 200 }))
            .catch(e => sendResponse({ status: 0, error: e.message }));
            return true;
            
        case 'GM_notification':
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon128.png',
                title: message.details?.title || 'Script Notification',
                message: message.details?.text || ''
            });
            break;
    }
});

let _autoInjectInitialized = false;

async function initAutoInject() {
    if (_autoInjectInitialized) return;
    _autoInjectInitialized = true;
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.user_scripts) {
            syncRegisteredScripts();
        }
    });
    
    await syncRegisteredScripts();
}

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

---

## 四、工具逻辑改造

### 4.1 ManageUserScriptsTool — 通过 IPC 通知 background

```javascript
// ManageUserScriptsTool.js — 改造后
// CRUD 操作后不再直接调 chrome.runtime.sendMessage，而是发射 IPC 事件

class ManageUserScriptsTool extends Tool {
    constructor() {
        super({
            name: 'manage_user_scripts',
            // ... 定义保持不变 ...
            handler: async (args, context) => {
                const kernel = context?.kernel;
                const ipc = kernel?.getIPC?.();
                const storage = kernel?.getStorageManager?.();
                if (!storage) throw new Error('Storage manager not available');
                
                const getAllScripts = () => storage.get(STORAGE_KEY).then(v => v || []);
                const saveScripts = (scripts) => storage.set(STORAGE_KEY, scripts);
                
                // ... parseMetadata, getScriptById 等辅助函数 ...
                
                switch (args.action) {
                    case 'install': {
                        const script = await installScript(args.code);
                        if (ipc) ipc.emit('background:syncUserScripts', {});  // ← IPC 事件
                        return script;
                    }
                    case 'update': {
                        const script = await updateScriptCode(args.id, args.code);
                        if (ipc) ipc.emit('background:syncUserScripts', {});
                        return script;
                    }
                    case 'toggle': {
                        const script = await toggleScript(args.id, args.enabled);
                        if (ipc) ipc.emit('background:syncUserScripts', {});
                        return script;
                    }
                    case 'delete': {
                        await removeScript(args.id);
                        if (ipc) ipc.emit('background:syncUserScripts', {});
                        return { success: true, id: args.id };
                    }
                    // list, get 不需要通知 background
                }
            }
        });
    }
}
```

### 4.2 ScriptsManager — 脚本工具注册时初始化 Bridge

```typescript
// ScriptsManager.ts — 新增方法
async initScriptAutoInject(ipc: IPC): Promise<void> {
    // 通过 IPC 触发 BackgroundBridge 初始化
    ipc.emit('background:initAutoInject', {});
}
```

### 4.3 RunUserScriptTool — 等待 GM_toolscript 回传

```javascript
// RunUserScriptTool.js — 使用 IPC 监听 GM_toolscript 回传
// 不需要直接调 chrome.runtime.*，由 BackgroundBridge 转发

class RunUserScriptTool extends Tool {
    constructor() {
        super({
            name: 'run_user_script',
            // ...
            handler: async (args, context) => {
                const kernel = context?.kernel;
                const ipc = kernel?.getIPC?.();
                const { code, world = 'MAIN', timeout } = args || {};
                
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) throw new Error('无法找到当前活动标签页');
                
                // 监听 GM_toolscript 回传（通过 IPC，由 BackgroundBridge 转发）
                const waitForResult = new Promise((resolve, reject) => {
                    if (!ipc) {
                        // 无 IPC 时直接执行（降级）
                        resolve(await executeDirect(tab.id, code));
                        return;
                    }
                    
                    const unsubReturn = ipc.on('background:toolScriptReturn', (data) => {
                        unsubReturn();
                        unsubError();
                        resolve(data.result);
                    });
                    const unsubError = ipc.on('background:toolScriptError', (data) => {
                        unsubReturn();
                        unsubError();
                        reject(new Error(data.error));
                    });
                });
                
                // 通过 userScripts.execute 注入
                await chrome.userScripts.execute({
                    target: { tabId: tab.id },
                    js: [{ code }],
                    world: 'MAIN',
                    injectImmediately: true
                });
                
                const effectiveTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 300000;
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

---

## 五、初始化流程

```
1. Service Worker 启动 (background.js)
   │  chrome.runtime.onMessage 监听器就绪
   │  等待 sidepanel 发送 initAutoInject
   │
2. 用户打开 sidepanel
   │  Kernel 启动 → Bootloader.START 阶段
   │
3. main.ts START 阶段
   │  ├── 注册所有工具到 ToolsManager
   │  ├── 创建 ChatProgram / ChatEventHandler
   │  └── 创建 BackgroundBridge(ipc).init()
   │       │  ── 监听 background:* IPC 事件
   │       │  ── 设置 chrome.runtime.onMessage 接收响应
   │       │  ── 发射 background:initAutoInject
   │       │       │
   │       │       ▼ BackgroundBridge 翻译 → sendMessage('initAutoInject')
   │       │       │
   │       │       ▼ background.js 收到 → 注册 storage.onChanged + syncRegisteredScripts()
   │       │
   │       └── 初始化完成
   │
4. ManageUserScriptsTool CRUD 操作
   │  ipc.emit('background:syncUserScripts')
   │       │
   │       ▼ BackgroundBridge → sendMessage('syncUserScripts')
   │       │
   │       ▼ background.js → chrome.userScripts.unregister() + register()
   │
5. AI 调用脚本工具
   │  RunUserScriptTool → chrome.userScripts.execute()
   │  页面内脚本调用 GM_toolscript.return(result)
   │       │
   │       ▼ chrome.runtime.sendMessage({ method: 'GM_toolscript_return' })
   │       │
   │       ▼ BackgroundBridge 的 onMessage 监听收到
   │       │  ipc.emit('background:toolScriptReturn', { scriptId, result })
   │       │
   │       ▼ RunUserScriptTool 的 IPC 监听器收到 → Promise resolve
   │
   │  AI 继续 ReAct 循环
```

---

## 六、升级路线（4 阶段）

### 第一阶段：基础兼容（P0）

| 文件 | 改动 |
|------|------|
| `kernel/Events.ts` | 新增 `BACKGROUND` 命名空间事件常量 |
| `sidepanel/services/BackgroundBridge.ts` | **新文件**：IPC ↔ chrome.runtime.sendMessage 桥接 |
| `sidepanel/main.ts` | START 阶段创建 `BackgroundBridge(ipc).init()` |
| `background.js` | 重构为消息代理模式：`onMessage` 处理 + `syncRegisteredScripts()` |
| `shared/gm-api.js` | **新文件**：GM_* API 包裹 + wrapWithGM + RUN_AT_MAP |
| `sidepanel/tools/ManageUserScriptsTool.js` | CRUD 后 `ipc.emit('background:syncUserScripts')` |
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

## 七、UI 设计示意

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

## 八、注意事项

1. **userScripts API 是唯一执行路径**：YouTube 等站点通过 Trusted Types 策略拦截 `new Function()`、`eval()`、`<script>`。`chrome.userScripts` 使用 Chrome 内部 V8 API 编译注入，不受限制。

2. **BackgroundBridge 是唯一的跨上下文通道**：所有 sidepanel ↔ background 通信统一走 `background:*` IPC 事件 → BackgroundBridge → `chrome.runtime.sendMessage`。工具代码不直接调 `chrome.runtime.*`。

3. **事件命名规范**：`background:{action}` 用于请求，`background:{action}:result` 用于响应。与 `chat:`、`settings:` 等命名空间保持一致。

4. **IPC 事件在 `kernel/Events.ts` 定义**：所有 `background:*` 事件常量统一在 `KernelEvents.BACKGROUND` 中定义，Shell 层消息集中管理。

5. **回传通道**：`userScripts.execute()` 注入的代码运行在 MAIN world，可以直接调 `chrome.runtime.sendMessage`。background 收到后通过 chrome.onMessage 传给 BackgroundBridge，后者发射 IPC 事件给等待的 Tool。