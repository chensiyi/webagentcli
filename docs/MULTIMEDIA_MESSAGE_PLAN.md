# 多媒体消息处理方案（Multimedia Message Handling）

> 目标：为 Web Agent 的聊天补齐「多媒体消息」能力——用户向 AI 发送图片/截图/音频/视频/文件，AI 的回复里也能正常渲染图片、音视频、文件卡片，并打通「模型序列化 → 存储 → 渲染」全链路。
>
> 本文基于竞品调研 + 本仓库现状诊断给出方案，分 5 个阶段实施，不一次性铺开。

---

## 1. 竞品调研：优秀产品怎么做

### 1.1 输入侧（用户 → AI）
| 产品 | 做法 |
|------|------|
| **ChatGPT** | 直接在输入框粘贴/拖拽图片；支持 PDF、图片上传；语音模式；DALL·E 生成图内联返回 |
| **Claude** | 拖拽文件、粘贴图片；可分析图片/PDF；附件以 composer 上方的 chip 呈现，发送前可删除 |
| **Gemini** | 原生多模态：图片/音频/视频/PDF 混合输入，媒体内联展示 |
| **Telegram / 微信 / 飞书** | 聊天气泡承载媒体；拖拽即发；粘贴图片即时成预览；图片带缩略图，点开看大图（lightbox） |
| **通用范式** | ① 输入框旁「+ 附件」按钮 → 文件选择；② 粘贴图片自动成预览 chip；③ 任意位置拖拽落入即附件；④ 附件发送前可单独删除；⑤ 流式文本与媒体块可共存 |

### 1.2 输出侧（AI → 用户）
- **图片**：内联渲染，点击放大（lightbox），可下载。
- **音视频**：原生 `<audio>/<video controls>` 播放器，支持进度/倍速。
- **文件**：卡片式（图标 + 文件名 + 大小 + 下载按钮），而非裸链接。
- **代码/富文本**：已通过 markdown + 代码块渲染（本仓库已有 `renderMarkdown`）。
- **工具产出的媒体**（如截图工具、图像生成工具）：作为 `tool_result` 回传，需要在工具结果里也能渲染图片——这对 Web Agent 尤其重要。

### 1.3 存储范式
- 聊天媒体**绝不以 base64 塞进小容量 KV 存储**（Chrome `chrome.storage.local` 配额仅 ~5–10MB，几张图就爆）。
- 主流做法：大二进制存 **IndexedDB**（或对象存储），消息里只存「引用 ID + 元信息（mimeType/size/filename）」，展示时再换取 blob/objectURL。

---

## 2. 现状诊断（本仓库）

### 2.1 已有的好底子
- `kernel/models/MessageContent.ts`：`Message.content` 已是 `string | Block[]`，且已定义 `TextBlock` / `ImageBlock` / `ToolUseBlock` / `ToolResultBlock` / `ThinkingBlock`，外加通用 `MediaContent`（含 `dataUrl/url/filename/mimeType/size/metadata`）。
- `Message` 类支持 `isRichContent()`（content 为数组）、`getText()`。
- 渲染层 `MessageBubble.svelte` 已能渲染文本(markdown)/思考/工具卡。
- Provider 层 `OpenAIService` 等只透传 `request.messages`，序列化集中在 `MessageStructure.toAPIFormat`。

### 2.2 关键断点（必须修）
1. **序列化断点**：`MessageStructure.toAPIFormat`（`kernel/models/MessageContent.ts:59`）只把 `content` 当字符串发；若 content 是 block 数组（含图片/媒体），**不会转成 provider 的 content parts**，模型收不到图。调用点在 `kernel/orchestration/session-context.ts:65` 的 `ContextBuilder.buildMessages`。
2. **渲染断点**：`MessageBubble.svelte:87` 仅 `renderMarkdown(extractText(msg.content))`，图片/音视频/文件块完全不渲染；`getMessageDisplayContent`（`ChatPage.svelte:383`）也只取文本。
3. **输入断点**：`handleSend`（`ChatPage.svelte:114`）只发 `{content: string}`，输入框是纯 `textarea`，无文件选择/粘贴/拖拽/截图。
4. **存储隐患**：`SessionManager` 把消息 JSON 存进 `chrome.storage.local`（`createChromeStorage`）。一旦把图片 base64 写进 message.content，立刻撑爆配额。需要媒体走 IndexedDB，消息只存引用。
5. **发送接口缺口**：`api.session.send({content})` 没有 attachments 参数；`MessagesRequest` 也没字段承载多模态。

