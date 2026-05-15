# Web Agent Client - Chrome Extension

AI Agent 运行时环境，为 AI 提供浏览器交互能力。
js实现一切软件的时代到了，用天量用户的热情，冲烂软件行业护城河吧！

## 项目结构

/* 重构中 */

## 快速开始

### 安装

1. **下载源码**
   - 从 GitHub 下载最新 release 的 Source code (zip)
   - 或克隆项目：`git clone <repository-url>`

2. **加载扩展**
   - 打开 Chrome，访问 `chrome://extensions/`
   - 启用右上角的“开发者模式”
   - 点击“加载已解压的扩展程序”
   - 选择项目根目录（包含 manifest.json 的目录）

3. **使用**
   - 打开任意网页
   - 点击浏览器工具栏中的扩展图标
   - 右侧会出现 Side Panel 聊天界面
   - 在设置页面配置 API Key 后即可使用

4. **启用用户脚本支持（可选）**
   
   如需运行自定义用户脚本，需要启用 Tampermonkey 兼容模式：
   
   - Chrome 地址栏输入 `chrome://extensions/`
   - 找到 Web Agent Client 扩展
   - 点击“详细信息”
   - 开启“允许访问文件 URL”（如需要）
   - 参考 [Tampermonkey 用户脚本指南](https://tampermonkey.net/faq.php#Q203) 了解更多

### 调试

**Background Service Worker**：
- `chrome://extensions/` → 找到扩展 → 点击 "Service Worker"

**Content Script**：
- 在网页中按 F12 → Console 标签

**Side Panel UI**：
- 在 Side Panel 中右键 → "检查" → Console

详细测试指南见 [TESTING.md](TESTING.md)

## 架构说明

### 通信流程

```
Side Panel (UI)
    ↓ chrome.runtime.connect (长连接)
Background (Runtime)
    ↓ fetch API
AI Provider (OpenRouter/OpenAI/Claude...)
```

### 核心模块

