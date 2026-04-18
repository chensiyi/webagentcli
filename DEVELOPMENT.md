# 🔥 开发模式：热重载指南

## 📦 安装依赖

```bash
npm install --save-dev ws chokidar
```

## 🚀 使用方法

### **1. 启动开发服务器**

```bash
node dev-server.js
```

你会看到：
```
🚀 开发服务器启动中...
📂 监控目录: D:\dev\webagentcli\src
🔌 WebSocket 端口: 8765

👀 正在监控文件变化...

💡 提示:
   1. 在 Tampermonkey 中安装 dist/agent.user.js
   2. 编辑 src/ 目录下的文件
   3. 保存后会自动构建并刷新浏览器
```

### **2. 在 Tampermonkey 中启用开发模式**

确保脚本头部包含：
```javascript
// @grant        GM_info
```

并且 `DEBUG_MODE` 为 `true`（开发构建时自动设置）。

### **3. 开始开发**

- 编辑 `src/` 目录下的任何文件
- 保存文件（Ctrl+S）
- 等待 1-2 秒
- 浏览器自动刷新，加载最新代码！

---

## 🎯 工作流程

```
编辑代码 → 保存文件 → 自动构建 → WebSocket通知 → 浏览器刷新
   ↓                                              ↓
 src/*.js                                    页面重新加载
                                              ↓
                                       运行最新代码 ✨
```

---

## ⚙️ 配置选项

### **修改端口**

编辑 `dev-server.js`：
```javascript
const PORT = 8765; // 改为你想要的端口
```

### **修改防抖时间**

```javascript
}, 1000); // 改为其他毫秒数
```

### **关闭热重载**

在生产构建时，HotReload 模块不会被包含：
```bash
# 发布模式（不包含 HotReload）
node build.js --release

# 或者设置环境变量
set RELEASE=true && node build.js
```

---

## 🐛 故障排查

### **问题 1: WebSocket 连接失败**

**症状**: 控制台显示 `[HotReload] ❌ 连接断开`

**解决**:
1. 确认 `dev-server.js` 正在运行
2. 检查防火墙是否阻止了端口 8765
3. 尝试访问 `ws://localhost:8765` 确认服务器正常

### **问题 2: 浏览器没有自动刷新**

**症状**: 文件保存后构建了，但页面没刷新

**解决**:
1. 确认 `DEBUG_MODE` 为 `true`
2. 检查控制台是否有 `[HotReload] 🚀 热重载已启用`
3. 手动刷新一次页面重新建立 WebSocket 连接

### **问题 3: 构建失败**

**症状**: 控制台显示 `❌ 构建失败`

**解决**:
1. 查看错误信息
2. 修复代码错误
3. 重新保存文件触发构建

---

## 💡 最佳实践

### **1. 保持开发服务器运行**

在一个终端窗口中持续运行：
```bash
node dev-server.js
```

### **2. 使用 VS Code 自动保存**

设置 VS Code：
```json
{
    "files.autoSave": "afterDelay",
    "files.autoSaveDelay": 1000
}
```

### **3. 多标签页同步刷新**

打开多个标签页测试时，所有标签页都会同时刷新！

### **4. 生产发布前关闭**

发布前使用正式构建：
```bash
node build.js --release
```

---

## 🎨 高级用法

### **自定义刷新延迟**

编辑 `src/core/HotReload.js`：
```javascript
setTimeout(() => {
    window.location.reload();
}, 3000); // 改为其他毫秒数
```

### **添加构建前检查**

在 `dev-server.js` 的 `build()` 函数中添加：
```javascript
// 运行 ESLint
exec('npm run lint', (error) => {
    if (error) {
        console.error('❌ 代码检查失败');
        return;
    }
    // 继续构建...
});
```

### **支持多个项目**

为不同项目使用不同端口：
```javascript
const PORT = process.env.HMR_PORT || 8765;
```

---

## 📊 性能影响

| 操作 | 耗时 |
|------|------|
| 文件检测 | < 100ms |
| 自动构建 | 1-3s |
| WebSocket 通知 | < 50ms |
| 浏览器刷新 | 1-2s |
| **总计** | **2-5s** |

---

## 🔄 与传统方式对比

| 特性 | 传统方式 | 热重载 |
|------|---------|--------|
| 编辑代码 | ✅ | ✅ |
| 手动构建 | ❌ 需要 | ✅ 自动 |
| 手动刷新 | ❌ 需要 | ✅ 自动 |
| 开发效率 | 🐢 慢 | 🚀 快 |
| 适用场景 | 生产发布 | 日常开发 |

---

## 🎉 享受高效开发！

现在你可以专注于编写代码，剩下的交给自动化工具！