---

## 3. 总体架构方案

### 3.1 内容模型（`kernel/models/MessageContent.ts`）
统一为「媒体块」概念，避免散落的 `ImageBlock`/`MediaContent` 双份：

- 新增 `MediaBlock`：`{ type:'media', kind:'image'|'audio'|'video'|'file', mediaId:string, mimeType:string, filename?:string, size?:number, url?:string, text?:string }`
  - `mediaId`：IndexedDB 中的 blob 引用（**持久化只存这个，不存 base64**）。
  - `url`：会话内临时展示用的 dataURL/objectURL（**不持久化**，渲染时现取）。
- 保留 `TextBlock`；`ImageBlock` 标记为 deprecated 并向 `MediaBlock{kind:'image'}` 兼容转换（fromJSON 兼容旧数据）。
- `Message.content` 仍为 `string | (TextBlock|MediaBlock|ToolUseBlock|ToolResultBlock|ThinkingBlock)[]`。

### 3.2 媒体存储层 `MediaStore`（可插拔后端：本地 IndexedDB / 远端资源服务器）

> **已落地**：媒体存储改为**可插拔后端**，用户在 Settings 自建「资源服务器」配置（上传链接/端点），自己管理自己的基础设施；不硬编码任何第三方。

- 位置：**background** 内（与 `createChromeStorage` 同源，符合「存储由 shell 提供、内核依赖接口」的既定架构）。
- 实现：`background/services/mediaStore.ts`，`createMediaStore(getSettings)` 返回门面，按 `settings.resourceServer.enabled` 选后端，按 id 前缀（`local_`/`remote_`）路由读取：
  - **`LocalMediaStore`**（默认）：`indexedDB`（库 `webagent-media`，仓库 `blobs`，key=`mediaId`），存 dataURL。
  - **`RemoteMediaStore`**：通用 HTTP 上传（multipart/form-data 到 `uploadUrl`，支持 method/authHeader/authToken/responseUrlField 点路径/urlPrefix），返回公网 URL；**上传失败直接抛错，不静默回退本地**（用户拍板）。
- RPC 接口（`media` 服务，沿用 `expose` 范式）：`put → mediaId`（local/remote 前缀）、`get → dataUrl|url`、`delete`、`getMany → {id: dataUrl|url}`。
- 消息 JSON 只存 `mediaId`；远端模式下 `media.get(id)` 返回的是服务器 URL 直链。
- 设置项路径：`settings.resourceServer = { enabled, uploadUrl, method, authHeader, authToken, responseUrlField, urlPrefix }`，由 `SettingsPage` 的「资源服务器」区持久化。

### 3.3 序列化层（打通到 provider）
扩展 `MessageStructure.toAPIFormat(msg, 'openai' | 'anthropic')`：
- 若 `content` 为字符串 → 现状逻辑不变。
- 若为 block 数组 → 拼成 provider 的 `content: [...]` parts：
  - `TextBlock` → `{type:'text', text}`
  - `MediaBlock{kind:'image'}` → OpenAI `{type:'image_url', image_url:{url: <dataURL>}}`；Anthropic `{type:'image', source:{type:'base64', media_type, data}}`（dataURL 需在发送前由 `media.get` 换回 base64，仅用于请求体，不落盘）。
  - `MediaBlock{kind:'audio'}` → OpenAI `{type:'input_audio', input_audio:{data, format}}`（wav/mp3）。
  - `MediaBlock{kind:'file'}` → OpenAI `{type:'file', file:{file_data, filename}}`（PDF 等）。
  - `video`：当前主流 chat API 不直接吃视频，方案是——发送时退化为「文本说明 + 文件下载」（或抽取首帧当图），并在方案 P4 讨论专用多模态端点。
