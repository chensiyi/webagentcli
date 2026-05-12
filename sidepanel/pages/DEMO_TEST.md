# Demo 测试指南

## 📋 功能清单

### ✅ 已实现功能

1. **核心模型层**
   - ✅ Message 模型（协议无关）
   - ✅ 节流渲染机制（50ms）
   - ✅ shouldRender() / forceRender()
   - ✅ ToolIntention 模型
   - ✅ Session 模型
   - ✅ Model 模型
   - ✅ MediaContent 模型

2. **UI 功能**
   - ✅ 消息列表展示
   - ✅ 发送消息
   - ✅ 流式响应模拟
   - ✅ 删除消息
   - ✅ 加载状态指示器
   - ✅ Markdown 简单渲染
   - ✅ 自动滚动到底部

3. **交互功能**
   - ✅ Enter 发送消息
   - ✅ Shift+Enter 换行
   - ✅ 停止生成按钮
   - ✅ 悬停显示删除按钮

## 🚀 测试步骤

### 1. 加载扩展

```
1. 打开 Chrome 浏览器
2. 访问 chrome://extensions/
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 sidepanel/ 目录
```

### 2. 打开侧边栏

```
1. 点击浏览器工具栏的扩展图标
2. 或者右键点击扩展图标 → "打开侧边栏"
```

### 3. 测试基本功能

#### 测试 1: 初始消息
- ✅ 应该看到欢迎消息
- ✅ 消息应该有 Markdown 格式（加粗、列表）

#### 测试 2: 发送消息
```
1. 在输入框输入文字
2. 点击"发送"按钮或按 Enter
3. 观察：
   - 用户消息立即显示（蓝色背景）
   - AI 回复开始流式生成（逐字显示）
   - 底部显示"AI 正在思考..."指示器
   - 发送按钮变为"停止"按钮
```

#### 测试 3: 停止生成
```
1. 在 AI 回复时点击"停止"按钮
2. 观察：
   - 流式响应立即停止
   - "停止"按钮变回"发送"按钮
   - 状态栏清空
```

#### 测试 4: 删除消息
```
1. 鼠标悬停在任意消息上
2. 点击右上角的 🗑️ 按钮
3. 观察消息被删除
```

#### 测试 5: 节流渲染
```
1. 发送一条消息
2. 观察 AI 回复是逐字显示的
3. 打开浏览器控制台（F12）
4. 查看 Network 或 Performance 标签
5. 确认 UI 更新频率约为 20fps（50ms 间隔）
```

## 🎨 UI 样式检查

- [ ] 渐变紫色头部
- [ ] 消息气泡有圆角
- [ ] 用户消息蓝色，AI 消息灰色
- [ ] 头像 emoji 正确显示
- [ ] 输入框有焦点样式
- [ ] 按钮有悬停效果
- [ ] 思考指示器动画流畅

## 🔍 控制台检查

打开浏览器控制台（F12），应该看到：

```
[ChatPage] Initializing with new core models...
[App] All modules loaded, initializing new ChatPage...
```

**不应该有错误：**
- ❌ Uncaught SyntaxError
- ❌ Content Security Policy violations
- ❌ Module import errors

## 🐛 常见问题

### 问题 1: 页面空白
**原因**: 核心模型未正确加载  
**解决**: 检查控制台是否有模块导入错误

### 问题 2: 发送按钮无反应
**原因**: 事件绑定失败  
**解决**: 检查 ChatPage.js 是否正确加载

### 问题 3: 样式不显示
**原因**: CSS 文件路径错误  
**解决**: 检查 theme/chat-demo.css 是否存在

### 问题 4: Message is not defined
**原因**: 核心模型导出问题  
**解决**: 确认 js/core/models/index.js 正确导出

## 📊 性能指标

- **首屏加载**: < 1s
- **消息渲染**: 即时
- **流式响应**: 30ms/字符
- **UI 更新频率**: 20fps (50ms 节流)
- **内存占用**: < 50MB

## ✨ 下一步开发

1. **集成真实 API**
   - 连接 LM Studio
   - 替换 simulateStreamResponse

2. **会话管理**
   - 使用 SessionManager
   - 持久化到 storage

3. **工具调用**
   - 集成 ToolController
   - 显示 toolIntentions

4. **多模态支持**
   - 图片上传
   - MediaContent 渲染

## 📝 代码结构

```
sidepanel/
├── pages/
│   ├── ChatPage.js      # 聊天页面逻辑
│   └── init.js          # 应用初始化
├── js/
│   └── core/models/     # 核心模型层
├── theme/
│   └── chat-demo.css    # Demo 样式
└── sidepanel.html       # 主页面
```

## 🎯 成功标准

当你能：
1. ✅ 看到欢迎消息
2. ✅ 发送消息并收到回复
3. ✅ 观察到流式响应效果
4. ✅ 删除消息
5. ✅ 停止生成
6. ✅ 控制台无错误

**Demo 测试通过！** 🎉
