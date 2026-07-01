# Svelte 5 UI 现代化改造方案

> 日期: 2026-07-01 | 版本: 0.6.0 | 目标框架: Svelte 5 (Runes)

---

## 进度总览

| 阶段 | 状态 | 产出 |
|------|------|------|
| **Phase 1: 基础建设** | ✅ 完成 | 双入口 Vite、Svelte 5 空壳 App、Kernel Context 注入 |
| **Phase 2: 组件重构** | ⏳ 待开始 | UI 通用组件 (Button/Input/Dialog 等) |
| **Phase 3: SettingsPage** | ⏳ 待开始 | 表单迁移 |
| **Phase 4: 列表页面** | ⏳ 待开始 | History/Storage/Scripts |
| **Phase 5: ChatPage** | ⏳ 待开始 | 核心流式渲染 |
| **Phase 6: 清理** | ⏳ 待开始 | 移除旧代码 |

### Phase 1 实际产出

- **依赖**: svelte 5.56.4 + @sveltejs/vite-plugin-svelte 7.1.2
- **配置**: svelte.config.mjs, vite.config.ts (双入口), tsconfig.json (src/)
- **入口**: sidepanel/svelte-app.html → dist/svelte-app.bundle.js (49KB, gzip 19KB)
- **核心文件**: 
  - `src/main.ts` — Kernel 自举启动 (与 app.js 同等服务注册)
  - `src/App.svelte` — 根组件 (Sidebar + 5 页路由)
  - `src/lib/kernel-context.ts` — Svelte Context API 封装
  - `src/lib/types.ts` — PageId/PageDef 类型
  - `src/components/ui/Sidebar.svelte` — 主导航
  - `src/pages/*.svelte` — 5 个占位桩 (Kernel 注入已验证)
- **修复**: OpenRouterService.ts + LMStudioService.ts 的 2 个遗留语法 bug
- **测试**: 5/5 通过，无回归

---

## 一、为什么选 Svelte 5

| 维度 | Svelte 5 优势 |
|------|--------------|
| **包体积** | 编译时消融，0KB runtime 增量，扩展场景最优 |
| **CSS** | 内置 Scoped 样式，无需 CSS Modules，单文件组件 |
| **流式渲染** | `$state` 响应式原语 + 直接赋值，无 setState 调用 |
| **学习成本** | 模板语法接近原生 HTML，团队上手快 |
| **Vite 集成** | `@sveltejs/vite-plugin-svelte` 官方插件，开箱即用 |
| **Runes** | `$state` / `$derived` / `$effect` / `$props` 统一响应式模型 |

---

## 二、目录结构

```
webagentcli/
├── src/                          # 新建: Svelte 源码
│   ├── main.ts                   # 入口: mount Svelte app
│   ├── app.css                   # 全局样式 (导入 variables.css)
│   ├── App.svelte                # 根组件 (Sidebar + 路由)
│   ├── pages/
│   │   ├── ChatPage.svelte       # 对话页面
│   │   ├── HistoryPage.svelte    # 历史页面
│   │   ├── StoragePage.svelte    # 存储页面
│   │   ├── ScriptsPage.svelte    # 脚本页面
│   │   └── SettingsPage.svelte   # 设置页面
│   ├── components/
│   │   ├── chat/
│   │   │   ├── MessageList.svelte
│   │   │   ├── MessageBubble.svelte
│   │   │   ├── ChatInput.svelte
│   │   │   ├── ToolCallCard.svelte
│   │   │   ├── ToolResultCard.svelte
│   │   │   └── ThinkingControl.svelte
│   │   └── ui/
│   │       ├── Button.svelte
│   │       ├── Input.svelte
│   │       ├── Textarea.svelte
│   │       ├── Select.svelte
│   │       ├── Checkbox.svelte
│   │       ├── Toggle.svelte
│   │       ├── Badge.svelte
│   │       ├── Card.svelte
│   │       ├── Dialog.svelte
│   │       ├── Toast.svelte
│   │       ├── EmptyState.svelte
│   │       ├── SearchInput.svelte
│   │       ├── Pagination.svelte
│   │       └── CodeEditor.svelte  # CodeMirror 6 封装
│   ├── stores/
│   │   ├── kernel.context.ts     # Kernel Context (Svelte context API)
│   │   ├── chat.svelte.ts        # 聊天状态 (messages, streaming)
│   │   ├── settings.svelte.ts    # 设置状态
│   │   └── theme.svelte.ts       # 主题状态
│   └── lib/
│       ├── ipc.ts                # IPC 事件桥接工具函数
│       ├── extractText.ts        # 内容提取
│       └── types.ts              # 共享类型定义
├── sidepanel/
│   ├── theme/variables.css       # 保留: 全局 CSS 变量
│   ├── sidepanel.html            # 更新: 只保留 error-handler + bundle
│   └── js/app.js                 # 旧入口，最终删除
├── kernel/                       # 不变
├── vite.config.ts                # 更新: 多入口 + Svelte 插件
└── tsconfig.json                 # 更新: 包含 src/ + svelte 类型
```

