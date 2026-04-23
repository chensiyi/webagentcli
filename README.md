# Web Agent Runtime - Chrome Extension

AI Agent 运行时环境，为 AI 提供浏览器交互能力。

## 项目结构

```
├── manifest.json           # Chrome 扩展清单
├── background.js           # Service Worker（核心运行时）
├── content.js              # Content Script（页面交互）
├── sidepanel/              # Side Panel UI
│   ├── sidepanel.html
│   └── sidepanel.jsx
├── src/
│   ├── runtime/            # 运行时模块
│   │   ├── ToolRegistry.js     # 工具注册表
│   │   └── ContextManager.js   # 上下文管理
│   └── connector/          # 连接器（待实现）
└── vendor/                 # 第三方库
    ├── preact.min.js
    └── preact-hooks.umd.js
```

## 安装和测试

### 1. 准备图标文件

在 `assets/icons/` 目录添加以下文件：
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)

可以使用在线工具生成：https://favicon.io/

### 2. 加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本项目根目录（包含 manifest.json 的目录）

### 3. 测试

1. 打开任意网页
2. 点击扩展图标，Side Panel 会在右侧打开
3. 输入消息并发送
4. 查看控制台日志（F12 → Console）

### 4. 调试

**Background Service Worker**：
- 在 `chrome://extensions/` 找到扩展
- 点击 "Service Worker" 链接
- 查看后台日志

**Content Script**：
- 在网页中按 F12
- 查看 Console 标签

**Side Panel**：
- 在 Side Panel 中右键 → "检查"
- 查看 UI 日志

## 架构说明

### 通信流程

```
Side Panel (UI)
    ↓ chrome.runtime.sendMessage
Background (Runtime)
    ↓ chrome.tabs.sendMessage
Content Script (DOM Access)
```

### 核心模块

**ToolRegistry**：向 AI 暴露可用工具
- read_page(selector)
- click_element(selector)
- fill_form(selector, value)
- get_page_info()

**ContextManager**：管理对话上下文
- 会话创建/销毁
- 消息历史
- 页面状态

### 下一步

- [ ] 集成真实的 AI API（OpenRouter/OpenAI）
- [ ] 实现流式响应
- [ ] 添加工具审批机制
- [ ] 优化 UI 样式
- [ ] 添加更多工具（截图、导航等）

## 开发注意事项

1. **ES Modules**：background.js 使用 `type: "module"`，支持 import/export
2. **异步消息**：所有消息处理都是异步的，返回 Promise
3. **持久化**：使用 chrome.storage.local 存储会话数据
4. **隔离世界**：Content Script 运行在独立上下文，无法直接访问页面 JS

## 许可证

MIT
