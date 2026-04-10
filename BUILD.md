# 🔧 构建指南

## 📋 前置要求

- **Node.js** (v14 或更高版本) - https://nodejs.org/
- **npm** (随 Node.js 一起安装)

---

## 🚀 快速构建

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/openrouter-browser-agent.git
cd openrouter-browser-agent
```

### 2. 运行构建

```bash
node build.js
```

### 3. 输出结果

构建完成后,会在 `dist/` 目录生成:
- `dist/agent.user.js` - 合并后的完整脚本 (约 60 KB)

---

## 📦 构建流程

### 模块合并顺序

构建脚本会按以下顺序合并所有模块:

1. **UserScript Header** - Tampermonkey 元数据
2. **config.js** - 配置管理
3. **models.js** - 模型管理
4. **ui.js** - UI 界面
5. **api.js** - API 调用
6. **chat.js** - 聊天逻辑
7. **settings.js** - 设置对话框
8. **utils.js** - 工具函数
9. **main.js** - 主入口

### 自动化步骤

✅ 自动添加 UserScript 头部  
✅ 按依赖顺序合并模块  
✅ 生成最终的可安装文件  
✅ 显示文件大小信息  

---

## 🎯 指定版本号

### 方法 1: 环境变量

```bash
# Windows PowerShell
$env:VERSION="2.1.0"; node build.js

# Linux/Mac
VERSION=2.1.0 node build.js
```

### 方法 2: 手动修改

编辑 `build.js`,修改默认版本:

```javascript
const VERSION = process.env.VERSION || '2.1.0'; // 修改这里
```

---

## 🔄 开发工作流

### 日常开发

```bash
# 1. 修改 src/ 下的模块文件
# 例如: src/ui.js, src/chat.js

# 2. 运行构建
node build.js

# 3. 测试 dist/agent.user.js
# 拖拽到浏览器安装

# 4. 如果测试通过,复制到根目录
Copy-Item dist\agent.user.js agent.user.js
```

### 发布新版本

```bash
# 1. 更新版本号
$env:VERSION="2.1.0"; node build.js

# 2. 复制到根目录
Copy-Item dist\agent.user.js agent.user.js

# 3. 提交代码
git add .
git commit -m "Release v2.1.0"

# 4. 创建标签
git tag v2.1.0
git push origin v2.1.0
```

GitHub Actions 会自动创建 Release!

---

## 🛠️ 自定义构建

### 修改输出目录

编辑 `build.js`:

```javascript
const DIST_DIR = path.join(__dirname, 'output'); // 修改为你想要的目录
```

### 添加新模块

1. 在 `src/` 下创建新模块文件
2. 在 `build.js` 的 modules 数组中添加:

```javascript
const modules = [
    'config.js',
    'models.js',
    'ui.js',
    'api.js', 
    'chat.js',
    'settings.js',
    'utils.js',
    'main.js',
    'your-new-module.js'  // 添加这里
];
```

3. 运行 `node build.js`

---

## 📊 构建输出示例

```
🔨 开始构建 OpenRouter AI Agent...
📦 版本: 2.0.0
✅ 已添加: config.js
✅ 已添加: models.js
✅ 已添加: ui.js
✅ 已添加: api.js
✅ 已添加: chat.js
✅ 已添加: settings.js
✅ 已添加: utils.js
✅ 已添加: main.js

✨ 构建完成!
📄 输出文件: D:\dev\webagentcli\dist\agent.user.js
📊 文件大小: 60.2 KB

💡 提示: 将 dist/agent.user.js 安装到 Tampermonkey 即可使用
```

---

## ❓ 常见问题

### Q: 构建失败,提示找不到模块?

A: 确保所有模块文件都在 `src/` 目录下,并且文件名正确。

### Q: 如何调试单个模块?

A: 
1. 直接在浏览器中测试 `dist/agent.user.js`
2. 打开浏览器控制台查看错误
3. 根据错误定位到具体模块
4. 修改后重新构建

### Q: 构建后的文件太大?

A: 
- 当前约 60 KB,对于 UserScript 来说很正常
- 可以移除不需要的功能来减小体积
- 未来可以添加压缩步骤

### Q: 可以自动化构建吗?

A: 可以!使用 npm scripts:

创建 `package.json`:
```json
{
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js && copy dist\\agent.user.js agent.user.js"
  }
}
```

然后运行:
```bash
npm run build
```

---

## 🔗 相关链接

- [Tampermonkey 开发文档](https://wiki.greasespot.net/Main_Page)
- [UserScript 规范](https://wiki.greasespot.net/Metadata_Block)
- [Node.js 文档](https://nodejs.org/docs/latest/api/)

---

<div align="center">

**🔧 构建系统让开发更高效!**

</div>
