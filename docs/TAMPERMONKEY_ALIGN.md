# 油猴功能对齐设计（Tampermonkey Alignment）

> 目标：让面向 Tampermonkey 编写的脚本在本扩展（基于 `chrome.userScripts`）尽量可直接运行。
> 范围：仅对齐 Tampermonkey 的 **元数据块（@指令）** 与 **GM_* API** 两面；不含项目自有扩展（P2 `@tool` 自动注册）。
> 原则不变：仍走 `chrome.userScripts.register`（声明式持久注入），所有读写经 `ScriptsManager`，UI 与 AI 工具路径共用同一数据源。

## 实现状态（2026-07-12）

**本批补已全部落地**（按建议范围）：

### 元数据 @指令
| 指令 | 状态 | 落点 |
|------|------|------|
| `@include` / `@exclude` | ✅ | `ScriptsManager.parseMetadata` → `include`/`exclude`；`ManageUserScriptsTool.syncRegisteredScripts` 注册用 `includeGlobs`/`excludeMatches` |
| `@require` | ✅ | install/edit 时 `fetch` 内联拼接为 `requireCode`，`wrapWithGM` 前置到用户代码前（库依赖 GM_*，故在 API 注入之后） |
| `@resource` | ✅ | install/edit 时 `fetch` 存 `resources[name]`；`gm-api.js` 注入 `GM_getResourceText`/`GM_getResourceURL` |
| `@icon` | ✅ | `ScriptsManager` 解析 → `UserScript.icon` → `ScriptsPage` 列表 `<img>` 展示 |

### GM_* API
| API | 状态 | 落点 |
|-----|------|------|
| GM_getResourceText / GM_getResourceURL | ✅ | `gm-api.js`（依赖 @resource，安装期已拉取） |
| GM_addElement | ✅ | `gm-api.js`（创建/挂载 DOM 节点） |
| GM_download | ✅ | `gm-api.js`（fetch→blob→`a[download]`） |
| GM_info 补全 | ✅ | `wrapWithGM` 注入 namespace/description/author/downloadURL |
| GM_registerMenuCommand / unregister | ✅ | `gm-api.js`（页面侧收集+`chrome.runtime.sendMessage` 回传）；`background/main.ts` 收集器（按 scriptId 聚合）+ `SCRIPTS.MENU_CHANGED` 广播；`scripts.getMenu`/`invokeMenu` RPC；`ScriptsPage` 菜单 UI 触发（回发 `__gmMenuInvoke` 给页面 userScript） |

**明确延后（与本次无关）**：`@connect`/`@updateURL`/`@inject-into`、`GM_webRequest`、`GM_getTabs`、`GM_cookie`、`@noframes`。
> ⚠️ 用户澄清：`GM_webRequest` 与项目 TARGETS#3 的「API before-request 编排」**不是同一概念**（前者是脚本层请求拦截，后者是工具/Provider 层的请求前置编排），故 `GM_webRequest` 维持延后，不随 before-request 提前。

**danger 工具人工确认闸门（同批新增，独立于油猴）**：
- 内核 `ToolConfirmation` 服务 + `ToolsManager.invoke` 闸门（`danger===true` 必须用户确认，安全默认拒绝/超时）。
- 专用 UI 确认 RPC 接口：`confirm.resolve({requestId, approved})`（kernel→shell 通知走 `CONFIRM.REQUEST` 事件，shell→kernel 决策走 RPC）。
- Shell `ConfirmDialog` 顶层浮层（展示工具/原因/将执行的代码），`run_user_script` 已标记 `danger`。
- 测试：`ToolsManager.test.ts` 3 条闸门用例。

---

## 0. 现状盘点（基座已完成，无需先补基础）

| 能力 | 状态 | 落点 |
|------|------|------|
| Tool 元字段 source/category/tags/danger/version | ✅ | `kernel/models/Tool.ts` |
| ToolsManager 实时注册表 + 持久化（全局开关，SW 重启恢复） | ✅ | `kernel/services/ToolsManager.ts` + `tools_enabled` 键 |
| 两层开关：全局（天花板）+ 会话级覆盖 | ✅ | `kernel/models/Session.ts` + `kernel/orchestration/session.ts` |
| ScriptsManager：`@run-at`/`@match` 解析、安装校验 | ✅ | `kernel/services/ScriptsManager.ts` |
| **持久自动注入**（启用+有 `@match` 的脚本注册到 userScripts，匹配页自动执行） | ✅ | `background/tools/ManageUserScriptsTool.js:syncRegisteredScripts` |
| world 自动选择（GM_*→USER_SCRIPT；none→MAIN） | ✅ | `ManageUserScriptsTool.js` |
| userScripts 不可用优雅降级 | ✅ | `ManageUserScriptsTool.js` |
| GM_* API（9 个） | ✅ | `background/gm-api.js` |

**结论**：基座足够。剩余要完善的"工具能力"= 油猴对齐面（元数据指令覆盖 + GM API 覆盖）。可直接进对齐设计。

---

## 1. 油猴两大对齐面

油猴 = ① **元数据块（@指令）** 决定"何时/何地/如何"运行；② **GM_* API** 决定"能做什么"。两者都要对齐。

### 1.1 元数据块 @指令 覆盖矩阵

