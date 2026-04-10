# 📌 版本发布快速参考

## 🚀 一键发布 (3命令)

```bash
git add .
git commit -m "你的更新说明"
git tag v2.0.0
git push && git push origin v2.0.0
```

**完成!** GitHub Actions 自动处理剩余工作!

---

## 📋 检查清单

- [ ] 代码已测试
- [ ] 提交信息清晰
- [ ] 版本号正确 (语义化版本)
- [ ] 推送成功

---

## 🔍 验证发布

### 1. 查看 Actions
```
https://github.com/chensiyi/webagentcli/actions
```

### 2. 查看 Releases
```
https://github.com/chensiyi/webagentcli/releases
```

### 3. 下载测试
```
https://github.com/chensiyi/webagentcli/releases/latest/download/agent.user.js
```

---

## ⚡ 常用命令

### 查看当前标签
```bash
git tag -l
```

### 删除错误标签
```bash
git tag -d v2.0.0
git push --delete origin v2.0.0
```

### 查看历史
```bash
git log --oneline --decorate
```

---

## 💡 提示

✅ **自动化**: 只需打标签,版本号自动更新  
✅ **无需手动**: 不用修改 `agent.user.js` 中的 `@version`  
✅ **可追溯**: 每个版本都有独立 Release  
✅ **可回滚**: 随时切换到历史版本  

---

<div align="center">

**简单到不能再简单!** 🎉

</div>