---

## 三、技术架构

### 3.1 双入口策略（过渡期）

```ts
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      // 旧入口 — 保留现有功能，确保不 blocking
      sidepanel: resolve(__dirname, 'sidepanel/js/app.js'),
      // 新入口 — Svelte 应用
      svelte: resolve(__dirname, 'src/main.ts'),
    },
    output: {
      entryFileNames: '[name].bundle.js',
      format: 'es',
    },
  },
},
```

`sidepanel.html` 按需切换入口：

```html
<!-- 过渡期: 加载旧版 -->
<script type="module" src="../dist/sidepanel.bundle.js"></script>

<!-- 完成后切换: 加载 Svelte 版 -->
<!-- <script type="module" src="../dist/svelte.bundle.js"></script> -->
```

### 3.2 Kernel 集成方式

Svelte 中通过 **Svelte Context API** 传递 Kernel 实例，避免全局变量污染：

```svelte
<!-- App.svelte -->
<script>
  import { setContext } from 'svelte';
  import { initKernel } from './lib/initKernel';
  import Sidebar from './components/Sidebar.svelte';
  import ChatPage from './pages/ChatPage.svelte';

  let { kernel, bootloader } = await initKernel();
  setContext('kernel', kernel);
  setContext('bootloader', bootloader);

  let currentPage = $state('chat');
</script>

<div class="app-container">
  <main class="content-area">
    {#if currentPage === 'chat'}
      <ChatPage />
    {/if}
    <!-- ... -->
  </main>
  <Sidebar {currentPage} onNavigate={(p) => currentPage = p} />
</div>
```

任何子组件通过 `getContext('kernel')` 获取：

```svelte
<script>
  import { getContext } from 'svelte';
  const kernel = getContext('kernel');
</script>
```

### 3.3 IPC 事件 → Svelte 响应式

用 Svelte 5 的 `$state` rune 做事件桥接：

```ts
// stores/chat.svelte.ts — Svelte 5 .svelte.ts 模块
import { getContext } from 'svelte';

export function createChatStore(kernel: Kernel) {
  let messages = $state<Message[]>([]);
  let isStreaming = $state(false);
  let streamContent = $state('');

  const ipc = kernel.getIPC();
  const channel = ipc.getOrCreateChannel('chat');

  channel.on('chat:streamChunkAppend', (data) => {
    streamContent += data.content;
  });

  channel.on('chat:streamComplete', () => {
    isStreaming = false;
  });

  return {
    get messages() { return messages; },
    get isStreaming() { return isStreaming; },
    get streamContent() { return streamContent; },
    // ...
  };
}
```

### 3.4 CSS 策略

| 层 | 文件 | 作用 |
|----|------|------|
| **全局** | `sidepanel/theme/variables.css` | CSS 变量 + reset + 通用工具类 |
| **全局** | `src/app.css` | 应用级布局 (sidebar, content-area) |
| **Scoped** | 各 `.svelte` 的 `<style>` | 组件内部样式，自动 hash 隔离 |
| **全局覆盖** | `:global()` | 仅在 markdown 渲染、CodeMirror 主题等需要时使用 |

