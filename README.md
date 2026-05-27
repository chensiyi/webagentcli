# Web Agent Client

Web Agent Client 是基于 Chrome Manifest V3 的侧边栏 AI Agent 浏览器扩展。它在浏览器内提供 Chat 交互、会话管理、AI Provider 配置和网页工具调用能力。

## 主要功能

- 侧边栏 Chat UI：在任意网页中启动对话
- 多 Provider 支持：OpenAI、OpenRouter、LM Studio
- 会话与历史管理
- 本地存储用户设置与对话数据
- 可扩展脚本和工具执行能力

## 快速开始

1. 克隆仓库：

```bash
git clone <repository-url>
cd webagentcli
```

2. 在 Chrome 打开 `chrome://extensions/`
3. 启用“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前仓库根目录（包含 `manifest.json`）

## 使用说明

1. 打开任意网页。
2. 点击浏览器工具栏中的扩展图标。
3. 侧边栏打开后，进入“设置”页面。
4. 选择 AI Provider，并填写 API Key / Endpoint 配置。
5. 切换到“Chat”页面，输入问题并发送。

> 注意：如果扩展没有正确加载，请确认 `manifest.json` 存在且 `sidepanel/` 目录可访问。

## 目录概览

- `manifest.json` - Chrome 扩展清单
- `sidepanel/` - 扩展侧边栏 UI 与核心前端逻辑
- `assets/` - 静态资源与图标
- `docs/` - 详细文档与架构说明
- `LICENSE` - 开源许可

## 详细文档

- 架构与组件：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 核心模型：[docs/CORE_MODELS.md](docs/CORE_MODELS.md)
- 侧边栏模块：[sidepanel/README.md](sidepanel/README.md)

## 开发与调试

- 侧边栏：打开扩展后右键选择“检查”
- Service Worker：在 `chrome://extensions/` 中打开扩展卡片的 Service Worker 调试窗口
- Content Script：在任意网页 DevTools Console 中查看日志

## 许可证

本项目遵循 [LICENSE](LICENSE) 中的开源协议。
 
