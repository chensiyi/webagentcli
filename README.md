# AI Browser Agent

🤖 **智能网页交互助手** - 通过 AI 辅助提升你在网页中的交互能力

## ✨ 核心功能

- 💬 **智能对话** - 自然语言与 AI 交互，支持流式响应
- ⚡ **自动执行** - AI 生成代码并自动执行，无需手动操作
- 🔄 **消息队列** - 连续发送多条消息，自动排队处理
- 🛠️ **代码执行** - 直接在浏览器中执行 JavaScript
- 💾 **状态持久化** - 刷新页面后恢复会话和设置
- 🎯 **多模型支持** - OpenRouter、LM Studio、Ollama 等
- ⌨️ **快捷键支持** - 提升操作效率

## 🚀 快速开始

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 获取 API Key (推荐 [OpenRouter](https://openrouter.ai/))
3. 下载 [`dist/agent.user.js`](dist/agent.user.js)
4. 拖拽到浏览器窗口完成安装

### 配置

1. 刷新任意网页，点击右下角 🤖 机器人图标
2. 点击 "⚙️ 设置" 粘贴 API Key
3. 选择模型，保存配置
4. 开始对话！

### 使用示例

```
用户: "帮我点击页面上的登录按钮"
AI: 生成代码 → 自动执行 → 完成 ✅

用户: "获取页面所有链接的 URL"
AI: 生成代码 → 自动执行 → 返回结果 ✅

用户: "滚动到底部，加载更多，重复3次"
AI: 生成代码 → 自动执行 → 完成 ✅
```

## 📦 构建

```bash
node build.js
# 输出: dist/agent.user.js (~370 KB)
```

## 🏗️ 架构

本项目采用**五层架构**设计，完全解耦：

```
Main Layer (程序启动)
  ↓
Business Layer (业务逻辑) - WebAgentClient
  ↓
Infrastructure Layer (基础设施) - AIAgent
  ↓
Service Layer (服务层) - API, Storage, Model Manager...
  ↓
UI Layer (表现层) - React 组件
```

详见 [ARCHITECTURE.md](ARCHITECTURE.md)

## 📚 文档

- **[架构文档](ARCHITECTURE.md)** - 系统架构、核心特性、开发指南
- **[项目结构](PROJECT_STRUCTURE.md)** - 目录说明、版本管理

## 🔄 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------||
| v5.0.0 | 2026-04-19 | 完整重构，双队列，自动执行，React UI |
| v4.x | 2026-04 | 渐进式重构，引入 React |
| v3.x | 2026-03 | 初始版本 |

v3 旧版本代码已归档到 `v3/` 目录。

## 📄 许可证

MIT License

---

<div align="center">

**v5.0.0** | [安装](dist/agent.user.js) | [架构文档](ARCHITECTURE.md) | [Releases](https://github.com/chensiyi/webagentcli/releases)

Made with ❤️ by AI Assistant

</div>
