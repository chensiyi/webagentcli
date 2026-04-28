# Modules 模块目录

## 📁 目录结构

```
modules/
├── agent/          # AI Agent 核心模块
│   ├── models/     # 模型管理
│   ├── multimodal/ # 多模态处理
│   ├── InputController.js
│   ├── SessionManager.js
│   └── agent.js
├── scripts/        # 用户脚本管理
│   ├── UserScriptStorage.js
│   ├── UserScriptMetadata.js
│   ├── UserScriptSandbox.js
│   └── UserScriptManager.js
├── storage/        # 存储管理
│   └── SettingsStorage.js
└── tools/          # 工具实现
    ├── BaseToolManager.js
    ├── SearchTool.js
    ├── FetchTool.js
    ├── CodeTool.js
    ├── TerminalManager.js
    └── TerminalTool.js
```

## 🎯 职责说明

### agent/ - AI Agent 核心
**职责**：提供 AI 对话的核心功能

#### models/
- **ModelManager.js** - 模型管理器，负责获取和管理可用模型列表
- **ModelSelector.js** - 模型选择器 UI 组件

#### multimodal/
- **ImageHandler.js** - 图片处理（上传、预览、Base64转换）
- **AudioHandler.js** - 音频处理
- **VideoHandler.js** - 视频处理
- **MediaManager.js** - 多媒体统一管理器，整合所有媒体类型

#### 核心文件
- **InputController.js** - 输入控制器，管理用户输入状态
- **SessionManager.js** - 会话管理器，管理对话历史和当前会话
- **agent.js** - Agent 主类，协调各组件工作

**全局变量导出**：
- `window.InputController` (class)
- `window.SessionManager` (instance)
- `window.Agent` (class)
- `window.ModelManager` (通过 ModelSelector 间接使用)
- `window.MediaManager` (class)
- `window.ImageHandler`, `window.AudioHandler`, `window.VideoHandler`

---

### scripts/ - 用户脚本管理
**职责**：管理用户脚本的存储、元数据、沙箱和执行

- **UserScriptStorage.js** - 脚本存储到 chrome.storage
- **UserScriptMetadata.js** - 解析脚本元数据（@name, @match 等）
- **UserScriptSandbox.js** - 脚本沙箱环境
- **UserScriptManager.js** - 脚本管理器（安装、卸载、启用/禁用）

**全局变量导出**：
- `window.UserScriptStorage` (object)
- `window.UserScriptMetadata` (object)
- `window.UserScriptSandbox` (object)
- `window.UserScriptManager` (class)

---

### storage/ - 设置存储
**职责**：管理应用设置的持久化

- **SettingsStorage.js** - 设置的读取、保存、重置

**全局变量导出**：
- `window.SettingsStorage` (class)

---

### tools/ - 工具实现
**职责**：实现各种 AI 可调用的工具

- **BaseToolManager.js** - 工具管理器基类，提供通用功能
- **SearchTool.js** - 网络搜索工具
- **FetchTool.js** - 网页访问工具
- **CodeTool.js** - JavaScript 代码执行工具
- **TerminalManager.js** - 终端管理器（单例）
- **TerminalTool.js** - 终端执行工具

**全局变量导出**：
- `window.SearchTool` (object)
- `window.FetchTool` (object)
- `window.CodeTool` (object)
- `window.TerminalManager` (instance, 单例)
- `window.TerminalTool` (object)

⚠️ **注意**：BaseToolManager 不导出全局变量，仅作为基类使用

---

## 🔗 调用关系

```
app.js
  └─> modules/agent/SessionManager
  └─> modules/agent/InputController
  └─> modules/tools/BaseToolManager
        └─> SearchTool, FetchTool, CodeTool, TerminalTool
  
pages/chat/chat-refactored.js
  └─> window.SessionManager
  └─> window.InputController
  └─> window.MediaManager
  └─> window.ToolManager (由 BaseToolManager 创建)
  
pages/settings.js
  └─> window.SettingsStorage
  
pages/scripts.js
  └─> window.UserScriptManager
```

## ⚠️ 注意事项

1. **加载顺序重要**：modules 必须在 pages 之前加载
2. **单例模式**：TerminalManager 是单例，在加载时立即创建实例
3. **依赖关系**：
   - MediaManager 依赖 ImageHandler, AudioHandler, VideoHandler
   - BaseToolManager 需要各个 Tool 对象注册
   - SessionManager 被多个页面共享

## ✅ 健康检查

- [x] 无重复定义
- [x] 无循环依赖
- [x] 全局变量命名清晰
- [x] 职责分离明确
- [x] 模块化程度高
