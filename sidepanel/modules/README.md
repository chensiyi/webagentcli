# Modules 目录结构

## 概述
Modules 目录包含核心业务逻辑模块，按功能模块组织。

## 目录结构

```
modules/
├── models/                    # 模型相关管理
│   └── ModelCapabilityDetector.js    # 模型能力检测（视觉、音频、工具支持）
├── scripts/                   # 用户脚本管理
│   ├── UserScriptStorage.js          # 脚本存储管理
│   ├── UserScriptMetadata.js         # 脚本元数据解析和URL匹配
│   └── UserScriptSandbox.js          # 脚本沙箱上下文和GM API
├── tools/                     # AI工具执行
│   ├── SearchTool.js                 # 网络搜索工具
│   ├── CodeTool.js                   # JavaScript代码执行工具
│   ├── FetchTool.js                  # 网页访问工具
│   └── BaseToolManager.js            # 工具基础管理器（注册、解析、调度）
├── SessionManager.js          # 会话管理
├── ContextManager.js          # 上下文管理
├── ModelManager.js            # 模型列表和能力管理
└── UserScriptManager.js       # 用户脚本生命周期管理
```

## 重构原则

### 1. 文件大小限制
- 单个文件不超过 **300 行**
- 超过限制需要拆分为子模块

### 2. 职责分离
- **models/**: 模型能力检测和配置
- **scripts/**: 用户脚本的存储、解析、执行
- **tools/**: AI工具调用和执行

### 3. 依赖关系
```
UserScriptManager.js
  ├─> UserScriptStorage.js (存储)
  ├─> UserScriptMetadata.js (解析)
  └─> UserScriptSandbox.js (沙箱)

ModelManager.js
  └─> ModelCapabilityDetector.js (能力检测)
```

## 已完成的拆分

### ModelManager (261行 → 136行)
**提取到**: `models/ModelCapabilityDetector.js` (129行)
- ✅ 视觉支持检测
- ✅ 音频支持检测
- ✅ 工具调用检测
- ✅ 上下文窗口估算

### UserScriptManager (435行 → 238行)
**提取到**: 
- `scripts/UserScriptStorage.js` (71行) - 持久化
- `scripts/UserScriptMetadata.js` (84行) - 解析和匹配
- `scripts/UserScriptSandbox.js` (92行) - 沙箱环境

### ToolManager (545行 → 179行)
**提取到**:
- `tools/SearchTool.js` (104行) - 网络搜索
- `tools/CodeTool.js` (118行) - JavaScript执行
- `tools/FetchTool.js` (119行) - 网页访问
- `tools/BaseToolManager.js` (179行) - 基础管理器

## 待处理的大文件

- **background.js** (941行) - 需要拆分为API、搜索、消息等模块
- **chat.js** (2092行) - 需要拆分为渲染、流式、工具等模块

## 使用规范

1. **新增功能时**先评估是否需要新建子目录
2. **修改现有模块**时保持单一职责
3. **引用路径**使用相对路径：`modules/models/xxx.js`
4. **全局暴露**使用 `window.ModuleName = ...` 格式
