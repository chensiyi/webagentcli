# Svelte 5 迁移完善计划

## 对比分析报告

### 1. SettingsPage 差异分析

#### ❌ 缺失功能（旧实现有，新实现无）

| 功能 | 旧实现 | 新实现 | 优先级 |
|------|--------|--------|--------|
| **模型详情浮窗** | 鼠标悬停模型项显示浮窗（描述、特性、链接） | 无浮窗，只有 badge | 🔴 高 |
| **搜索精确匹配逻辑** | 搜索框精确匹配某模型时强制显示全部 | 无此逻辑 | 🟡 中 |
| **IPC 事件监听** | 监听 `SETTINGS.API_STANDARD_CHANGED` 等事件 | 只监听 `settings:models:loaded` | 🟡 中 |
| **Provider 动态 UI** | 使用 `SettingsPage_OpenAI/OpenRouter/LMStudio` | 硬编码字段 | 🟢 低 |

#### ✅ 新实现改进
- Provider Tabs 设计更现代化
- 主题卡片预览更直观
- 响应式状态管理更清晰

---

### 2. HistoryPage 差异分析

#### ❌ 缺失功能
**基本无缺失**，功能一致。

#### ✅ 新实现改进
- 使用 Svelte context 导航（更规范）
- 使用 Dialog 组件（更统一）

---

### 3. StoragePage 差异分析

#### ❌ 缺失功能

| 功能 | 旧实现 | 新实现 | 优先级 |
|------|--------|--------|--------|
| **CodeMirror 编辑器** | 编辑 JSON 使用 CodeMirror（语法高亮） | 使用简单 textarea | 🔴 高 |
| **EventHandler 模式** | 通过 `StorageEventHandler` 处理事件 | 直接调用 kernel 方法 | 🟡 中 |

#### ✅ 新实现改进
- 分页功能完整
- UI 更现代化

---

### 4. ScriptsPage 差异分析

#### ❌ 缺失功能

| 功能 | 旧实现 | 新实现 | 优先级 |
|------|--------|--------|--------|
| **CodeMirror 编辑器** | 安装/编辑 JS 使用 CodeMirror | 使用简单 textarea | 🔴 高 |
| **匹配规则显示** | 显示 `match` 规则数量 | 无此显示 | 🟡 中 |

#### ✅ 新实现改进
- UI 更现代化
- 启禁切换更直观

---

### 5. ChatPage 差异分析（最重要）

#### ❌ 缺失功能

| 功能 | 旧实现 | 新实现 | 优先级 |
|------|--------|--------|--------|
| **思考强度滚轮切换** | 鼠标滚轮在思考强度选项间切换 | 只有 dropdown | 🔴 高 |
| **工具执行进度显示** | `tool-progress-area` 显示执行进度 | 无进度显示 | 🔴 高 |
| **空内容消息处理** | `content` 为空时显示提示文字 | 无此处理 | 🔴 高 |
| **思考过程默认折叠** | 思考过程默认折叠（`display: none`） | 默认展开 | 🔴 高 |
| **消息删除按钮位置** | 删除按钮在消息气泡右上角 | Dialog 确认删除 | 🟡 中 |
| **流式按钮切换** | IPC 事件控制发送/停止按钮显示 | `$state(isStreaming)` 控制 | ✅ 已修复 |

#### ✅ 新实现改进
- `streamingMap` 实现更清晰的流式渲染
- 响应式状态管理更清晰
- 自动滚动逻辑更完善

---

## 实施计划

### Phase 4.1 - ChatPage 完善（优先级最高）

#### Task 4.1.1: 添加思考强度滚轮切换
- 在思考强度 dropdown 按钮上添加 `wheel` 事件监听
- 滚轮向上：切换到更低强度（high → medium → low → off）
- 滚轮向下：切换到更高强度（off → low → medium → high）

#### Task 4.1.2: 添加工具执行进度显示
- 在输入区域上方添加 `tool-progress-area`
- 监听 `TOOL.EXECUTING` 和 `TOOL.COMPLETED` 事件
- 显示工具执行状态（⏳ 执行中 / ✅ 成功 / ❌ 失败）

#### Task 4.1.3: 添加空内容消息处理
- 在 `getMessageDisplayContent()` 中检查 `content` 是否为空
- 如果为空但有 `reasoning_content`，显示提示文字：`（仅有思考过程，请展开上方查看）`

#### Task 4.1.4: 添加思考过程默认折叠
- 思考过程默认设置为折叠状态（`expandedReasoning[msg.id] = false`）
- 点击思考过程标题展开/折叠

---

### Phase 4.2 - SettingsPage 完善

#### Task 4.2.1: 添加模型详情浮窗
- 在模型下拉列表项上添加 `mouseenter/mouseleave` 事件
- 显示浮窗：模型名称、描述、上下文长度、价格、特性支持、OpenRouter 链接

#### Task 4.2.2: 添加搜索精确匹配逻辑
- 在 `handleModelSearchClick()` 中检查搜索框内容是否精确匹配某个模型
- 如果精确匹配，强制显示全部模型

---

### Phase 4.3 - StoragePage/ScriptsPage 完善（可选）

#### Task 4.3.1: 集成 CodeMirror
- 在 `svelte-app.html` 中添加 CodeMirror 依赖
- 在 StoragePage 编辑对话框中集成 CodeMirror
- 在 ScriptsPage 安装/编辑表单中集成 CodeMirror

#### Task 4.3.2: 添加脚本匹配规则显示
- 在脚本卡片上显示 `match` 规则数量

---

## 实施顺序

1. **ChatPage 完善**（Phase 4.1）- 影响用户体验最大
2. **SettingsPage 完善**（Phase 4.2）- 功能完整性
3. **StoragePage/ScriptsPage 完善**（Phase 4.3）- 可选，提升编辑体验

---

## 预计工作量

- ChatPage 完善：2-3 小时
- SettingsPage 完善：1-2 小时
- StoragePage/ScriptsPage 完善：2-3 小时（如果需要 CodeMirror）

---

## 下一步

请确认实施顺序，我将开始实施。
