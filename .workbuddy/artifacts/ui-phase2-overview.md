# Svelte 5 UI 改造 — Phase 2 完成

## 完成内容

### 1. 完整设计系统导入
- 重写 `src/app.css`，建立完整的 CSS Design Tokens
- 新主色 `#378ADD`，语义色 green `#639922` / red `#E24B4A` / amber `#EF9F27`
- 完整的浅色/深色模式变量切换
- 统一阴影、圆角（6/8/12/16/999px）、间距（4px 基础）、字号体系
- `sidepanel/svelte-app.html` 移除旧的 `variables.css` 引用，统一由构建后的 `svelte-app.css` 提供 tokens

### 2. 布局与导航升级
- `App.svelte`：页面切换加入 `#key` + fade 动画，集成全局 Toast 容器
- `Sidebar.svelte`：active 状态改为 primary 背景 + 白色图标，hover 用 surface-hover
- `PagePlaceholder.svelte`：占位页面视觉升级，统一 header + card + 进度动画

### 3. 通用 UI 组件库（src/components/ui/）
| 组件 | 用途 |
|------|------|
| Button | primary/secondary/ghost/danger，sm/md/lg，loading 状态 |
| IconButton | 图标按钮，支持 default/primary/ghost/danger |
| Input | 文本/密码/数字输入，label、error 状态 |
| Select | 下拉选择，带 placeholder |
| Switch | 开关切换 |
| Slider | 滑块，实时显示当前值 |
| Badge | 标签（default/primary/success/warning/error/info） |
| Card | 卡片容器，支持 padding/shadow/hover/clickable |
| EmptyState | 空状态引导 |
| Spinner | SVG 加载动画 |
| Toast / ToastContainer | 全局通知提示 |
| Dialog | 模态对话框，支持确认/取消/danger 模式 |
| Tooltip | 简单文字提示 |

### 4. 状态管理
- `src/lib/stores/toast.ts`：全局 toast store，支持 info/success/warning/error

## 构建验证

```
dist/assets/svelte-app.css     8.35 kB │ gzip: 2.36 kB
dist/svelte-app.bundle.js     48.87 kB │ gzip: 19.17 kB
dist/sidepanel.bundle.js      70.87 kB │ gzip: 20.59 kB
```

- ✅ Vite 双入口构建成功，无 Svelte warning
- ✅ 5/5 测试通过

## 下一步

Phase 3 起可逐个实现真实页面：
1. ChatPage（最复杂，建议最后或单独阶段）
2. SettingsPage（表单组件多，适合先验证组件库）
3. HistoryPage / StoragePage / ScriptsPage（列表型页面）
