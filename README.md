# Web Agent Client

Web Agent Client 是基于 Chrome Manifest V3 的轻量级侧边栏 AI Agent 扩展。它在浏览器内提供 Chat 交互、会话管理、AI Provider 配置和网页工具调用能力。顶层 README 仅保留项目概览与导航，详细实现与设计见子 README 和 `docs/`。

## 主要内容
- **概览**：项目目标与核心能力。
- **快速开始**：如何加载并运行扩展（最小步骤）。
- **导航**：指向更详细的模块说明与架构文档。

## 快速链接
- Side Panel 说明：[sidepanel/README.md](sidepanel/README.md)
- 架构设计：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 数据模型：[docs/CORE_MODELS.md](docs/CORE_MODELS.md)
- 许可：[LICENSE](LICENSE)

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
6. 打开任意网页并点击扩展图标打开 Side Panel
7. 进入“设置”页面，选择 AI Provider 并填写 API Key / Endpoint
8. 切换到“Chat”页面，输入问题并发送。

## 详细说明
所有实现细节、架构文档和模块级说明请在子目录中查看：主要集中在 [sidepanel/README.md](sidepanel/README.md) 以及 `docs/` 下的文件。

如果你需要我把某部分内容从子 README 汇总回顶层（例如安装说明或快速演示），告诉我需要哪些项。

---
本文件仅作为导航页，详细技术文档与示例请查看上方链接。