| @指令 | 状态 | 我们实现 | 备注 |
|--------|------|----------|------|
| @name/@namespace/@version/@description/@author | ✅ 已支持 | `parseMetadata` | |
| @match | ✅ 已支持 | `matches` | |
| @run-at | ✅ 已支持 | `RUN_AT_MAP` → `runAt` | 已接注册 |
| @grant | ✅ 已支持 | world 选择 + GM 注入 | |
| @include / @exclude | ❌→**本批补** | `includeGlobs` / `excludeMatches` | `chrome.userScripts` 原生支持 `includeGlobs`/`excludeGlobs`/`excludeMatches` |
| @require | ❌→**本批补** | 安装时内联前置 | 拉取外部库，拼接在用户代码前 |
| @resource | ❌→**本批补** | 安装时拉取存贮 + `GM_getResourceText` | |
| @icon / @iconURL | ❌→**本批补（轻）** | `ScriptsManager` 解析 + 列表展示 | 仅展示用 |
| @noframes | ❌→**部分/延后** | `userScripts` 无直接等价 | 用 `excludeMatches` 近似或降级 |
| @connect | ❌→**延后** | `GM_xmlhttpRequest` 当前放行所有域 | 安全域白名单，随鉴权桶 |
| @updateURL/@downloadURL | ❌→**延后** | 无自动更新 | 需更新服务器，非核心 |
| @inject-into | ❌→**延后/可选** | 当前按 grant 自动选 world | 可加显式覆盖 |

### 1.2 GM_* API 覆盖矩阵

已支持（9）：`GM_setValue` / `GM_getValue` / `GM_deleteValue` / `GM_listValues` / `GM_addStyle` / `GM_setClipboard` / `GM_xmlhttpRequest` / `GM_notification` / `GM_openInTab`。

| GM API | 状态 | 实现落点 | 备注 |
|---------|------|----------|------|
| GM_info | 🟡 部分 | `wrapWithGM` 仅 name/version | 补全 metadata 字段 |
| GM_log | ✅ | alias → console.log | |
| GM_registerMenuCommand / unregister | ❌→**本批补** | 需 UI 入口（脚本菜单） | 中工作量 |
| GM_getResourceText / getResourceURL | ❌→**本批补** | 依赖 @resource | |
| GM_addElement | ❌→**本批补（轻）** | 注入 DOM 元素 | |
| GM_download | ❌→**本批补（中）** | blob + `a[download]` | |
| GM_webRequest | ❌→**延后（战略重要）** | 关联「before-request 编排」TARGETS#3 | 走 `declarativeNetRequest`，重 |
| GM_getTab / saveTab / getTabs | ❌→**延后** | 跨实例 tab 状态 | 需 tab 消息总线 |
| GM_cookie | ❌→**延后** | 需 `cookies` API + 鉴权 | |

---

## 2. 本批对齐范围（建议）

**纳入（元数据）**：`@include`/`@exclude`、`@require`、`@resource`、`@icon`
**纳入（GM API）**：`registerMenuCommand`(+unregister)、`getResourceText`/`getResourceURL`、`addElement`、`download`、`GM_info` 补全
**延后**：`@connect`/`@updateURL`/`@inject-into`、`GM_webRequest`、`GM_getTabs`、`GM_cookie`、`@noframes`（近似降级）

**明确不在本批（用户已定）**：
- 虚拟机沙箱（VM）— 滞后开发
- 鉴权体系（auth）— 滞后开发；`danger` 确认闸门随此桶（当前 `Tool.danger` 已声明但无执行闸门）
- P2 用户脚本自动注册 `@tool` — 项目自有扩展，单独排期

---

## 3. 实现落点（每个条目的代码触点）

| 条目 | 改动点 |
|------|--------|
| `@include`/`@exclude` | `ScriptsManager.parseMetadata` 增 `include`/`exclude` 数组 → `ManageUserScriptsTool` 注册构造加 `includeGlobs`/`excludeMatches` |
| `@require` | 安装流程：解析 `@require` URL → `fetch` 内联到 `wrapWithGM` 前置；存最终 code 进 `UserScript` |
| `@resource` | 安装流程：解析 `@resource name url` → `fetch` 存 `UserScript.resources[name]` → `gm-api.js` 增 `GM_getResourceText`/`getResourceURL` 读取 |
| `@icon` | `ScriptsManager` 解析 → `UserScript.icon` → `ScriptsPage` 列表展示 |
| `registerMenuCommand` | `gm-api.js` 收集命令 → 经 IPC 上报内核 → sidepanel 提供脚本菜单 UI（中工作量） |
| `getResourceText` 等 | `gm-api.js` 增 wrapper，读 `@resource` 存贮 |
| `addElement` | `gm-api.js` 增 wrapper，创建并可选挂载 DOM 节点 |
| `download` | `gm-api.js` 增 wrapper，fetch→blob→`a[download]` 触发 |
| `GM_info` 补全 | `wrapWithGM` 注入完整 metadata（namespace/description/author/downloadURL 等） |

**架构约束**：`@require`/`@resource` 在**安装时**解析内联（因 `userScripts.register` 需要最终 JS），存进 `UserScript` 字段；不引入运行时监听器，保持声明式注入。

---

## 4. 验证

- `kernel/services/ScriptsManager.test.ts`：增 `@include`/`@exclude`/`@require`/`@resource`/`@icon` 解析用例
- `background/tools/ManageUserScriptsTool` 注册构造单测：确认 globs/resource 正确进入 `registrations`
- `gm-api.js` 各 wrapper 单元/快照测试
- 端到端：安装一个含 `@require`+`@resource`+`GM_registerMenuCommand` 的真实脚本，验证自动注入与 API 可用

---

## 5. 与既有文档关系

- `docs/TAMPERMONKEY_COMPAT.md` 是**历史迁移计划**（background/ 迁移，已完成），非兼容性矩阵，保留作史。
- 本文件是**对齐设计基线**，随实现滚动更新。
- `docs/JS_TOOL_STRATEGY.md` 是生态调研基线（2026-07），本设计是其落地面之一。
