# 🚀 GitHub 版本管理快速开始

## 📋 前置要求

1. **GitHub 账号** - 用于创建仓库和发布
2. **Git 已安装** - 用于版本控制
3. **Tampermonkey** - 浏览器扩展

---

## 第一步: 初始化 Git 仓库

```bash
cd d:\dev\webagentcli

# 初始化 Git
git init

# 添加所有文件
git add .

# 首次提交
git commit -m "Initial commit: OpenRouter Free AI Agent v2.0.0"
```

---

## 第二步: 创建 GitHub 仓库

### 方法 1: 网页创建

1. 访问 https://github.com/new
2. 填写仓库名称: `openrouter-browser-agent`
3. 选择 Public (公开)
4. **不要** 初始化 README (我们已经有 了)
5. 点击 "Create repository"

### 方法 2: 命令行创建 (需要 GitHub CLI)

```bash
gh repo create openrouter-browser-agent --public --source=. --remote=origin
```

---

## 第三步: 关联远程仓库

```bash
# 替换为你的 GitHub 用户名
git remote add origin https://github.com/你的用户名/openrouter-browser-agent.git

# 推送到 GitHub
git push -u origin main
```

---

## 第四步: 配置 GitHub Actions

GitHub Actions 配置文件已经创建好 (`.github/workflows/release.yml`),无需额外配置。

**确保启用了 Actions:**
1. 访问仓库的 **Settings** 页面
2. 左侧菜单找到 **Actions** → **General**
3. 确保选择了 "Allow all actions and reusable workflows"

---

## 第五步: 发布第一个版本

### 方法 1: 使用 Git Tag (推荐)

```bash
# 创建版本号标签
git tag v2.0.0

# 推送标签到 GitHub
git push origin v2.0.0
```

推送后,GitHub Actions 会自动:
- ✅ 创建 Release
- ✅ 上传 `agent.user.js`
- ✅ 生成发布页面

### 方法 2: 手动创建 Release

1. 访问: https://github.com/你的用户名/openrouter-browser-agent/releases
2. 点击 "Draft a new release"
3. Tag version: `v2.0.0`
4. Release title: `Release v2.0.0`
5. 上传 `agent.user.js` 文件
6. 点击 "Publish release"

---

## 第六步: 安装和使用

### 选项 A: 直接安装 (简单)

访问 Releases 页面,下载 `agent.user.js`:
```
https://github.com/你的用户名/openrouter-browser-agent/releases/latest/download/agent.user.js
```

拖拽到浏览器,Tampermonkey 会自动安装。

### 选项 B: 使用版本加载器 (高级)

1. 编辑 `version-loader.user.js`:
   ```javascript
   const CONFIG = {
       GITHUB_USER: '你的用户名',  // 修改这里
       GITHUB_REPO: 'openrouter-browser-agent',
       VERSION: 'latest',
       SHOW_VERSION_INFO: true
   };
   ```

2. 安装 `version-loader.user.js` 到 Tampermonkey
3. 刷新网页,自动加载最新版本

**优势:**
- ✅ 自动更新到最新版本
- ✅ 可切换到任意历史版本
- ✅ 网络失败时使用缓存

---

## 🔄 发布新版本

当你更新了代码,想发布新版本时:

```bash
# 1. 更新 agent.user.js 中的版本号
# 编辑文件,修改: // @version      2.0.1

# 2. 提交更改
git add .
git commit -m "Update to v2.0.1"

# 3. 创建新标签
git tag v2.0.1

# 4. 推送
git push
git push origin v2.0.1
```

GitHub Actions 会自动创建新的 Release!

---

## 📊 查看发布状态

### 查看 Actions 运行状态
```
https://github.com/你的用户名/openrouter-browser-agent/actions
```

### 查看所有 Releases
```
https://github.com/你的用户名/openrouter-browser-agent/releases
```

### 下载特定版本
```
https://github.com/你的用户名/openrouter-browser-agent/releases/download/v2.0.0/agent.user.js
```

---

## ❓ 常见问题

### Q: GitHub Actions 没有自动运行?

A: 检查:
1. 是否正确推送了 tag (`git push origin v2.0.0`)
2. Actions 是否启用 (Settings → Actions)
3. 查看 Actions 页面的日志

### Q: 如何修改版本号?

A: 编辑 `agent.user.js`:
```javascript
// @version      2.0.1  // 修改这个数字
```

### Q: 可以回滚到旧版本吗?

A: 可以!
- 使用版本加载器: 修改 `VERSION: '2.0.0'`
- 或直接下载旧版本的 Release

### Q: 如何让其他人使用?

A: 分享这个链接:
```
https://github.com/你的用户名/openrouter-browser-agent/releases/latest/download/agent.user.js
```

他们只需点击链接,Tampermonkey 就会自动安装。

---

## 💡 最佳实践

### 1. 版本号规范

- `v2.0.0` - 重大更新
- `v2.1.0` - 新功能
- `v2.1.1` - Bug 修复

### 2. 提交信息

```bash
git commit -m "Fix: 修复模型刷新按钮样式问题"
git commit -m "Feat: 添加 Auto 智能路由模式"
git commit -m "Docs: 更新使用说明"
```

### 3. 发布频率

- 小修复: 每周
- 大功能: 每月
- 保持稳定,不要频繁发布

### 4. 测试

发布前务必测试:
- ✅ 核心功能正常
- ✅ 在不同浏览器测试
- ✅ 版本加载器工作正常

---

## 🔗 相关链接

- **GitHub Docs**: https://docs.github.com/en/repositories
- **Semantic Versioning**: https://semver.org/
- **GitHub Actions**: https://docs.github.com/en/actions
- **Tampermonkey**: https://www.tampermonkey.net/

---

<div align="center">

**🎉 现在你有了完整的版本管理系统!**

[查看示例仓库](https://github.com/) · [报告问题](https://github.com/你的用户名/openrouter-browser-agent/issues)

</div>
