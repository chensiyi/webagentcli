# Tampermonkey 兼容性 + 架构升级计划

> 核心变更：Kernel 迁移到 Service Worker（background），Sidepanel 降为纯 UI Shell
> 工具代码直接调用 Chrome API，不再需要 RPC 桥接

---

## 一、新架构

### 1.1 架构图

```
┌─ Sidepanel (UI Shell) ────────────────────────┐
│                                                 │
│  Svelte 组件层                                  │
│  - 工具面板 / Chat 窗口 / 脚本管理 UI           │
│                                                 │
│  IPC Client (remote)                            │
│  kernel/IPC 的传输适配器                        │
│  IPC.emit → chrome.runtime.sendMessage          │
│  chrome.runtime.onMessage → IPC 事件            │
│                                                 │
│  不包含任何业务逻辑                              │
│  不启动 Kernel                                  │
│  不注册工具                                     │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │ IPC over runtime
                   │ （IPC 事件序列化传输）
                   ▼
┌─ Service Worker (background) ─────────────────┐
│                                                 │
│  Kernel (完整启动)                              │
│  ├─ IPC 事件总线（本地 + 远程桥接）              │
│  ├─ ToolsManager                               │
│  │  ├─ ManageUserScriptsTool                    │
│  │  ├─ RunUserScriptTool                        │
│  │  └─ ...                                      │
│  ├─ ScriptsManager                              │
│  ├─ SessionManager                              │
│  ├─ ChatProgram                                 │
│  └─ BackgroundBridge（IPC ↔ runtime 桥接）       │
│                                                 │
│  工具直接调用 Chrome API：                       │
│  chrome.userScripts.register()                  │
│  chrome.tabs.query()                            │
│  chrome.storage.local                           │
│  chrome.runtime.sendMessage()  ← 注入脚本回传   │
│                                                 │
└──────────────────────────────────────────────────┘
```

### 1.2 通信方式

```
sidepanel IPC.emit('chat:sendMessage', data)
    │
    │  IPC 中间件检测到事件目标在远端
    │  → 序列化为 JSON
    │  → chrome.runtime.sendMessage({ ipc: true, event, data })
    │
    ▼
background 收到
    │  IPC 远程桥接反序列化
    │  → IPC.emit('chat:sendMessage', data)
    │  → Kernel 处理
    │
    │  Kernel 执行完毕，IPC.emit('chat:response', result)
    │  IPC 远程桥接检测到有远端监听器
    │  → chrome.runtime.sendMessage({ ipc: true, event, data })
    │
    ▼
sidepanel 收到
    │  → IPC 远程桥接反序列化
    │  → IPC.emit('chat:response', result)
    │  → UI 更新
```

### 1.3 迁移路线

```
当前                             目标
┌──────────┐                   ┌──────────┐
│ sidepanel│                   │ sidepanel│
│ Kernel   │                   │ UI Shell │
│ IPC      │                   │ IPC Cli  │
│ Tools    │                   │          │
│ Services │                   │          │
└──────────┘                   └────┬─────┘
                                    │ IPC over runtime
┌──────────┐                   ┌────▼─────┐
│backgro.. │                   │background│
│userScri..│                   │ Kernel   │
└──────────┘                   │ IPC      │
                               │ Tools    │
                               │ Services │
                               └──────────┘
```

---

## 二、实施步骤

### Step 1: 创建 IPC 远程传输层

**文件**：`kernel/IPCTransport.ts`（新建）

将内存 IPC 桥接到 `chrome.runtime.sendMessage`，使得 IPC 事件可以跨上下文传递。

```typescript
// kernel/IPCTransport.ts
// IPC 远程传输层：使 IPC 事件能跨 Service Worker ↔ Sidepanel 传输

import { IPC, IPCMessage } from './IPC.js';

export class IPCTransport {
    private ipc: IPC;
    private _target: 'sidepanel' | 'background';
    
    constructor(ipc: IPC, target: 'sidepanel' | 'background') {
        this.ipc = ipc;
        this._target = target;
    }
    
    init(): void {
        // 监听所有 IPC 事件，通过 runtime 转发到远端
        this.ipc.use((message, next) => {
            // 已来自远端的消息不再转发回去
            if (message.origin === 'remote') return next();
            
            chrome.runtime.sendMessage({
                ipc: true,
                event: message.event,
                data: message.data,
                id: message.id
            }).catch(() => {}); // 忽略连接错误
            
            return next();
        });
        
        // 接收来自远端的消息
        chrome.runtime.onMessage.addListener((message) => {
            if (!message.ipc) return;
            
            this.ipc.emit(message.event, message.data, { origin: 'remote' });
        });
    }
}
```

### Step 2: 创建 background Kernel 入口

**文件**：`sidepanel/background.ts`（新建，Vite 构建入口）

启动完整 Kernel：