```svelte
<!-- MessageBubble.svelte -->
<style>
  .bubble {
    padding: 12px;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }
  .bubble.user {
    background: var(--color-primary);
    color: white;
    align-self: flex-end;
  }

  /* markdown 渲染内容用 :global */
  :global(.message-content pre) {
    background: var(--color-bg-code);
    padding: 8px;
    border-radius: 4px;
  }
</style>
```

---

## 四、组件设计速览

### 4.1 UI 基础组件（替代 UI.js）

```svelte
<!-- components/ui/Button.svelte -->
<script>
  let { variant = 'primary', size = 'medium', disabled = false, onclick, ...rest } = $props();
</script>

<button
  class="btn btn-{variant} btn-{size}"
  {disabled}
  {onclick}
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .btn { /* Scoped 样式 */ }
  .btn-primary { background: var(--color-primary); }
  .btn-small { padding: 4px 12px; font-size: 12px; }
</style>
```

### 4.2 Toast 通知（替代 toast.js）

```svelte
<!-- components/ui/Toast.svelte -->
<script>
  let toasts = $state([]);

  export function show(message, type = 'info', duration = 3000) {
    const id = crypto.randomUUID();
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, duration);
  }
</script>

{#each toasts as toast (toast.id)}
  <div class="toast toast-{toast.type}" role="alert">
    {toast.message}
  </div>
{/each}
```

### 4.3 聊天页面（替代 ChatPage.js + ChatEventHandler.js + Chat.js）

```svelte
<!-- pages/ChatPage.svelte -->
<script>
  import { getContext } from 'svelte';
  import MessageList from '../components/chat/MessageList.svelte';
  import ChatInput from '../components/chat/ChatInput.svelte';
  import ThinkingControl from '../components/chat/ThinkingControl.svelte';

  const kernel = getContext('kernel');
  let messages = $state([]);
  let isStreaming = $state(false);

  function handleSend(content) {
    kernel.chatProgram.sendMessage({ content });
  }
</script>

<div class="chat-page">
  <MessageList {messages} {isStreaming} />
  <div class="chat-footer">
    <ThinkingControl />
    <ChatInput onSend={handleSend} disabled={isStreaming} />
  </div>
</div>
```

---

## 五、分阶段迁移计划

### Phase 1: 基础建设（1 天）

**目标**: Svelte 环境跑通，旧功能不中断

- [ ] 安装依赖: `svelte`, `@sveltejs/vite-plugin-svelte`, `codemirror`, `@codemirror/lang-javascript`, `marked`
- [ ] 更新 `vite.config.ts`: 添加 Svelte 插件 + 双入口
- [ ] 更新 `tsconfig.json`: 添加 `src/` + svelte 类型支持
- [ ] 创建 `src/main.ts` 入口 + `src/App.svelte` 空壳
- [ ] 创建 `src/app.css` 导入 `variables.css`
- [ ] 更新 `sidepanel.html` 支持切换旧/新入口
- [ ] `npm run build` 验证双入口构建成功

### Phase 2: UI 基础组件（1 天）

**目标**: 全部 UI 基础组件 + Toast/Dialog 可用

- [ ] Button, Input, Textarea, Select, Checkbox, Toggle
- [ ] Badge, Card, EmptyState
- [ ] Dialog, Toast (Svelte 组件方式)
- [ ] SearchInput, Pagination
- [ ] CodeEditor (CodeMirror 6 封装)
- [ ] Sidebar 组件

### Phase 3: SettingsPage（1 天）

**目标**: 设置页完整可用，验证 Kernel 集成模式

- [ ] `stores/kernel.context.ts` — Kernel context
- [ ] `stores/settings.svelte.ts` — 设置状态
- [ ] `pages/SettingsPage.svelte` — 主设置页
- [ ] 子组件: API 标准选择、Provider 配置表单
- [ ] 验证: 加载/保存设置、模型列表、主题切换

### Phase 4: 列表页面（1 天）

**目标**: History/Storage/Scripts 三个页面可用