- Provider 差异由 `toAPIFormat` 的 `standard` 参数分发；新增 `AnthropicService`（若后续要接 Claude）时复用同一套 block→parts 逻辑。

### 3.4 渲染层（`sidepanel/pages/chat/`）
- 新增 `MediaBlock.svelte`：按 `kind` 渲染
  - `image`：`<img>` 缩略图 → 点击开 `Lightbox.svelte`（全屏遮罩 + 缩放/下载）。
  - `audio`：`<audio controls>`。
  - `video`：`<video controls>`。
  - `file`：文件卡片（类型图标 + 文件名 + 大小 + 下载按钮，下载走 `media.get` 拿 dataURL 触发）。
- 改造 `MessageBubble.svelte`：消息内容区改为「先渲染 media 块（按顺序），再渲染 markdown 文本」。
- 改造 `getMessageDisplayContent`：文本块仍走 markdown；media 块交给 `MediaBlock` 组件（不再 `extractText` 吞掉）。
- 渲染时异步 `media.get(mediaId)` 换 dataURL（带 `$state` 缓存 + 懒加载，图片用 blur-up）。

### 3.5 输入层（`ChatPage.svelte`）
- 输入框上方新增「附件预览区」：chip 列表（缩略图 + 文件名 + 删除 ×）。
- **附件按钮**：隐藏 `<input type="file" multiple accept="image/*,audio/*,video/*,application/pdf">`，选中即 `media.put` 拿 id 入暂存数组。
- **粘贴**：`textarea` 的 `paste` 事件拦截，若剪贴板含 `image/*` → 转附件。
- **拖拽**：chat 容器 `dragover/drop` → 落入文件转附件。
- **截图（Web Agent 招牌能力）**：新增「📸 截图」按钮 → `chrome.tabs.captureVisibleTab` 取当前页截图 → 直接成图片附件。这是浏览器 Agent 相对纯聊天产品的差异化亮点。
- **发送**：`handleSend` 改为 `api.session.send({ content, attachments: MediaBlock[] })`；发送前把每个附件 blob `media.put` 持久化并写 `mediaId` 进消息。
- （可选 P4）**语音输入**：Web Speech API 或本地 Whisper，转文本/音频附件。

### 3.6 发送接口
- `api.session.send` 扩展接收 `attachments`；`session.ts` 把 `attachments` 组装进新 `Message.content`（TextBlock + MediaBlock[]），走现有持久化（只存 mediaId）。

---

## 4. 分阶段实施计划

| 阶段 | 内容 | 关键改动 | 验收 |
|------|------|----------|------|
| **P0 基础** | 内容模型 + 媒体存储 + 序列化扩展 | `MediaBlock` 模型；`mediaStore.ts`(IndexedDB) + `media` RPC；`toAPIFormat` 支持 block→parts（先 OpenAI） | 单测：block 数组能正确序列为 OpenAI content parts；mediaId 读写通 |
| **P1 渲染** | 消息内多媒体展示 | `MediaBlock.svelte` + `Lightbox.svelte`；改造 `MessageBubble`/`getMessageDisplayContent`；`media.get` 换 URL 懒加载 | 用户/助手消息里的图片、音视频、文件卡片正常渲染、可放大/播放/下载 |
| **P2 输入** | 附件能力（含截图） | `ChatPage` 附件区 + 文件选择/粘贴/拖拽/截图；`send` 接 attachments | 粘贴/拖拽/选择/截图都能成附件并随消息发出；发送后气泡正确显示 |
| **P3 Provider 接线** | 真正把图发给模型 | `ContextBuilder` 经 `toAPIFormat` 输出多模态 parts；`chat` 请求体带图；按需 `media.get` 换 base64 | 用支持视觉的模型实测：发图 → 模型能「看到」并回应 |
| **P4 打磨** | 配额/性能/进阶 | 图片 blur-up 懒加载；超限时淘汰最旧媒体；assistant 经工具回传的图片渲染；视频/语音输入（可选） | 长会话不爆存储；大图不卡 UI；工具截图回传可见 |

> 建议从 **P0 → P1 → P2 → P3** 顺序推进，每段可独立提交、独立验证；P4 按需。

---

