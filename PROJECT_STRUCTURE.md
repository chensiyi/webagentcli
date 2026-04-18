# 项目结构说明

**版本**: v5.0.0  
**更新日期**: 2026-04-19

---

## 📁 目录概览

```
webagentcli/
├── src/                    # ✅ v5 当前版本源代码（生产环境）
├── v3/                     # 📦 v3 旧版本归档（历史参考）
├── docs/                   # 📚 v5 详细技术文档
├── dist/                   # 🚀 构建产物
├── ARCHITECTURE.md         # 🏗️ v5 架构文档
├── README.md               # 📖 项目说明
└── build.js                # 🔨 构建脚本
```

---

## 📂 详细说明

### `src/` - v5 当前版本

**状态**: ✅ **生产环境， actively maintained**

这是项目的核心代码，采用五层架构设计：

```
src/
├── main.js                 # 程序入口，负责初始化和接线
│
├── business/               # 业务逻辑层
│   └── WebAgentClient.js   # 业务编排器（消息队列、执行队列）
│
├── infrastructure/         # 基础设施层
│   └── AIAgent/            # AI Agent 核心
│       ├── index.js        # Agent 组合器
│       └── CodeExecutor.js # 代码执行器
│
├── services/               # 服务层
│   ├── api/                # API 客户端（OpenRouter, LM Studio, Ollama）
│   ├── config/             # 配置管理
│   ├── storage/            # 统一状态管理
│   ├── provider/           # 供应商管理
│   ├── model-manager/      # 模型管理
│   └── page-analyzer/      # 页面分析
│
├── app/                    # 应用层
│   ├── ui/                 # React UI
│   │   ├── components/     # UI 组件
│   │   └── hooks/          # React Hooks
│   └── shortcuts/          # 快捷键管理
│
├── core/                   # 核心工具层
│   ├── utils.js            # 工具函数
│   ├── EventManager.js     # 事件总线
│   └── ErrorTracker.js     # 错误追踪
│
└── vendor/                 # 第三方库
    ├── react.production.min.js
    └── react-dom.production.min.js
```

**关键特性**:
- ✅ 双队列系统（消息队列 + 执行队列）
- ✅ 自动代码执行
- ✅ 流式交互
- ✅ 会话持久化
- ✅ 智能模型路由
- ✅ React UI

---

### `v3/` - v3 旧版本归档

**状态**: 📦 **历史参考，不再维护**

包含 v3 版本的完整代码和文档，用于：
- 回顾历史实现
- 对比架构演进
- 参考某些特定功能的实现

```
v3/
├── src/                    # v3 源代码（单体架构）
├── ARCHITECTURE_v3.md      # v3 架构文档
├── ARCHITECTURE_v5_DESIGN.md   # v5 设计文档（历史版本）
└── ARCHITECTURE_v5_SUMMARY.md  # v5 总结文档（历史版本）
```

**注意**: 
- ❌ 不要修改此目录下的代码
- ❌ 不要在此目录添加新功能
- ✅ 可以作为参考查阅

---

### `docs/` - v5 详细技术文档

**状态**: 📚 **活文档，持续更新**

包含 v5 各个核心功能的详细实现文档：

```
docs/
├── STREAMING_IMPLEMENTATION.md      # 流式交互实现
├── MESSAGE_QUEUE_IMPLEMENTATION.md  # 消息队列实现
└── AUTO_CODE_EXECUTION.md           # 自动代码执行系统
```

**用途**:
- 深入了解某个功能的实现细节
- 学习架构设计思路
- 调试和问题排查

---

### `dist/` - 构建产物

**状态**: 🚀 **自动生成**

```
dist/
└── agent.user.js    # 最终的用户脚本（~370 KB）
```

**生成方式**:
```bash
node build.js
```

**使用**:
- 安装到 Tampermonkey
- 发布到 GitHub Releases

---

## 🔄 开发工作流

### 1. 修改代码

```bash
# 编辑 src/ 目录下的文件
code src/business/WebAgentClient.js
```

### 2. 构建

```bash
node build.js
```

### 3. 测试

1. 打开 Tampermonkey 管理面板
2. 删除旧版本脚本
3. 打开 `file:///d:/dev/webagentcli/dist/agent.user.js`
4. 点击"安装"
5. 刷新网页测试

### 4. 提交

```bash
git add src/ docs/ ARCHITECTURE.md README.md
git commit -m "feat: 添加新功能"
git push
```

---

## 📝 文档维护指南

### 何时更新文档

| 场景 | 操作 |
|------|------|
| 添加新功能 | 更新 `ARCHITECTURE.md` 和相关 `docs/` 文档 |
| 修改架构 | 更新 `ARCHITECTURE.md` |
| 修复 Bug | 如果影响架构，更新相关文档 |
| 发布新版本 | 更新 `README.md` 的版本历史 |

### 文档规范

1. **ARCHITECTURE.md** - 高层架构设计
   - 分层说明
   - 模块职责
   - 数据流设计

2. **docs/*.md** - 详细实现文档
   - 核心代码片段
   - 使用示例
   - 常见问题

3. **README.md** - 项目概览
   - 快速开始
   - 核心功能
   - 版本历史

---

## 🎯 最佳实践

### 1. 保持分层清晰

```javascript
// ✅ 正确：UI 通过事件与 Client 通信
EventManager.emit('USER_MESSAGE_SENT', message);

// ❌ 错误：UI 直接调用底层服务
AIAgent.sendMessage(message);
```

### 2. 使用事件驱动

```javascript
// 触发事件
EventManager.emit(EventManager.EventTypes.MESSAGE_COMPLETE, data);

// 监听事件
EventManager.on(EventManager.EventTypes.MESSAGE_COMPLETE, handler);
```

### 3. 遵循命名规范

- **文件**: PascalCase for components, camelCase for others
- **函数**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **类**: PascalCase

### 4. 添加注释

```javascript
/**
 * 处理用户消息
 * @param {string} message - 用户消息
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 响应结果
 */
async function handleUserMessage(message, options = {}) {
    // ...
}
```

---

## 🔍 常见问题

### Q1: 我应该修改哪个目录的代码？

**A**: 
- **新功能/修复** → `src/`
- **查看历史实现** → `v3/`
- **不要修改** → `dist/` (自动生成)

### Q2: v3 目录会被删除吗？

**A**: 
暂时不会。它作为历史参考保留，但：
- 不会被主动维护
- 可以选择在 `.gitignore` 中排除
- 未来可能会移到单独的分支

### Q3: 如何添加新文档？

**A**: 
1. 在 `docs/` 目录创建 `.md` 文件
2. 在 `ARCHITECTURE.md` 中添加链接
3. 在 `README.md` 的文档部分添加引用

### Q4: 构建失败怎么办？

**A**: 
1. 检查控制台错误信息
2. 确认所有模块路径正确
3. 运行 `node build.js` 查看详细输出
4. 检查 `build.js` 中的模块列表

---

## 📊 项目统计

| 指标 | v3 | v5 | 改进 |
|------|----|----|----|
| 代码行数 | ~8000 | ~6000 | -25% |
| 模块数量 | 15 | 27 | +80% |
| 文件大小 | ~350 KB | ~370 KB | +6% |
| 架构层次 | 2 | 5 | +150% |
| 可维护性 | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |

---

**文档维护者**: AI Assistant  
**最后更新**: 2026-04-19  
**下一个审查日期**: v6.0 发布前
