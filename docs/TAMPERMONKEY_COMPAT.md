# Tampermonkey 兼容性 + 架构升级计划

> 核心变更：Kernel 迁移到 `background/`（Service Worker），`sidepanel/` 降为纯 UI Shell
> 工具代码直接调用 Chrome API，通过 IPCTransport 跨上下文通信

---

## 一、新目录结构

```
webagentcli/
│
├── background/               ← Service Worker 入口 + Kernel 启动 + 工具
│   ├── main.ts               ← Kernel 启动入口（Vite 构建）
│   ├── gm-api.js             ← GM_* API 包裹
│   ├── tools/                ← 工具（从 sidepanel/tools 移入）
│   │   ├── RunUserScriptTool.js
│   │   └── ManageUserScriptsTool.js
│   └── services/
│       └── chromeStorage.ts
│
├── sidepanel/                ← 纯 UI Shell
│   ├── main.ts               ← IPC Client + Svelte 挂载（大幅精简）
│   ├── Sidepanel.svelte
│   ├── pages/
│   ├── components/
│   └── services/             ← Shell 层消息处理
│
│
├── kernel/                   ← 保持不变（核心框架，对上下文无感知）
│   ├── IPC.ts
│   ├── IPCTransport.ts       ← NEW: IPC 远程传输层
│   └── services/             ← ToolsManager / CapabilityManager / SessionManager 等
│
├── manifest.json             ← service_worker 指向 dist/background.bundle.js
├── vite.config.ts            ← 新增 background 构建入口
│
└── docs/
```

### 各目录职责

| 目录 | 运行在 | 职责 |
|------|--------|------|
| `background/` | Service Worker | 启动 Kernel、注册工具、调用 Chrome API |
| `sidepanel/` | Sidepanel 页面 | 渲染 UI、Shell 层事件处理、不包含业务逻辑 |
| `kernel/` | 两端 | IPC 总线、ToolsManager、服务层（上下文无感知） |

---

## 二、新架构图

```
┌─ sidepanel/ (UI Shell) ─────────────────────┐
│                                               │
│  main.ts                                      │
│  ├─ IPC Client（远程连接 background）           │
│  ├─ Svelte 挂载                               │
│  └─ Shell 事件处理                             │
│                                               │
│  IPC 事件 → IPCTransport 序列化                │
│  → chrome.runtime.sendMessage                 │
│                                               │
└──────────────────┬────────────────────────────┘
                   │ IPC over runtime
                   ▼
┌─ background/ (Service Worker) ───────────────┐
│                                               │
│  main.ts                                      │
│  ├─ IPC + IPCTransport（接收远程事件）          │
│  ├─ Bootloader → Kernel 启动                  │
│  ├─ ToolsManager                              │
│  │  ├─ RunUserScriptTool                      │
│  │  └─ ManageUserScriptsTool                  │
│  ├─ ScriptsManager                            │
│  ├─ SessionManager                            │
│  ├─ orchestration/                            │
│  └─ chromeStorage.ts (createChromeStorage)    │
│                                               │
│  工具直接调用 Chrome API                       │
│  chrome.userScripts.register()                │
│  chrome.tabs.query()                          │
│  chrome.runtime.sendMessage() ← 注入脚本回传  │
│                                               │
└────────────────────────────────────────────────┘
```

---

## 三、IPCTransport 通信流程

```
sidepanel IPC.emit('session:addMessage', { text: "hello" })
    │
    │ IPCTransport 中间件拦截
    │ → 序列化: { ipc: true, event, data, id }
    │ → chrome.runtime.sendMessage(payload)
    │
    ▼
background chrome.runtime.onMessage 收到
    │ IPCTransport onMessage 监听器
    │ → IPC.emit('session:addMessage', data, { origin: 'remote' })
    │ → Kernel 处理
    │
    │ Kernel 执行完毕
    │ → IPC.emit('session:streamComplete', result)
    │
    │ IPCTransport 中间件拦截
    │ → chrome.runtime.sendMessage(payload)
    │
    ▼
sidepanel 收到
    │ IPCTransport onMessage 监听器
    │ → IPC.emit('chat:response', result)
    │ → Svelte 组件更新 UI
```

---

## 四、迁移路线

### Step 1: 创建基础设施

| 文件 | 操作 | 说明 |
|------|------|------|
| `kernel/IPCTransport.ts` | **新建** | IPC 远程传输层（~40 行） |
| `shared/gm-api.js` | **新建** | GM_* API 包裹函数 |

### Step 2: 创建 background 目录

| 文件 | 操作 | 说明 |
|------|------|------|
| `background/main.ts` | **新建** | Vite 入口，启动完整 Kernel |
| `background/tools/RunUserScriptTool.js` | **移入** | 从 sidepanel/tools 移入 |
| `background/tools/ManageUserScriptsTool.js` | **移入** | 从 sidepanel/tools 移入 |
| `background/services/chromeStorage.ts` | **新建** | 工厂 `createChromeStorage()`，替代已删除的适配器类 |

### Step 3: 精简 sidepanel

| 文件 | 操作 | 说明 |
|------|------|------|
| `sidepanel/main.ts` | **精简** | 去掉 Kernel 启动，只做 IPC Client + UI |
| `sidepanel/tools/` | **删除** | 已移到 background/tools |
| `sidepanel/services/ChromeStorageAdapter.js` | **删除** | 已由 background/services/chromeStorage.ts 工厂取代 |

### Step 4: 构建配置

| 文件 | 操作 | 说明 |
|------|------|------|
| `vite.config.ts` | **修改** | 新增 `background` 构建入口 |
| `manifest.json` | **修改** | service_worker → `dist/background.bundle.js` |

### Step 5: 工具代码保持不变

工具通过 `context.kernel` 获取服务，对运行位置无感知。

---

## 五、注意事项

1. **`background/` 所有代码都通过 Vite 构建**：能使用 npm 依赖、TypeScript、`kernel/` 别名导入

2. **`sidepanel/` 只处理 UI 和外壳事件**：业务逻辑在 `background/` 中

3. **`kernel/IPCTransport.ts` 约 40 行**：利用 IPC 已有的中间件机制，自动转发事件

4. **Service Worker 保活**：`chrome.runtime.onMessage` 挂起请求会自动保持 SW 活跃