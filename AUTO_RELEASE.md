# 🚀 自动版本发布指南

## ✨ 完全自动化!

**你只需要创建一个 Git tag,其他全部自动完成!**

---

## 📋 发布流程 (3步)

### 1️⃣ 提交代码

```bash
git add .
git commit -m "你的更新说明"
```

### 2️⃣ 创建标签

```bash
git tag v2.0.0
```

### 3️⃣ 推送

```bash
git push
git push origin v2.0.0
```

**完成!** 🎉

---

## 🤖 自动化流程

当你推送 tag 后,GitHub Actions 会自动执行:

### Step 1: 检测 Tag
```yaml
on:
  push:
    tags:
      - 'v*'  # 匹配所有 v 开头的标签
```

### Step 2: 提取版本号
```bash
# 从 refs/tags/v2.0.0 提取出 2.0.0
VERSION=${GITHUB_REF#refs/tags/v}
```

### Step 3: 自动更新脚本版本号
```bash
# 自动修改 agent.user.js 中的 @version
sed -i "s/@version.*/@version      $VERSION/" agent.user.js

# 例如:
# 之前: // @version      1.9.0
# 之后: // @version      2.0.0
```

### Step 4: 创建 GitHub Release
- 自动创建 Release 页面
- 标题: `Release v2.0.0`
- 标签: `v2.0.0`

### Step 5: 上传构建产物
- 自动上传 `agent.user.js`
- 用户可以直接下载

---

## 📊 完整示例

```bash
# 假设你修改了一些代码

# 1. 提交
git add .
git commit -m "Feat: 添加新的快捷命令"

# 2. 打标签
git tag v2.1.0

# 3. 推送
git push
git push origin v2.1.0
```

**GitHub Actions 自动处理:**
1. ✅ 检测到 tag `v2.1.0`
2. ✅ 提取版本号 `2.1.0`
3. ✅ 更新 `agent.user.js` 中的 `@version` 为 `2.1.0`
4. ✅ 创建 Release `v2.1.0`
5. ✅ 上传 `agent.user.js`

**最终结果:**
- Release 页面: `https://github.com/你的用户名/webagentcli/releases/tag/v2.1.0`
- 下载地址: `https://github.com/你的用户名/webagentcli/releases/download/v2.1.0/agent.user.js`

---

## ❌ 不再需要手动操作

### 以前 (麻烦):
```bash
# 1. 手动编辑 agent.user.js
# 修改: // @version      2.0.0

# 2. 提交
git add .
git commit -m "..."

# 3. 打标签
git tag v2.0.0

# 4. 推送
git push
git push origin v2.0.0
```

### 现在 (自动):
```bash
# 1. 提交
git add .
git commit -m "..."

# 2. 打标签
git tag v2.0.0

# 3. 推送
git push
git push origin v2.0.0

# GitHub Actions 自动更新版本号!
```

---

## 🔍 验证自动化

推送后,你可以:

### 1. 查看 Actions 运行状态
```
https://github.com/你的用户名/webagentcli/actions
```

### 2. 检查 Release 页面
```
https://github.com/你的用户名/webagentcli/releases
```

### 3. 下载文件验证版本号
```bash
# 下载发布的文件
curl -L https://github.com/你的用户名/webagentcli/releases/download/v2.0.0/agent.user.js -o test.user.js

# 检查版本号
grep "@version" test.user.js
# 输出: // @version      2.0.0
```

---

## 💡 最佳实践

### 1. 版本号规范

遵循语义化版本:
- `v2.0.0` - 重大更新
- `v2.1.0` - 新功能
- `v2.1.1` - Bug 修复

### 2. 提交信息

```bash
git commit -m "Feat: 添加新功能"
git commit -m "Fix: 修复某个问题"
git commit -m "Docs: 更新文档"
```

### 3. 发布频率

- 小修复: 随时发布
- 大功能: 测试充分后发布
- 保持稳定

---

## ⚙️ 技术细节

### GitHub Actions 工作流

位置: `.github/workflows/release.yml`

关键步骤:
```yaml
- name: Get version from tag
  id: get_version
  run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

- name: Update version in script
  run: |
    VERSION=${GITHUB_REF#refs/tags/v}
    sed -i "s/@version.*/@version      $VERSION/" agent.user.js
```

### 正则表达式

```bash
# 匹配 @version 行并替换
s/@version.*/@version      $VERSION/

# 示例:
# 输入: // @version      1.9.0
# 输出: // @version      2.0.0
```

---

## ❓ 常见问题

### Q: 如果忘记打标签怎么办?

A: 可以补打:
```bash
git tag v2.0.0
git push origin v2.0.0
```

### Q: 可以删除错误的 Release 吗?

A: 可以,在 GitHub 网页界面删除 Release 和 tag:
```bash
# 本地删除
git tag -d v2.0.0

# 远程删除
git push --delete origin v2.0.0
```

然后重新打标签推送。

### Q: Actions 失败了怎么办?

A: 查看 Actions 日志,修复问题后:
```bash
# 删除失败的 tag
git tag -d v2.0.0
git push --delete origin v2.0.0

# 修复问题后重新打标签
git tag v2.0.0
git push origin v2.0.0
```

### Q: 可以在本地测试构建吗?

A: 可以:
```bash
node build.js
# 输出: dist/agent.user.js
```

---

## 🎯 总结

**核心原则: 只打标签,其他全自动!**

```bash
git tag v2.0.0
git push origin v2.0.0
```

就这么简单! 🎉

---

<div align="center">

**🤖 让机器做重复的工作!**

</div>