```typescript
// sidepanel/background.ts
// Service Worker 入口——启动完整 Kernel

import { IPC } from 'kernel/IPC.js';
import { Kernel } from 'kernel/Kernel.js';
import { Bootloader } from 'kernel/Bootloader.js';
import { ToolsManager } from 'kernel/ToolsManager.js';
import { CapabilityManager } from 'kernel/CapabilityManager.js';
import { ConsoleLogger } from 'kernel/services/ConsoleLogger.js';
import { SessionManager } from 'kernel/services/SessionManager.js';
import { SettingsManager } from 'kernel/services/SettingsManager.js';
import { ScriptsManager } from 'kernel/services/ScriptsManager.js';
import { ProcessManager } from 'kernel/services/ProcessManager.js';
import { ProviderFactory } from 'kernel/services/ProviderFactory.js';
import { ChatProgram } from 'kernel/programs/ChatProgram.js';
import { IPCTransport } from 'kernel/IPCTransport.js';
import { ChromeStorageAdapter } from './services/ChromeStorageAdapter.js';
import { RunUserScriptTool } from './tools/RunUserScriptTool.js';
import { ManageUserScriptsTool } from './tools/ManageUserScriptsTool.js';

async function bootBackgroundKernel() {
    const log = new ConsoleLogger();
    const ipc = new IPC({ origin: 'background-kernel' });
    const toolsManager = new ToolsManager();
    const capabilities = new CapabilityManager();
    const kernel = new Kernel({ ipc, origin: 'webagentcli-bg', toolsManager, capabilities });
    const bootloader = new Bootloader(kernel);

    // IPC 远程传输：连接 sidepanel
    const transport = new IPCTransport(ipc, 'background');
    transport.init();

    // Phase 1-3 与 sidepanel/main.ts 相同...
    // 注册 storageAdapter、sessionManager、settingsManager、scriptsManager 等
    // 注册工具
    // 创建 ChatProgram

    await bootloader.boot();
    log.info('BACKGROUND', 'Kernel boot complete');
}

chrome.runtime.onInstalled.addListener(() => {
    bootBackgroundKernel();
});
```

### Step 3: 精简 sidepanel/main.ts

去掉 Kernel 启动，只启动 IPC Client：

```typescript
// sidepanel/main.ts — UI Shell 入口
// 不再启动 Kernel，通过 IPC 远程连接 background

import { IPC } from 'kernel/IPC.js';
import { IPCTransport } from 'kernel/IPCTransport.js';

const ipc = new IPC({ origin: 'sidepanel-ui' });
const transport = new IPCTransport(ipc, 'sidepanel');
transport.init();

// IPC 事件 → Svelte Store 的绑定
// UI 组件通过 IPC 与 background Kernel 通信
```

### Step 4: 现有工具迁移

所有工具代码保持不动——它们通过 `context.kernel` 获取服务，Kernel 现在运行在 background，但工具代码无需修改。

唯一变化：`chrome.tabs.query()`、`chrome.userScripts.execute()` 等调用现在在 Service Worker 中执行，这是**正确的**——Service Worker 才有权限调用这些 API。

### Step 5: 需要解决的问题

| 问题 | 方案 |
|------|------|
| Service Worker 保活 | `chrome.runtime.onMessage` 和 `chrome.storage.onChanged` 等事件会自动唤醒 SW |
| IPC 事件序列化 | 函数引用和 DOM 对象不能跨上下文传递，需要加序列化检查 |
| Sidepanel 首次打开时 Kernel 可能未就绪 | background 启动后通过 IPC 通知 sidepanel，UI 显示加载状态 |

---

## 三、迁移清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `kernel/IPCTransport.ts` | **新建** | IPC 远程传输层 |
| 2 | `sidepanel/background.ts` | **新建** | Vite 入口，启动完整 Kernel |
| 3 | `vite.config.ts` | **修改** | 新增 background 构建入口 |
| 4 | `manifest.json` | **修改** | service_worker 指向 dist/background.bundle.js |
| 5 | `sidepanel/main.ts` | **大幅精简** | 去掉 Kernel 启动，只做 IPC Client + UI 挂载 |
| 6 | `sidepanel/tools/*.js` | **保持不变** | 工具代码通过 context.kernel 获取服务 |
| 7 | `kernel/services/*.ts` | **保持不变** | 服务代码对调用位置无感知 |

---

## 四、注意事项

1. **工具代码无需修改**：它们通过 `context.kernel` 访问服务和 Chrome API，Kernel 运行在 background 还是 sidepanel 对工具透明。

2. **IPC 传输层是唯一新增的基础设施**：`IPCTransport` 约 40 行，利用 IPC 已有的中间件机制，自动转发事件到远端。

3. **Service Worker 保活不是问题**：Chrome 在以下情况会保持 SW 活跃：`chrome.runtime.onMessage` 待处理、`chrome.storage.onChanged` 回调执行中、`fetch` 处理中等。

4. **首次加载体验**：background 启动后通过 IPC 发送 `kernel:bootComplete` 事件，sidepanel 收到后显示 UI。