- [ ] `pages/HistoryPage.svelte` — 对话列表 + 搜索
- [ ] `pages/StoragePage.svelte` — 存储浏览 + 编辑
- [ ] `pages/ScriptsPage.svelte` — 脚本管理 + CodeMirror 6

### Phase 5: ChatPage（2 天）

**目标**: 聊天核心页完整可用，流式性能达标

- [ ] `stores/chat.svelte.ts` — 消息状态 + IPC 事件桥接
- [ ] `components/chat/MessageList.svelte` — 消息列表 + 自动滚动
- [ ] `components/chat/MessageBubble.svelte` — 消息气泡 (user/assistant/system/tool)
- [ ] `components/chat/ChatInput.svelte` — 输入区 + 发送
- [ ] `components/chat/ToolCallCard.svelte` — 工具调用卡片
- [ ] `components/chat/ToolResultCard.svelte` — 工具结果卡片
- [ ] `components/chat/ThinkingControl.svelte` — 思考强度
- [ ] 流式渲染性能测试 (DevTools Performance)

### Phase 6: 收尾清理（0.5 天）

- [ ] 切换 `sidepanel.html` 到 Svelte 入口
- [ ] 删除旧 JS 文件（条件: 所有功能验证通过）
- [ ] 删除 14 个旧 CSS 文件
- [ ] 删除 `kernel/index.ts` 中的 `_sidepanelShim`
- [ ] 添加 vitest 组件测试
- [ ] 最终 bundle 体积对比

---

## 六、风险点与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| **流式性能退化** | ChatPage 流式渲染变卡 | 单次只追加 chunk 到信号数组最后一个元素；限制 marked.parse 调用频率（debounce 16ms） |
| **CodeMirror 6 API 不兼容** | 脚本编辑功能异常 | 先在独立原型验证，保持 CodeMirror 5 旧路径可用 |
| **Kernel IPC 事件丢失** | 消息不同步 | Svelte `$effect` 中注册 IPC 监听，`onDestroy` 中清理 |
| **Chrome 扩展 CSP** | Svelte 编译产物被阻止 | Svelte 编译为纯 JS，不依赖 eval()；验证 manifest.json CSP 配置 |
| **双入口互相干扰** | 两个 bundle 同时加载冲突 | `sidepanel.html` 中仅加载一个入口，切换需手动改 HTML |

---

## 七、新依赖清单

```json
{
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "@tsconfig/svelte": "^5.0.0"
  },
  "dependencies": {
    "codemirror": "^6.0.0",
    "@codemirror/lang-javascript": "^6.0.0",
    "@codemirror/theme-one-dark": "^6.0.0",
    "@codemirror/search": "^6.0.0",
    "@codemirror/fold": "^6.0.0",
    "@lezer/highlight": "^1.0.0",
    "marked": "^15.0.0"
  }
}
```

**删除的旧全局依赖** (HTML 中 `<script>` 标签):
- `codemirror.min.js` + 7 个 addon (→ `codemirror` npm)
- `marked.min.js` (→ `marked` npm)
- 所有 CM5 CSS (→ `@codemirror/theme-one-dark`)

---

## 八、构建命令

```bash
# 开发模式 (watch 两个入口)
npm run dev

# 生产构建
npm run build

# 仅构建 Svelte 入口 (调试用)
npx vite build -- -m development

# Svelte 类型检查
npx svelte-check

# 测试
npm run test
```

---

## 九、对比目标

| 指标 | 当前 | 目标 |
|------|------|------|
| UI 源文件 | 37 文件 (JS + CSS) | ~25 文件 (.svelte + .ts) |
| CSS 全局冲突 | 14 文件全局作用域 | 1 全局 + 组件 Scoped |
| DOM 更新 | 全量 clear + rebuild | 增量信号驱动 |
| 类型覆盖 | 0% (UI 层 JS) | 100% (Svelte + TS) |
| 状态管理 | 全局对象 + 闭包 | Context + $state |
| 流式更新 | innerHTML 全量 marked.parse | 追加 chunk, debounce |
| Bundle 体积 | ~134 KB (当前) | 预计 ~120-140 KB |
| 第三方依赖 | 10+ 个 `<script>` 全局 | 2 个 npm (codemirror + marked) |
