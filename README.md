# OpenRouter Free AI Agent

一个基于 OpenRouter 免费模型的浏览器 AI 助手,**完全免费**,支持 JavaScript 代码执行!

## ✨ 功能特性

- 💬 **智能对话** - 使用 OpenRouter 免费模型 (Gemma, Llama, Qwen, DeepSeek 等)
- 💻 **代码执行** - 直接在浏览器中执行 JavaScript
- 🎯 **页面操作** - 分析和操作当前网页元素
- 💾 **本地存储** - 对话历史自动保存
- 🆓 **完全免费** - 无需付费,只需邮箱注册
- 🔄 **模型刷新** - 一键获取最新免费模型列表

## 🚀 快速开始

### 1. 安装 Tampermonkey

- **Chrome/Edge**: [Tampermonkey Chrome Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- **Firefox**: [Tampermonkey Firefox Add-on](https://addons.mozilla.org/firefox/addon/tampermonkey/)

### 2. 获取 OpenRouter API Key (免费!)

1. 访问: https://openrouter.ai/
2. 点击 "Sign In" (使用邮箱/GitHub/Google)
3. 访问: https://openrouter.ai/keys
4. 点击 "Create Key",复制 API Key (格式: sk-or-v1-xxxxx)

**💰 费用: ¥0!** 所有标记 `:free` 的模型完全免费!

### 3. 安装脚本

#### 方式 A: 直接安装 (简单)

1. 下载 [`agent.user.js`](agent.user.js)
2. 拖拽到浏览器窗口,Tampermonkey 会自动弹出安装界面
3. 点击 "安装"

或者:
1. 点击 Tampermonkey 图标 → "管理面板"
2. 点击 "+" 创建新脚本
3. 复制 `agent.user.js` 的内容并粘贴
4. 按 Ctrl+S 保存

#### 方式 B: 从源码构建 (开发者)

```bash
# 克隆仓库
git clone https://github.com/你的用户名/openrouter-browser-agent.git

# 进入目录
cd openrouter-browser-agent

# 运行构建
node build.js

# 输出: dist/agent.user.js
```

### 4. 配置

1. 刷新任意网页
2. 右下角出现 "✨ OpenRouter AI" 窗口
3. 点击 "⚙️ 设置"
4. 粘贴 API Key
5. 选择模型 (推荐 Auto 模式)
6. 点击 "保存"

**完成!开始使用!** 🎉

## 💬 使用方法

### 基本对话

直接输入问题,例如:
- "帮我分析这个页面"
- "提取页面上所有链接"
- "如何修改背景色?"

### 快捷命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/js [代码]` | 执行 JavaScript | `/js alert('Hello')` |
| `/clear` | 清空对话 | `/clear` |
| `/help` | 显示帮助 | `/help` |

### 代码执行

当 AI 回复中包含 JavaScript 代码块时:
- 点击 "▶ 执行代码" 按钮直接运行
- 点击 "📋 复制" 按钮复制代码

### 实用示例

```javascript
// 修改背景色
/js document.body.style.background = 'blue'

// 提取所有链接
/js Array.from(document.querySelectorAll('a')).map(a => a.href).join('\n')

// 隐藏图片
/js document.querySelectorAll('img').forEach(img => img.style.display = 'none')
```

## ⚙️ 设置说明

### 模型选择

**推荐模型:**
- 🎲 **Auto** (智能路由) - 自动选择最佳可用模型 ⭐
- 🌟 **Gemma 3 12B** - Google 出品,平衡性好
- 💬 **Qwen 2.5 72B** - 中文支持优秀
- 🧠 **DeepSeek R1** - 推理能力强
- ⚡ **Mistral 7B** - 响应速度快

**提示:** 点击 "🔄 刷新" 按钮可获取最新的免费模型列表!

### 其他设置

- **Temperature**: 控制回复随机性 (0-1,推荐 0.7)
- **Top P**: 核采样参数 (0-1,推荐 0.95)
- **Max Tokens**: 最大输出长度 (100-4096)
- **JS Execution**: 是否允许执行代码

## ❓ 常见问题

### Q: 真的完全免费吗?
A: 是的!所有标记 `:free` 的模型完全免费,无隐藏费用。

### Q: 有使用限制吗?
A: 有速率限制 (每分钟约 20-30 次),但对个人使用完全足够。

### Q: 国内可以访问吗?
A: OpenRouter 在大部分地区可直接访问。如无法访问,可能需要网络代理。

### Q: 如何查看更多免费模型?
A: 访问 https://openrouter.ai/models?q=free 或在设置中点击 "🔄 刷新" 按钮。

### Q: Auto 模式是什么?
A: Auto 会让 OpenRouter 自动从可用免费模型中选择最佳的,推荐使用!

## 🔗 相关链接

- **OpenRouter 官网**: https://openrouter.ai/
- **获取 API Key**: https://openrouter.ai/keys
- **免费模型列表**: https://openrouter.ai/models?q=free
- **API 文档**: https://openrouter.ai/docs

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📦 版本管理

本项目使用 GitHub Releases 进行版本管理：

- **最新版本**: [Releases 页面](https://github.com/你的用户名/openrouter-browser-agent/releases/latest)
- **历史版本**: [所有 Releases](https://github.com/你的用户名/openrouter-browser-agent/releases)
- **版本加载器**: 使用 `version-loader.user.js` 自动管理版本

详细说明请查看: [RELEASE_GUIDE.md](RELEASE_GUIDE.md)

## 📚 文档

- **[架构文档](ARCHITECTURE.md)** - 完整的系统架构说明
- **[构建指南](BUILD.md)** - 如何从源码构建
- **[模块说明](MODULES.md)** - 各模块功能详解
- **[架构维护指南](ARCHITECTURE_MAINTENANCE_GUIDE.md)** - 如何维护架构文档

---

<div align="center">

**🆓 完全免费 · 开源透明 · 即装即用**

[安装脚本](agent.user.js) · [获取 API Key](https://openrouter.ai/keys)

</div>
