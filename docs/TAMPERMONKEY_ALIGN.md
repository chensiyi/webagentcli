# 油猴功能对齐完成情况（Tampermonkey Alignment）

> 目标：让面向 Tampermonkey 编写的脚本在本扩展（基于 `chrome.userScripts`）尽量可直接运行。
> 范围：仅对齐 Tampermonkey 的 **元数据块（@指令）** 与 **GM_* API** 两面；不含项目自有扩展（P2 `@tool` 自动注册）。

## ✅ 已完成（2026-07-12）

### 元数据 @指令
| 指令 | 落点 |
|------|------|
| `@name/@namespace/@version/@description/@author` | `parseMetadata` 基础字段 |
| `@match` | `matches` → `userScripts.register` |
| `@run-at` | `RUN_AT_MAP` → `runAt` |
| `@grant` | world 选择 + GM 注入 |
| `@include` / `@exclude` | `includeGlobs` / `excludeMatches` |
| `@require` | 安装时 `fetch` 内联拼接为 `requireCode` |
| `@resource` | 安装时 `fetch` 存 `resources[name]` |
| `@icon` | 解析 → `UserScript.icon` → 列表展示 |

### GM_* API
| API | 落点 |
|-----|------|
| `GM_setValue / getValue / deleteValue / listValues` | `gm-api.js` |
| `GM_addStyle / setClipboard / xmlhttpRequest / notification / openInTab / log` | `gm-api.js` |
| `GM_info` 补全 | `wrapWithGM` 注入 namespace/description/author/downloadURL |
| `GM_getResourceText / getResourceURL` | `gm-api.js`（依赖 @resource，安装期已拉取） |
| `GM_addElement` | `gm-api.js`（创建/挂载 DOM 节点） |
| `GM_download` | `gm-api.js`（fetch→blob→`a[download]`） |
| `GM_registerMenuCommand / unregister` | 页面侧收集 → `chrome.storage.local` → RPC 主动拉取 → 回发 `__gmMenuInvoke` |

### 🔴 明确延后（与本次无关）
`@connect` / `@updateURL` / `@downloadURL` / `@inject-into` / `@noframes`、`GM_webRequest`、`GM_getTabs`、`GM_cookie`、VM 沙箱、鉴权体系。