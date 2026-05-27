# Side Panel 模块说明

本文件介绍 `sidepanel/` 目录下的实际结构、启动流程与关键模块，便于开发者理解侧边栏 UI 的实现方式。

## 侧边栏作用与入口

- `sidepanel/sidepanel.html` 是侧边栏的入口页面。
- Chrome 扩展通过 `manifest.json` 中的 `side_panel.default_path` 指向该页面。
- 扩展图标点击会触发 `sidepanel/js/background.js` 中的 `chrome.action.onClicked`，打开侧边栏。

## 运行流程

1. 用户点击扩展图标。
2. Chrome Service Worker `sidepanel/js/background.js` 请求打开侧边栏。
3. `sidepanel.html` 加载时按顺序引入 CSS 和 JS 模块。
4. 最终执行 `js/app.js`，初始化 `ServiceCenter`、加载设置并渲染当前页面。

## 主要目录

- `sidepanel/sidepanel.html` - 侧边栏 HTML 入口，按顺序加载依赖脚本。
- `sidepanel/js/` - JavaScript 代码目录。
- `sidepanel/theme/` - 主题样式文件。

## 侧边栏 JS 结构

### `js/app.js`

应用入口，负责：

- 初始化 `ServiceCenter`
- 加载 `SessionManager` 和用户设置
- 创建页面事件处理器
- 渲染侧边栏主界面与导航

### `js/background.js`

扩展后台 Service Worker，负责：

- 监听扩展图标点击事件
- 打开侧边栏面板

### `js/core/`

核心基础设施层，包括：

- `events/` - 全局事件总线与事件常量
- `models/` - 数据模型定义，如 `Message`、`Session`、`Settings`、`Storage`、`Scripts`

### `js/services/`

服务层，包含：

- `ServiceCenter.js` - 服务中心，组装并暴露各类管理器
- `SessionManager.js` - 会话管理器
- `SettingsManager.js` - 设置管理器
- `StorageManager.js` - 浏览器存储管理
- `ScriptsManager.js` - 用户脚本管理
- `ModelManager.js` - 模型管理
- `ProviderAPIServices/` - 各 Provider API 实现（OpenAI、OpenRouter、LM Studio）

### `js/controllers/`

控制器层，协调 UI 与服务逻辑，当前主要包括：

- `ChatController.js` - 聊天与消息发送逻辑

### `js/pages/`

页面级逻辑与事件处理：

- `ChatPage.js`、`ChatEventHandler.js`
- `HistoryPage.js`
- `SettingsPage.js`、`SettingsEventHandler.js`
- `StoragePage.js`、`StorageEventHandler.js`
- `ScriptsPage.js`、`ScriptsEventHandler.js`

### `js/utils/`

通用工具函数：

- DOM 操作
- Toast 提示
- 对话框/确认框
- Markdown 渲染
- 错误处理

## 侧边栏页面结构

- `Chat`：与 AI 交互的主界面。
- `History`：会话与消息历史查看。
- `Storage`：本地缓存与数据存储查看。
- `Scripts`：用户脚本管理界面。
- `Settings`：AI Provider 配置与模型设置。

## 关键实现点

### `ServiceCenter` 是入口

它负责实例化和管理：

- `SessionManager`
- `SettingsManager`
- `StorageManager`
- `ScriptsManager`
- `ModelManager`

页面与控制器通过 `serviceCenter` 获取所需服务。

### 事件机制

- 全局事件总线在 `js/core/events/EventBus.js`
- 事件名定义在 `js/core/events/Events.js`
- 各页面事件处理器注册监听，触发后更新 UI 或调度服务

### 加载顺序

`sidepanel.html` 的脚本加载顺序非常重要，必须先加载：

1. 工具函数与 UI 组件
2. 核心事件与模型
3. 服务接口与实现
4. 页面事件处理器
5. 页面组件
6. `js/app.js`

## 如何调试

- 打开 `chrome://extensions/`
- 点击“服务工作线程（Service Worker）”调试 `sidepanel/js/background.js`
- 点击扩展图标打开侧边栏后，右键选择“检查”调试前端 UI
- 在侧边栏控制台中查看 `console.log` 输出

## 常见修改点

- 添加新 Provider：修改 `js/services/ProviderAPIServices/` 并在 `sidepanel.html` 中引入新脚本
- 扩展设置项：更新 `js/core/models/Settings.js` 和 `js/pages/SettingsPage.js`
- 新建页面：添加页面 JS 与事件处理器，并在 `js/app.js` 一处挂载即可

## 推荐阅读

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - 架构设计与分层说明
- [docs/CORE_MODELS.md](../docs/CORE_MODELS.md) - 核心数据模型说明
