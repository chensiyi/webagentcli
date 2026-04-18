# src/ - v5.0 重构目录

**创建日期**: 2026-04-19  
**版本**: v5.0.0-alpha  
**状态**: 🚧 重构中

---

## 📁 目录结构

```
src/
├── main.js                       # 程序启动层（园区建设）
│
├── business/                     # 业务逻辑层（园区工厂）
│   ├── WebAgentClient.js         # 业务编排器
│   ├── SessionManager.js         # 会话管理
│   └── ErrorHandler.js           # 错误处理策略
│
├── infrastructure/               # 基础设施层（生产设备）
│   └── AIAgent/                  # AI Agent
│       ├── index.js              # Agent 核心
│       ├── CodeExecutor.js       # 代码执行器
│       └── ContextBuilder.js     # 上下文构建器
│
├── services/                     # 服务层
│   ├── api/                      # API 客户端
│   │   ├── BaseAPIClient.js      # 基础类
│   │   ├── OpenRouterClient.js   # OpenRouter
│   │   ├── LMStudioClient.js     # LM Studio
│   │   └── index.js              # 工厂
│   ├── page-analyzer/            # 页面分析
│   │   └── PageAnalyzer.js       # 页面分析器
│   ├── model-manager/            # 模型管理
│   │   └── ModelManager.js       # 模型管理器
│   ├── config/                   # 配置管理
│   │   └── ConfigManager.js      # 配置管理器
│   ├── storage/                  # 存储管理
│   │   └── StorageManager.js     # 统一存储接口
│   └── provider/                 # 供应商管理
│       └── ProviderManager.js    # 供应商管理器
│
├── app/                          # 应用层
│   ├── ui/                       # UI 模块 - React
│   │   ├── index.jsx             # React 根组件
│   │   ├── components/           # UI 组件
│   │   │   ├── ChatWindow.jsx    # 聊天窗口
│   │   │   ├── MessageList.jsx   # 消息列表
│   │   │   ├── MessageItem.jsx   # 单条消息
│   │   │   ├── CodeBlock.jsx     # 代码块
│   │   │   ├── SettingsDialog.jsx# 设置对话框
│   │   │   ├── ModelSelector.jsx # 模型选择器
│   │   │   └── Toolbar.jsx       # 工具栏
│   │   ├── hooks/                # React Hooks
│   │   │   ├── useAgent.js       # 连接 WebAgentClient
│   │   │   ├── useMessages.js    # 消息状态管理
│   │   │   └── useSettings.js    # 设置状态管理
│   │   └── styles/               # 样式
│   │       ├── global.css        # 全局样式
│   │       └── components.css    # 组件样式
│   └── shortcuts/                # 快捷键
│       └── ShortcutManager.js    # 快捷键管理
│
├── core/                         # 核心工具层
│   ├── utils.js                  # 工具函数
│   ├── EventManager.js           # 事件总线
│   └── ErrorTracker.js           # 错误追踪
│
└── vendor/                       # 第三方库
    ├── react.production.min.js   # React 运行时
    └── react-dom.production.min.js # ReactDOM
```

---

## 🔄 迁移状态

### ✅ 已完成
- [x] 目录结构创建
- [ ] Phase 1: Main 和 WebAgentClient 职责明确

### 🚧 进行中
- [ ] 从 src_v3 迁移核心模块

### ⏳ 待开始
- [ ] React 环境搭建
- [ ] UI 组件开发
- [ ] 完整测试

---

## 📝 开发指南

### 1. 从 src_v3 迁移文件

```bash
# 复制核心工具层
cp src_v3/core/utils.js src/core/
cp src_v3/core/EventManager.js src/core/
cp src_v3/core/ErrorTracker.js src/core/

# 复制已创建的模块
cp src_v3/agent/index.js src/infrastructure/AIAgent/
cp src_v3/agent/WebAgentClient.js src/business/
cp src_v3/agent/CodeExecutor.js src/infrastructure/AIAgent/

# 复制 API 客户端
cp src_v3/api/*.js src/services/api/

# 复制其他服务
cp src_v3/core/PageAnalyzer.js src/services/page-analyzer/
cp src_v3/core/ProviderManager.js src/services/provider/
cp src_v3/core/ConfigManager.js src/services/config/
cp src_v3/core/UnifiedStateManager.js src/services/storage/StorageManager.js
cp src_v3/core/ShortcutManager.js src/app/shortcuts/
cp src_v3/models.js src/services/model-manager/ModelManager.js
```

### 2. 下载 React 库

```bash
# 进入 vendor 目录
cd src/vendor

# 下载 React
curl -o react.production.min.js https://unpkg.com/react@18/umd/react.production.min.js
curl -o react-dom.production.min.js https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
```

### 3. 更新 build.js

修改 `build.js` 中的模块路径，指向新的目录结构。

---

## 🎯 下一步行动

1. **Phase 1**: 从 src_v3 迁移核心模块到新的目录结构
2. **Phase 2**: 重构 main.js，明确职责
3. **Phase 3**: 引入 React 基础环境
4. **Phase 4+**: 逐步完成后续 Phase

---

**参考文档**: 
- [ARCHITECTURE_v5_DESIGN.md](../ARCHITECTURE_v5_DESIGN.md) - 详细设计
- [ARCHITECTURE_v5_SUMMARY.md](../ARCHITECTURE_v5_SUMMARY.md) - 快速概览

**备份目录**: `src_v3/` - 包含 v3.9.8 的完整源代码
