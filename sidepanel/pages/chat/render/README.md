# Chat Render 渲染器目录

## 📁 目录结构

```
render/
├── TextRenderer.js        # 文本渲染器
├── ImageRenderer.js       # 图片渲染器
├── AudioRenderer.js       # 音频渲染器
├── VideoRenderer.js       # 视频渲染器
├── FileRenderer.js        # 文件渲染器
└── ChatMessageRenderer.js # 主渲染器（整合所有子渲染器）
```

## 🎯 职责说明

### 设计原则

这个目录采用了**策略模式 + 组合模式**的设计：

1. **单一职责**：每个渲染器只负责一种媒体类型的渲染
2. **统一接口**：所有渲染器都有 `render()` 和 `update()` 方法
3. **组合使用**：ChatMessageRenderer 组合所有子渲染器

---

### TextRenderer.js (1.1KB) - 文本渲染器
**职责**：渲染纯文本和 Markdown 内容

**方法**：
- `render(text)` - 创建文本 DOM
- `update(text, container)` - 更新现有容器的文本

**特点**：
- 使用 `window.renderMarkdown()` 处理 Markdown
- 支持增量更新（避免重复创建 DOM）

**全局变量导出**：
- `window.TextRenderer` (class)

**使用示例**：
```javascript
const renderer = new window.TextRenderer();
const element = renderer.render('Hello **World**');
container.appendChild(element);
```

---

### ImageRenderer.js (0.8KB) - 图片渲染器
**职责**：渲染图片内容

**方法**：
- `render(item)` - 创建图片 DOM（item 包含 image_url）
- `update(item, container)` - 更新或添加图片

**特点**：
- 支持 Base64 图片和 URL 图片
- 自动添加点击预览功能
- 响应式尺寸调整

**全局变量导出**：
- `window.ImageRenderer` (class)

**输入格式**：
```javascript
{
  type: 'image_url',
  image_url: {
    url: 'data:image/png;base64,...' // 或 https://...
  }
}
```

---

### AudioRenderer.js (0.8KB) - 音频渲染器
**职责**：渲染音频播放器

**方法**：
- `render(item)` - 创建音频播放器 DOM
- `update(item, container)` - 更新或添加音频

**特点**：
- 使用 HTML5 `<audio>` 元素
- 支持 Base64 音频数据
- 显示文件大小信息

**全局变量导出**：
- `window.AudioRenderer` (class)

**输入格式**：
```javascript
{
  type: 'input_audio',
  input_audio: {
    data: 'data:audio/mp3;base64,...',
    format: 'mp3'
  }
}
```

---

### VideoRenderer.js (0.8KB) - 视频渲染器
**职责**：渲染视频播放器

**方法**：
- `render(item)` - 创建视频播放器 DOM
- `update(item, container)` - 更新或添加视频

**特点**：
- 使用 HTML5 `<video>` 元素
- 支持 Base64 视频数据
- 显示控制条（播放、暂停、音量等）

**全局变量导出**：
- `window.VideoRenderer` (class)

**输入格式**：
```javascript
{
  type: 'file',
  file: {
    data: 'data:video/mp4;base64,...',
    mimeType: 'video/mp4',
    name: 'example.mp4'
  }
}
```

---

### FileRenderer.js (1.0KB) - 文件渲染器
**职责**：渲染通用文件（非图片/音频/视频）

**方法**：
- `render(item)` - 创建文件卡片 DOM
- `update(item, container)` - 更新或添加文件

**特点**：
- 显示文件图标（根据 MIME 类型）
- 显示文件名和大小
- 提供下载按钮

**全局变量导出**：
- `window.FileRenderer` (class)

**输入格式**：
```javascript
{
  type: 'file',
  file: {
    data: 'data:application/pdf;base64,...',
    mimeType: 'application/pdf',
    name: 'document.pdf'
  }
}
```

---

### ChatMessageRenderer.js (12.2KB) - 主渲染器
**职责**：整合所有子渲染器，处理多模态消息和工具卡片

**核心方法**：

#### 1. 消息内容渲染
- `renderMessageContent(content, container, appendOnly)` - 渲染多模态消息
- `renderContentItem(item, container)` - 渲染单个内容项

**功能**：
- 判断 content 类型（字符串 vs 数组）
- 遍历数组中的每个 item
- 根据 item.type 选择对应的渲染器
- 支持注册表扩展（通过 MessageTypes.MessageHandlerRegistry）

#### 2. 工具调用卡片渲染
- `renderToolCallCard(toolCall, index, resultData, isLoading)` - 渲染完整的工具卡片
- `createToolCardHeader(index, toolIcon, hasResult, isSuccess, isLoading)` - 创建卡片头部
- `createToolCardParams(params)` - 创建参数区域
- `createToolCardResult(resultData, isSuccess, toolCall)` - 创建结果区域
- `createLoadingBadge()` - 创建加载徽章

