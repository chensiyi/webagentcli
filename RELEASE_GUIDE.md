# 📦 版本管理指南

## 🎯 项目结构

```
openrouter-browser-agent/
├── agent.user.js              # 主脚本文件
├── version-loader.user.js     # 版本加载器 (可选)
├── README.md                  # 使用说明
├── LICENSE                    # 许可证
├── .gitignore                # Git 忽略配置
└── .github/
    └── workflows/
        └── release.yml       # 自动发布工作流
```

---

## 🚀 发布新版本

### 方法 1: 手动发布 (推荐)

#### 步骤 1: 更新版本号

编辑 `agent.user.js`,修改头部版本号:

```javascript
// @version      2.0.1  // 改为你想要的版本号
```

#### 步骤 2: 提交代码

```bash
git add .
git commit -m "Release v2.0.1: 更新说明"
git push
```

#### 步骤 3: 创建 Git Tag

```bash
git tag v2.0.1
git push origin v2.0.1
```

#### 步骤 4: 自动发布

推送 tag 后,GitHub Actions 会自动:
1. 创建 GitHub Release
2. 上传 `agent.user.js` 作为发布资源
3. 生成发布说明

---

### 方法 2: GitHub Web 界面

1. 访问仓库的 **Releases** 页面
2. 点击 **Draft a new release**
3. 选择或创建新 tag (如 `v2.0.1`)
4. 填写发布说明
5. 上传 `agent.user.js` 文件
6. 点击 **Publish release**

---

## 📥 安装不同版本

### 安装最新版本

直接下载最新的 Release:
```
https://github.com/你的用户名/openrouter-browser-agent/releases/latest/download/agent.user.js
```

### 安装指定版本

```
https://github.com/你的用户名/openrouter-browser-agent/releases/download/v2.0.0/agent.user.js
```

替换 `v2.0.0` 为你需要的版本号。

---

## 🔄 使用版本加载器 (高级)

`version-loader.user.js` 可以自动从 GitHub Releases 加载指定版本。

### 配置方法

编辑 `version-loader.user.js`:

```javascript
const CONFIG = {
    // 修改为你的 GitHub 仓库
    GITHUB_USER: 'your-username',
    GITHUB_REPO: 'openrouter-browser-agent',
    
    // 版本选择
    VERSION: 'latest',  // 或指定版本号如 '2.0.0'
    
    // 显示版本信息
    SHOW_VERSION_INFO: true
};
```

### 优势

✅ **自动更新** - 设置为 `latest` 时自动使用最新版本  
✅ **版本切换** - 可以轻松切换到任意历史版本  
✅ **缓存机制** - 网络失败时使用缓存版本  
✅ **版本显示** - 页面角落显示当前版本号  

### 使用方法

1. 安装 `version-loader.user.js` 到 Tampermonkey
2. 配置你的仓库信息
3. 刷新网页,自动加载指定版本

---

## 📋 版本号规范

遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/):

```
主版本号.次版本号.修订号
  MAJOR   . MINOR  . PATCH
```

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修正

**示例:**
- `v2.0.0` - 重大更新
- `v2.1.0` - 新功能
- `v2.1.1` - Bug 修复

---

## 📝 发布检查清单

发布新版本前,请确认:

- [ ] 测试所有核心功能正常
- [ ] 更新 `agent.user.js` 中的版本号
- [ ] 更新 README 中的变更记录
- [ ] 提交所有更改
- [ ] 创建并推送 Git tag
- [ ] 检查 GitHub Actions 是否成功
- [ ] 验证 Release 页面显示正确

---

## 🔗 相关链接

- **Releases 页面**: https://github.com/你的用户名/openrouter-browser-agent/releases
- **最新版本下载**: https://github.com/你的用户名/openrouter-browser-agent/releases/latest
- **GitHub Actions**: https://github.com/你的用户名/openrouter-browser-agent/actions

---

## 💡 最佳实践

### 1. 定期发布

- 小修复: 每周或每两周
- 大功能: 每月或每季度

### 2. 详细的发布说明

```markdown
## v2.1.0 (2026-04-10)

### ✨ 新增
- 功能1
- 功能2

### 🐛 修复
- 问题1
- 问题2

### 🔧 优化
- 优化1
```

### 3. 保持向后兼容

- 尽量不破坏现有功能
- 如有重大变更,提供迁移指南

### 4. 测试充分

- 在多个浏览器测试
- 测试核心功能
- 验证版本加载器

---

<div align="center">

**🎉 享受版本管理的便利!**

</div>
