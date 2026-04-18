# v5.0 架构设计 - 快速概览

## 🎯 核心理念

```
Main (园区建设)          → 程序启动、环境准备、基础设施搭建
WebAgentClient (园区工厂) → 业务逻辑核心、生产流程、质量控制
AIAgent (生产线设备)      → 底层能力、工具组合
React UI (园区外观)       → 用户看到的界面，组件化
```

---

## 📐 分层架构

```
┌─────────────────────────────────────┐
│  Main Layer (程序启动层)             │
│  - main.js                          │
│  - 职责：初始化模块、设置监听、暴露接口│
└──────────────┬──────────────────────┘
               │ 启动 WebAgentClient
┌──────────────▼──────────────────────┐
│  Business Logic Layer (业务逻辑层)   │
│  - WebAgentClient (业务编排器)       │
│  - 会话管理、错误处理、流程控制       │
└──────────────┬──────────────────────┘
               │ 委托给 AIAgent
┌──────────────▼──────────────────────┐
│  Infrastructure Layer (基础设施层)   │
│  - AIAgent (组合器模式)              │
│  - 整合 ModelManager, APIRouter...   │
└──────────────┬──────────────────────┘
               │ 使用服务
┌──────────────▼──────────────────────┐
│  Service Layer (服务层)              │
│  - api/ (API 客户端)                 │
│  - model-manager/ (模型管理)         │
│  - page-analyzer/ (页面分析)         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  UI Layer (表现层) - React           │
│  - ChatWindow.jsx                   │
│  - MessageList.jsx                  │
│  - SettingsDialog.jsx               │
│  - 通过事件与 WebAgentClient 通信    │
└─────────────────────────────────────┘
```

---

## 🚀 分步实施计划（9个Phase）

| Phase | 任务 | 预计时间 | 关键产出 |
|-------|------|---------|---------|
| **Phase 0** | ✅ 准备阶段（已完成） | - | AIAgent, WebAgentClient 已创建 |
| **Phase 1** | 明确 Main 和 Client 职责 | 2h | main.js 只做启动，Client 接管业务 |
| **Phase 2** | 引入 React 基础环境 | 3h | React 库集成，HelloWorld 渲染 |
| **Phase 3** | React 重写设置对话框 | 4h | SettingsDialog.jsx 组件 |
| **Phase 4** | 目录结构调整 | 2h | 文件移动到新位置 |
| **Phase 5** | React 重构聊天窗口 | 6h | ChatWindow.jsx + Hooks |
| **Phase 6** | 废弃 chat.js | 3h | 功能迁移到 Client |
| **Phase 7** | 重构 models.js | 3h | ModelManager 服务化 |
| **Phase 8** | 清理和优化 | 2h | 删除废弃文件 |
| **Phase 9** | 文档和测试 | 2h | 完整文档 + 测试用例 |

**总计**：约 27 小时（3-4天）

---

## ⚛️ React 集成方案

### 技术选型
- **React 18** - 最新版本
- **JSX** - 声明式模板
- **Hooks** - 状态管理和副作用

### 构建方式
```bash
# 1. 下载 React 库
curl -o src/vendor/react.production.min.js https://unpkg.com/react@18/umd/react.production.min.js

# 2. 配置 build.js 包含 React
const modules = [
    'vendor/react.production.min.js',
    'vendor/react-dom.production.min.js',
    'app/ui/index.jsx',
    // ...
];

# 3. 构建
node build.js
```

### 示例组件
```jsx
// ChatWindow.jsx
function ChatWindow() {
    const { messages, sendMessage } = useAgent();
    
    return (
        <div className="chat-window">
            <MessageList messages={messages} />
            <InputArea onSend={sendMessage} />
        </div>
    );
}
```

---

## 🎯 核心价值

### 对比当前架构

| 维度 | 当前 (v3.9.8) | v5.0 目标 |
|------|---------------|-----------|
| **职责划分** | 模糊（ui.js 包含业务逻辑） | 清晰（分层明确） |
| **可测试性** | 困难（全局依赖） | 容易（依赖注入） |
| **可扩展性** | 中等（需修改多处） | 高（插件化） |
| **UI 开发** | 原生 DOM（字符串拼接） | React（JSX 组件） |
| **维护成本** | 高（牵一发动全身） | 低（边界清晰） |

### 实际收益

**添加新功能（如"消息翻译"）**：
- ❌ 当前：需要修改 ui.js, chat.js, api.js（3个文件）
- ✅ v5.0：只需在 WebAgentClient 添加逻辑（1个文件）

**修复 Bug**：
- ❌ 当前：需要在多个文件中查找相关代码
- ✅ v5.0：业务逻辑集中在 WebAgentClient，易于定位

**UI 改进**：
- ❌ 当前：手动操作 DOM，易出错
- ✅ v5.0：React 组件化，声明式更新

---

## 📋 下一步行动

1. **确认设计方案** - 您审阅 ARCHITECTURE_v5_DESIGN.md
2. **开始 Phase 1** - 重构 main.js，明确职责
3. **引入 React** - Phase 2 搭建基础环境
4. **渐进式迁移** - 每个 Phase 完成后测试

---

**详细设计文档**: [ARCHITECTURE_v5_DESIGN.md](./ARCHITECTURE_v5_DESIGN.md)  
**预计完成时间**: 3-4 天  
**风险等级**: 🟡 中（有回滚方案）
