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

### 3.2 媒体存储层 `MediaStore`（IndexedDB，解决配额）
- 位置：**background** 内（与 `createChromeStorage` 同源，符合「存储由 shell 提供、内核依赖接口」的既定架构）。
- 实现：`background/services/mediaStore.ts`，封装 `indexedDB`（库 `webagent-media`，对象仓库 `blobs`，key=`mediaId`）。
- RPC 接口（新增 `media` 服务，沿用 `expose` 范式）：
  - `media.put({ dataUrl | blob, mimeType, filename? }) → mediaId`
  - `media.get({ id }) → dataUrl`（侧栏展示时换取）
  - `media.delete({ id })`
  - `media.getMany({ ids }) → { id: dataUrl }`（批量换 URL，渲染列表时用）
- 消息 JSON 只存 `mediaId`；用户发送前在侧栏把附件 blob 先 `media.put` 拿 id，再随消息发出。

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
