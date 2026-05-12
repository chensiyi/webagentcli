# Chrome 扩展项目结构

## 目录结构

```
webagentcli/
├── background/              # Service Worker（后台脚本）
│   ├── background.js       # 主后台脚本
│   ├── message-transformer.js
│   ├── script-injector.js
│   └── stream-core.js
│
├── sidepanel/               # 侧边栏面板
│   ├── sidepanel.html      # 主页面 HTML
│   │
│   ├── js/                 # JavaScript 模块（新架构 - React 风格）
│   │   ├── core/          # 核心业务层（协议无关）
│   │   │   ├── models/    # 5个核心模型
│   │   │   │   ├── Model.js
│   │   │   │   ├── MediaContent.js
│   │   │   │   ├── ToolIntention.js
│   │   │   │   ├── Message.js
│   │   │   │   ├── Session.js
│   │   │   │   └── index.js
│   │   │   ├── events/    # 事件系统
│   │   │   │   └── EventBus.js
│   │   │   └── stores/    # 数据管理
│   │   │       ├── SessionManager.js
│   │   │       └── ToolRegistry.js
│   │   │
│   │   ├── adapters/      # 协议适配层
│   │   │   ├── ProtocolAdapter.js
│   │   │   └── lm-studio/
│   │   │       └── LMStudioAdapter.js
│   │   │
│   │   ├── controllers/   # 控制器层（React 风格）
│   │   │   └── ChatController.js
│   │   │
│   │   ├── services/      # 服务层
│   │   │   └── AdapterService.js
│   │   │
│   │   └── ui/            # UI 层（React 风格）
│   │       ├── components/
│   │       │   └── ChatMessageList.js
│   │       └── hooks/
│   │           └── useChat.js
│   │
│   ├── modules/            # 业务模块（旧架构，待迁移）
│   │   ├── agent/         # Agent 相关
│   │   ├── api/           # API 服务
│   │   ├── tools/         # 工具管理
│   │   └── ...
│   │
│   ├── pages/              # 页面脚本（旧架构）
│   │   ├── chat/          # 聊天页面
│   │   ├── settings.js    # 设置页面
│   │   └── ...
│   │
│   ├── theme/              # CSS 样式
│   │   ├── variables.css
│   │   ├── layout.css
│   │   ├── chat-components.css
│   │   └── ...
│   │
│   └── utils/              # 工具函数
│       ├── markdown.js
│       ├── toast.js
│       └── ...
│
├── content.js              # 内容脚本（注入到网页）
├── manifest.json           # Chrome 扩展清单文件
├── assets/                 # 静态资源
│   └── icons/             # 扩展图标
│
├── docs/                   # 项目文档
│   ├── ARCHITECTURE.md    # 架构设计
│   ├── CORE_MODELS.md     # 核心模型说明
│   └── ...
│
└── sidepanel_bak/          # 旧项目备份（开发参考）
```

## Chrome 扩展标准说明

### 1. Background (Service Worker)

**位置**: `background/`

Chrome Manifest V3 要求 Service Worker 放在根目录或指定路径。

**功能**:
- 处理扩展后台逻辑
- 管理长期运行的任务
- 监听扩展事件
- 与 content scripts 通信

**关键文件**:
- `background.js` - 主入口
- `stream-core.js` - 流式请求处理
- `message-transformer.js` - 消息转换
- `script-injector.js` - 脚本注入

### 2. Side Panel (侧边栏)

**位置**: `sidepanel/`

这是扩展的主要 UI 界面，通过点击扩展图标打开。

**HTML 入口**: `sidepanel/sidepanel.html`

**JavaScript 架构**:

#### 新架构 (`sidepanel/js/`)
采用 React 风格的分层架构：

```
js/
├── core/          # 核心业务逻辑（协议无关）
├── adapters/      # API 协议适配
├── controllers/   # 状态管理和业务编排
├── services/      # 通用服务
└── ui/            # UI 组件和 Hooks
```

**特点**:
- ✅ 完全协议无关
- ✅ React 风格的状态管理
- ✅ 组件化 UI
- ✅ 清晰的分层结构

#### 旧架构 (`sidepanel/modules/`, `pages/`)
保留的旧代码，用于逐步迁移参考。

### 3. Content Scripts

**位置**: `content.js`（根目录）

注入到所有网页中执行的脚本。

**功能**:
- 操作 DOM
- 与网页交互
- 收集页面信息
- 与 background/service worker 通信

### 4. Web Accessible Resources

在 `manifest.json` 中配置的资源可以被网页访问：

```json
"web_accessible_resources": [
  {
    "resources": [
      "plugins/*",
      "vendor/*",
      "sandbox/*",
      "sidepanel/*",
      "sidepanel/js/*",
      "sidepanel/theme/*"
    ],
    "matches": ["<all_urls>"]
  }
]
```

## 开发指南

### 加载扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `webagentcli/` 目录

### 调试

**Background Script**:
- 在 `chrome://extensions/` 中找到扩展
- 点击"service worker"链接
- 打开 DevTools 进行调试

**Side Panel**:
- 点击扩展图标打开侧边栏
- 右键点击侧边栏 → "检查"
- 打开 DevTools

**Content Script**:
- 在任何网页上右键 → "检查"
- 切换到 Console 标签
- Content script 的日志会显示在这里

### 构建流程

当前是开发版本，直接加载源码即可。

未来可以添加构建步骤：
- 使用 Webpack/Vite 打包
- 压缩和优化代码
- 生成生产版本

## 架构演进

### 当前状态

- ✅ 新架构核心已完成（core/models, adapters, controllers, ui）
- ⏳ 旧架构代码保留作为参考
- ⏳ 逐步迁移旧功能到新架构

### 迁移计划

1. **Phase 1**: 完成核心模型层（已完成）
2. **Phase 2**: 实现 Controller 层（进行中）
3. **Phase 3**: 实现 UI 组件（进行中）
4. **Phase 4**: 迁移现有功能
   - 聊天功能
   - 工具执行
   - 设置管理
   - 历史记录
5. **Phase 5**: 删除旧代码

## 相关文件

- [manifest.json](../manifest.json) - Chrome 扩展配置
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) - 详细架构设计
- [CORE_MODELS.md](../docs/CORE_MODELS.md) - 核心模型说明
- [README_NEW.md](../README_NEW.md) - 新架构详细说明