## 5. 关键决策点（待你拍板）

1. **优先级**：是否把「📸 截图当前页」作为 P2 的首发亮点（Web Agent 差异化）？还是先补齐通用上传？
2. **媒体持久化范围**：当前方案是「IndexedDB 存 blob + 消息存 mediaId」。是否接受媒体随会话删除而清理（不跨会话复用）？
3. **Provider 范围**：P3 先只接 OpenAI 家族（image_url），还是同步接 Anthropic（需新增 `AnthropicService`）？
4. **视频/语音**：P4 再议，还是本轮就要？

---

## 附：改动文件清单（预估）
- 模型：`kernel/models/MessageContent.ts`（MediaBlock + toAPIFormat 扩展）
- 存储：`background/services/mediaStore.ts`（新增）、`background/main.ts`（注册 `media` 服务）
- 编排：`kernel/orchestration/session-context.ts`（调用扩展后的 toAPIFormat）
- 渲染：`sidepanel/pages/chat/MediaBlock.svelte`（新增）、`Lightbox.svelte`（新增）、`MessageBubble.svelte`、`ChatPage.svelte`
- 接口：`kernel/orchestration/session.ts`（send 接 attachments）、`sidepanel` 侧 RPC 契约补 `media`
- 测试：`MessageContent.test.ts`、新增 `mediaStore` / `toAPIFormat` 多模态单测

---

## 实施进度（截至 2026-07-10）

| 阶段 | 状态 | 提交 |
|------|------|------|
| P0 基础（模型 + IndexedDB 媒体存储 + 多模态序列化） | ✅ 完成 | `7c20167` |
| 资源服务器可插拔存储（设置配置 + local/remote 后端 + 远端 URL 序列化） | ✅ 完成 | `1bfb029` |
| P1 渲染层（MediaBlock + Lightbox，气泡渲染图/音视频/文件） | ✅ 完成 | `95fd380` |
| P2 输入层（附件托盘/粘贴/拖拽 + 内核 send 支持 block 数组） | ✅ 完成 | `938624c` |
| P2 模型截图工具（capture_visible_tab，模型自调） | ❌ 已移除（2026-07-10：用户确认真机不可用、增加复杂度） | — |
| P3 OpenAI 家族真机联调 | 🔶 链路就绪，待真机 key 实测 | — |
| 媒体回收（删会话/清消息/删单条连带清 mediaId） | ✅ 完成 | 本轮未提交 |
| manifest `tabs` 权限（captureVisibleTab 前提） | ❌ 已移除（截图工具已删，权限无意义） | — |
| P4 视频/语音 | ⏳ 延后 | — |

**关键修正**：实施中发现并修复 `ToolExecutor` 将 tool 结果 `JSON.stringify` 的隐患（图片块会被转义成文本、模型看不见），改为成功时保留 block 数组原样；`appendToolResult` 类型放宽 `string|any[]`。

**媒体回收实现**：`collectMediaIds`/`collectMediaIdsFromMessages`（`kernel/models/MessageContent.ts`）递归收集 content 里的 `mediaId`（仅 `local_`/`remote_` 前缀，覆盖嵌套在 `tool_result` 内的媒体块）；`Kernel` 新增 `mediaDeleter` 回调（与 `mediaResolver` 对称）；`background/main.ts` 接线为 `mediaStore.delete` 批量 best-effort 删除；`SessionManager.deleteSession`/`clearMessages`/`deleteMessage` 在删除前收集 mediaId 并触发回收，单条失败不影响删除主流程。

**联调就绪**：媒体发送链路（media 块 → `ContextBuilder.buildMessages` 经 `mediaResolver` 换内容 → `toAPIFormat` 输出 `image_url`/`input_audio`/`file` parts）已用 node 集成测试覆盖（dataURL 本地媒体路径 + 混合图文音）。真机联调步骤：加载 unpacked 扩展 → 设置里填 OpenAI key（及可选资源服务器）→ 输入框粘贴/拖拽一张图发送 → 观察请求体含 `image_url`、模型能「看到」并回应。

**待办**：① P3 真机发图验证（需用户 API key 实测）；② P4 视频/语音延后。
