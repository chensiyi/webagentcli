# Web Agent Client

轻量级 Chrome 扩展，为 AI Agent 提供网页执行与交互能力。顶层文档仅保留项目概览与导航，详细设计与实现放在子 README 和 `docs/` 中。

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
1. 克隆仓库：`git clone <repo-url>`
2. 在 Chrome 中打开 `chrome://extensions/`，启用开发者模式
3. 点击“加载已解压的扩展程序”，选择本项目根目录（包含 `manifest.json`）
4. 打开任意网页，点击扩展图标打开 Side Panel；在设置页配置 AI Provider 的 API Key

## 详细说明
所有实现细节、架构文档和模块级说明请在子目录中查看：主要集中在 [sidepanel/README.md](sidepanel/README.md) 以及 `docs/` 下的文件。

如果你需要我把某部分内容从子 README 汇总回顶层（例如安装说明或快速演示），告诉我需要哪些项。

---
本文件仅作为导航页，详细技术文档与示例请查看上方链接。
