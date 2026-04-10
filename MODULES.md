# 📦 模块化架构说明

## 🎯 项目结构

```
openrouter-browser-agent/
├── agent.user.js              # 主脚本 (单体版本,可直接使用)
├── version-loader.user.js     # 版本加载器
│
├── src/                       # 源代码模块目录
│   ├── config.js             # 配置管理模块
│   ├── models.js             # 模型管理模块 ⭐ 新增
│   ├── ui.js                 # UI 界面模块 ⭐ 新增
│   ├── api.js                # API 调用模块 (待创建)
│   ├── chat.js               # 聊天逻辑模块 (待创建)
│   ├── settings.js           # 设置对话框模块 (待创建)
│   ├── utils.js              # 工具函数模块 (待创建)
│   └── main.js               # 主入口模块 (待创建)
│
├── dist/                      # 构建输出目录 (自动生成)
│   └── agent.user.js         # 合并后的脚本
│
├── build.js                   # 构建脚本
├── README.md                  # 使用说明
├── RELEASE_GUIDE.md          # 版本管理指南
├── GITHUB_SETUP.md           # GitHub 设置指南
├── MODULES.md                # 本文档
├── LICENSE                   # 许可证
└── .github/
    └── workflows/
        └── release.yml       # CI/CD 工作流
```

---

## 📚 模块说明

### 1. config.js - 配置管理模块

**职责:**
- 管理所有配置项
- 提供配置的读取和保存
- 处理本地存储

**主要功能:**
```javascript
ConfigManager.init()              // 初始化配置
ConfigManager.get(key)            // 获取配置
ConfigManager.set(key, value)     // 设置配置
ConfigManager.getAll()            // 获取所有配置
ConfigManager.saveConversationHistory(history)  // 保存对话历史
```

**配置项:**
- `apiKey` - OpenRouter API Key
- `model` - 当前选择的模型
- `temperature` - 温度参数
- `topP` - Top P 参数
- `maxTokens` - 最大 Token 数
- `jsExecutionEnabled` - JS 执行开关
- `conversationHistory` - 对话历史

---

### 2. models.js - 模型管理模块 ⭐

**职责:**
- 管理可用模型列表
- 从 OpenRouter API 获取最新模型
- 缓存模型数据
- 更新模型选择下拉框

**主要功能:**
```javascript
ModelManager.fetchFreeModels()          // 从 API 获取免费模型
ModelManager.updateModelSelect(models)  // 更新下拉框
ModelManager.loadCachedModels()         // 加载缓存
ModelManager.refreshModels()            // 刷新模型列表
ModelManager.DEFAULT_MODELS             // 默认模型列表
```

**特性:**
- ✅ 自动缓存 (24小时)
- ✅ 智能刷新按钮
- ✅ 提供商图标映射
- ✅ 模型名称格式化

---

### 3. ui.js - UI 界面模块 ⭐

**职责:**
- 创建和管理用户界面
- 处理用户交互事件
- 显示/隐藏助手
- 拖拽功能

**主要功能:**
```javascript
UIManager.createAssistant(config)       // 创建主界面
UIManager.appendMessage(html)           // 追加消息
UIManager.showTypingIndicator()         // 显示打字指示器
UIManager.hideTypingIndicator()         // 隐藏打字指示器
UIManager.updateSendButtonState(state)  // 更新按钮状态
UIManager.updateStatusBadge(hasKey)     // 更新状态徽章
UIManager.show()                        // 显示助手
UIManager.hide()                        // 隐藏助手
```

**界面元素:**
- 主窗口容器
- 标题栏 (支持拖拽)
- 聊天区域
- 输入区域
- 控制按钮

**事件系统:**
```javascript
// 发送消息事件
window.dispatchEvent(new CustomEvent('agent-send-message'))

// 消息已发送事件
window.addEventListener('agent-message-sent', (e) => {
    const message = e.detail;
})

// 打开设置事件
window.addEventListener('agent-open-settings', () => {})

// 清空聊天事件
window.addEventListener('agent-clear-chat', () => {})
```

---

### 4. api.js - API 调用模块 (待创建)

**计划功能:**
- 调用 OpenRouter API
- 处理请求和响应
- 错误处理和重试
- 构建对话上下文

---

### 5. chat.js - 聊天逻辑模块 (待创建)

**计划功能:**
- 处理用户消息
- 管理对话流程
- 快捷命令处理 (/js, /clear, /help)
- 代码执行

---

### 6. settings.js - 设置对话框模块 (待创建)

**计划功能:**
- 创建设置对话框
- 处理配置保存
- 模型刷新功能
- 表单验证

---

### 7. utils.js - 工具函数模块 (待创建)

**计划功能:**
- HTML 转义
- 消息格式化
- 代码块渲染
- 通用工具函数

---

### 8. main.js - 主入口模块 (待创建)

**计划功能:**
- 初始化所有模块
- 协调模块间通信
- 启动应用

---

## 🔧 构建系统

### 使用 build.js 合并模块

```bash
# 安装 Node.js (如果还没有)
# https://nodejs.org/

# 运行构建
node build.js

# 指定版本号
VERSION=2.1.0 node build.js
```

**输出:**
- `dist/agent.user.js` - 合并后的完整脚本

---

## 📝 开发工作流

### 方式 1: 直接修改 agent.user.js (简单)

适合小改动:
1. 编辑 `agent.user.js`
2. 测试
3. 提交

### 方式 2: 模块化开发 (推荐)

适合大改动:
1. 编辑 `src/` 下的模块文件
2. 运行 `node build.js` 构建
3. 测试 `dist/agent.user.js`
4. 将 `dist/agent.user.js` 复制为 `agent.user.js`
5. 提交

---

## 🎨 模块通信

### 事件总线模式

模块之间通过自定义事件通信:

```javascript
// 模块 A 发送事件
window.dispatchEvent(new CustomEvent('my-event', { 
    detail: { data: 'value' } 
}))

// 模块 B 监听事件
window.addEventListener('my-event', (e) => {
    console.log(e.detail.data);
})
```

### 共享状态

通过 `ConfigManager` 共享配置:

```javascript
// 任何模块都可以访问
const apiKey = ConfigManager.get('apiKey');
const model = ConfigManager.get('model');
```

---

## 🚀 下一步

### 短期目标
- [ ] 创建 `api.js` 模块
- [ ] 创建 `chat.js` 模块  
- [ ] 创建 `settings.js` 模块
- [ ] 创建 `utils.js` 模块
- [ ] 创建 `main.js` 模块
- [ ] 完善构建流程

### 中期目标
- [ ] 添加单元测试
- [ ] 添加 TypeScript 支持
- [ ] 优化模块依赖关系
- [ ] 添加模块热重载

### 长期目标
- [ ] 插件系统
- [ ] 主题定制
- [ ] 多语言支持
- [ ] 性能监控

---

## 💡 最佳实践

### 1. 模块职责单一

每个模块只负责一个功能领域。

### 2. 通过事件通信

避免模块间直接调用,使用事件总线。

### 3. 配置集中管理

所有配置通过 `ConfigManager` 访问。

### 4. 保持向后兼容

修改模块时,确保不破坏现有功能。

### 5. 文档化

为每个模块编写清晰的注释。

---

## 🔗 相关链接

- [UserScript 最佳实践](https://wiki.greasespot.net/Main_Page)
- [JavaScript 模块化](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [CustomEvent API](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)

---

<div align="center">

**📦 模块化让代码更清晰、更易维护!**

</div>