**辅助方法**：
- `getToolIcon(toolName)` - 获取工具图标和名称
- `renderSuccessResult(resultData, resultContent)` - 渲染成功结果
- `renderErrorResult(resultData, toolCall, resultContent)` - 渲染错误结果
- `renderPaginatedResults(results, resultContent)` - 渲染分页结果（搜索）
- `createResultItem(item, ridx, end)` - 创建单个结果项
- `createPaginationControls(currentPage, totalPages, onPageChange)` - 创建分页控件

**全局变量导出**：
- `window.ChatMessageRenderer` (class)

**依赖**：
- `window.TextRenderer`
- `window.ImageRenderer`
- `window.AudioRenderer`
- `window.VideoRenderer`
- `window.FileRenderer`
- `window.MessageTypes?.MessageHandlerRegistry` (可选)

---

## 🔗 调用关系

```
chat-refactored.js
  └─> new ChatMessageRenderer()
        ├─> new TextRenderer()
        ├─> new ImageRenderer()
        ├─> new AudioRenderer()
        ├─> new VideoRenderer()
        └─> new FileRenderer()

当需要渲染消息时：
  messageRenderer.renderMessageContent(content, container)
    ├─> if content is string → textRenderer.update()
    └─> if content is array
          └─> forEach item
                ├─> check registry (optional)
                └─> renderContentItem()
                      ├─> text → textRenderer.render()
                      ├─> image_url → imageRenderer.render()
                      ├─> input_audio → audioRenderer.render()
                      └─> file
                            ├─> video/* → videoRenderer.render()
                            └─> other → fileRenderer.render()
```

## 📊 数据流示例

### 纯文本消息
```javascript
"Hello World"
  ↓
TextRenderer.render()
  ↓
<div class="message-content">
  <p>Hello World</p>
</div>
```

### 多模态消息
```javascript
[
  { type: 'text', text: '这是一张图片：' },
  { type: 'image_url', image_url: { url: '...' } }
]
  ↓
ChatMessageRenderer.renderMessageContent()
  ├─> TextRenderer.render('这是一张图片：')
  └─> ImageRenderer.render({ type: 'image_url', ... })
  ↓
<div class="message-content">
  <p>这是一张图片：</p>
  <img src="..." />
</div>
```

### 工具调用卡片
```javascript
tool_call: { function: { name: 'web_search', arguments: '...' } }
result: { tool_result: { results: [...] } }
  ↓
ChatMessageRenderer.renderToolCallCard()
  ├─> createToolCardHeader()
  ├─> createToolCardParams()
  └─> createToolCardResult()
        └─> renderPaginatedResults()
              └─> createResultItem() × N
  ↓
<div class="tool-call-card">
  <div class="tool-call-header">...</div>
  <div class="tool-call-params">...</div>
  <details class="tool-call-result">
    <summary>执行结果</summary>
    <div class="tool-call-result-content">
      <div class="search-result-item">...</div>
      <div class="search-result-item">...</div>
      ...
    </div>
  </details>
</div>
```

## ⚠️ 注意事项

1. **样式已优化**：所有内联样式已提取到 theme.css（见重构记录）
2. **可扩展性**：支持通过 MessageHandlerRegistry 注册自定义处理器
3. **增量更新**：update() 方法支持增量更新，避免重复渲染
4. **appendOnly 模式**：renderMessageContent 支持 appendOnly 参数，用于流式更新
5. **错误处理**：每个渲染器都有 try-catch，避免单个失败影响整体

## ✅ 健康检查

- [x] 无重复定义
- [x] 职责分离清晰
- [x] 接口统一规范
- [x] 样式已主题化（无内联样式）
- [x] 支持扩展机制
- [x] 文档完整

## 🎨 CSS 类对应关系

所有渲染器使用的 CSS 类都在 `theme.css` 中定义：

| 组件 | CSS 类 |
|------|--------|
| 文本内容 | `.message-content` |
| 工具卡片 | `.tool-call-card`, `.tool-call-header`, `.tool-call-badge`, `.tool-call-name`, `.tool-call-status`, `.tool-call-params`, `.tool-call-result` |
| 搜索结果 | `.search-result-item`, `.search-result-rank`, `.search-result-title`, `.search-result-snippet` |
| 分页控件 | `.pagination-controls`, `.pagination-btn`, `.pagination-info` |
| 加载动画 | `.tool-call-spinner` |

详见 theme.css 中的 "工具调用卡片" 部分。
