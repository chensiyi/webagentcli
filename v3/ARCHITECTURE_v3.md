# AI Browser Agent 架构文档 v3.9.8

**最后更新**: 2026-04-18  
**版本**: v3.9.8  
**维护原则**: 简洁、实用、同步更新

---

## 📋 目录

1. [项目概览](#项目概览)
2. [模块架构](#模块架构)
3. [核心设计原则](#核心设计原则)
4. [模块详细说明](#模块详细说明)
5. [数据流](#数据流)
6. [开发规范](#开发规范)
7. [变更记录](#变更记录)

---

## 项目概览

### 定位
- **类型**: Tampermonkey 用户脚本
- **功能**: 浏览器内置 AI 助手（对话 + JS 代码执行）
- **API**: OpenRouter（免费模型）
- **存储**: GM_setValue/GM_getValue（按域名隔离）

### 技术栈
| 层次 | 技术 | 用途 |
|------|------|------|
| 运行环境 | Tampermonkey | 浏览器扩展容器 |
| 构建工具 | Node.js + build.js | 模块合并 |
| HTTP | GM_xmlhttpRequest | 跨域 API 调用 |
| 安全执行 | unsafeWindow.eval | JS 代码执行 |

### 当前状态
- **版本**: v3.9.8
- **模块数**: 15 个（新增 ProviderManager, api-router.js）
- **文件大小**: ~285 KB
- **架构**: 模块化 + 事件驱动 + 供应商插件化
- **最新特性**: 流式输出、快捷键系统、供应商管理、模型测试、智能刷新

---

## 模块架构

### 目录结构
```
src/
├── core/                  # 核心基础设施层
│   ├── utils.js           # 通用工具函数
│   ├── EventManager.js    # 事件总线
│   ├── ConfigManager.js   # 配置管理
│   ├── HistoryManager.js  # 历史管理
│   ├── StateManager.js    # 状态管理
│   ├── ShortcutManager.js # 快捷键管理 (v3.8.6+)
│   └── ProviderManager.js # 供应商管理 (v4.0.0+)
├── ui-styles.js           # UI 样式模块
├── ui-templates.js        # UI 模板模块
├── ui.js                  # UI 交互逻辑 (UIManager)
├── models.js              # 模型管理 (ModelManager)
├── api-router.js          # API 路由层 (v4.0.0+)
├── api.js                 # API 调用 (APIManager)
├── chat.js                # 聊天逻辑 (ChatManager)
└── main.js                # 应用入口
```

### 依赖关系
```
main.js (入口)
  ├─→ 初始化核心模块
  │    ├─→ ConfigManager (依赖: EventManager, Utils)
  │    ├─→ HistoryManager (依赖: Utils)
  │    ├─→ StateManager (依赖: Utils)
  │    └─→ ShortcutManager
  ├─→ 初始化业务模块
  │    ├─→ UIManager (依赖: UIStyles, UITemplates, EventManager)
  │    ├─→ ChatManager (依赖: HistoryManager, UIManager, APIManager, Utils)
  │    ├─→ APIManager (依赖: Utils)
  │    └─→ ModelManager
  └─→ 设置事件监听
       └─→ EventManager (统一事件总线)
```

### 加载顺序（build.js 控制）
1. `core/utils.js` - 工具函数（最先加载）
2. `core/EventManager.js` - 事件系统
3. `core/ConfigManager.js` - 配置管理
4. `core/HistoryManager.js` - 历史管理
5. `core/StateManager.js` - 状态管理
6. `core/ShortcutManager.js` - 快捷键管理 (v3.8.6+)
7. `core/ProviderManager.js` - 供应商管理 (v4.0.0+)
8. `ui-styles.js` - UI 样式
9. `ui-templates.js` - UI 模板
10. `ui.js` - UI 逻辑
11. `models.js` - 模型管理
12. `api-router.js` - API 路由层 (v4.0.0+)
13. `api.js` - API 调用
14. `chat.js` - 聊天逻辑
15. `main.js` - 应用入口（最后加载）

---

## 核心设计原则

### 1. 单一职责原则 (SRP)
每个模块只负责一个功能领域：
- ✅ ConfigManager → 只管理配置
- ✅ HistoryManager → 只管理历史
- ✅ StateManager → 只管理状态
- ❌ 避免：一个模块同时管理配置+历史+状态

### 2. 依赖注入 (DI)
模块间通过参数传递依赖，降低耦合：
```javascript
// ✅ 正确：依赖注入
await ConfigManager.init({ eventManager: EventManager });

// ❌ 错误：直接访问全局变量
const config = ConfigManager.getAll(); // 隐式依赖
```

### 3. 事件驱动通信
模块间通过 EventManager 通信，避免直接调用：
```javascript
// ✅ 正确：事件驱动
EventManager.emit(EventTypes.CHAT_MESSAGE_SENT, message);

// ❌ 错误：直接调用
ChatManager.handleMessage(message);
```

### 4. DRY 原则
禁止代码重复，提取公共工具：
- ✅ Utils.getDomainKey() - 统一管理域名键
- ❌ 在多个文件中重复定义 getCurrentDomain()

### 5. 防御性编程
始终检查输入有效性：
```javascript
// ✅ 正确：空值保护
const recentHistory = (history || []).slice(-10);

// ❌ 错误：假设参数有效
const recentHistory = history.slice(-10); // 可能报错
```

### 6. 资源管理
防止内存泄漏，定期清理：
- ✅ codeBlockStore 限制 100 个，自动清理旧数据
- ✅ 历史记录限制 50 条，超出自动截断
- ✅ 事件监听器正确清理（ESC 键处理器）
- ✅ requestAnimationFrame 正确取消

### 7. 日志最小化
只记录关键错误和警告：
- ✅ console.error() - 错误
- ✅ console.warn() - 警告
- ❌ console.log() - 调试信息（移除）

### 8. 性能优化
关键交互使用高性能方案：
- ✅ 窗口拖动使用 requestAnimationFrame（与刷新率同步）
- ✅ 防抖机制减少 DOM 操作频率
- ✅ 代码执行结果压缩显示（节省 40% 空间）

---

## 模块详细说明

### Core 层（核心基础设施）

#### Utils (`core/utils.js`)
**职责**: 通用工具函数，避免代码重复

**接口**:
```javascript
Utils.getCurrentDomain()     // 获取当前域名
Utils.getDomainKey(baseKey)  // 生成带域名的存储键
Utils.debugLog(...args)      // 调试日志（受 DEBUG_MODE 控制）
Utils.debugWarn(...args)     // 调试警告
Utils.debugError(...args)    // 调试错误
```

**使用场景**:
- HistoryManager - 域名隔离存储
- StateManager - 域名隔离存储
- 所有模块的调试日志输出

---

#### EventManager (`core/EventManager.js`)
**职责**: 统一事件总线（发布-订阅模式）

**接口**:
```javascript
EventManager.on(eventType, callback)      // 注册监听器，返回 ID
EventManager.emit(eventType, data)         // 触发事件
EventManager.off(eventType, listenerId)    // 移除监听器
EventManager.offAll(eventType)             // 移除所有监听器
EventManager.getListenerStats()            // 获取统计信息
EventManager.EventTypes                    // 事件类型常量
```

**事件类型规范**:
- 采用 `agent:category:action` 格式
- 例如: `agent:chat:message:sent`, `agent:config:updated`

**实现细节**:
- 内部使用 Map 存储监听器注册表
- 通过 window.CustomEvent 广播
- 支持监听器 ID 管理，防止重复注册

---

#### ConfigManager (`core/ConfigManager.js`)
**职责**: 配置管理（不包含历史和状态）

**接口**:
```javascript
ConfigManager.init(dependencies)       // 初始化（依赖注入）
ConfigManager.getAll()                  // 获取所有配置
ConfigManager.get(key)                  // 获取单个配置
ConfigManager.set(key, value)           // 设置配置
ConfigManager.update(updates)           // 批量更新
ConfigManager.reset(key)                // 重置配置
ConfigManager.isConfigured()            // 检查是否已配置
ConfigManager.ConfigKeys                // 配置键常量 (UPPER_SNAKE_CASE)
ConfigManager.Defaults                  // 默认值常量
```

**配置项**:
```javascript
apiKey          // OpenRouter API Key
model           // 模型名称
endpoint        // API 端点
temperature     // 温度参数 (0.7)
topP            // Top-P 参数 (0.95)
maxTokens       // 最大 Token (2048)
jsExecutionEnabled  // JS 执行开关 (true)
userId          // 用户 ID
```

**存储策略**:
- 使用 GM_setValue/GM_getValue 持久化
- 支持旧配置迁移（openrouter_* → 新键名）
- 配置更新时触发 CONFIG_UPDATED 事件

---

#### HistoryManager (`core/HistoryManager.js`)
**职责**: 对话历史管理（按域名隔离）

**接口**:
```javascript
HistoryManager.init()                        // 初始化
HistoryManager.getHistory()                  // 获取历史（返回副本）
HistoryManager.saveConversationHistory(arr)  // 保存历史
HistoryManager.addMessage(msg)               // 添加单条消息
HistoryManager.clearHistory()                // 清空历史
HistoryManager.loadConversationHistory()     // 从存储加载
```

**特性**:
- 域名隔离存储: `conversation_history_{domain}`
- 最多保留 50 条消息，超出自动截断
- getHistory() 返回副本，防止外部修改缓存
- saveConversationHistory() 创建副本，确保数据安全

---

#### StateManager (`core/StateManager.js`)
**职责**: UI 状态管理（窗口可见性等）

**接口**:
```javascript
StateManager.init()                          // 初始化
StateManager.getChatVisibility()             // 获取可见性
StateManager.saveChatVisibility(bool)        // 保存可见性
StateManager.toggleChatVisibility()          // 切换可见性
StateManager.loadChatVisibility()            // 从存储加载
```

**特性**:
- 域名隔离存储: `chat_visibility_{domain}`
- 延迟初始化，先加载再设置状态
- 防御性检查：未初始化时返回 false

---

#### ShortcutManager (`core/ShortcutManager.js`) (v3.8.6+)
**职责**: 快捷键管理系统（注册、触发、管理）

**接口**:
```javascript
ShortcutManager.init()                              // 初始化
ShortcutManager.destroy()                           // 销毁
ShortcutManager.register(key, callback, desc, opts) // 注册快捷键
ShortcutManager.unregister(key)                     // 注销快捷键
ShortcutManager.setEnabled(key, enabled)            // 启用/禁用
ShortcutManager.isRegistered(key)                   // 检查是否已注册
ShortcutManager.getAllShortcuts()                   // 获取所有快捷键
```

**已注册快捷键**:
```javascript
'Ctrl+Enter'      // 发送消息
'Escape'          // 隐藏窗口（设置对话框优先）
'Ctrl+ArrowUp'    // 导航到上一条用户消息（滚动定位 + 高亮）
'Ctrl+ArrowDown'  // 导航到下一条用户消息（滚动定位 + 高亮）
```

**特性**:
- 全局键盘事件监听
- 支持修饰键组合（Ctrl, Alt, Shift, Meta）
- 条件触发（可配置是否需要特定焦点）
- 防止默认行为配置
- 易于扩展，通过 register() 添加新快捷键

---

### UI 层

#### UIStyles (`ui-styles.js`)
**职责**: 集中管理所有 CSS 样式

**接口**:
```javascript
UIStyles.getMainStyles()  // 获取主界面样式
```

**包含样式**:
- 主界面布局 (#ai-agent)
- 消息样式 (.user-message, .assistant-message)
- 代码块样式 (.code-block)
- 打字指示器 (.typing)
- 按钮样式 (.control-btn, .header-btn)
- 设置对话框样式 (.modal-overlay, .modal-content)

---

#### UITemplates (`ui-templates.js`)
**职责**: 集中管理所有 HTML 模板

**接口**:
```javascript
UITemplates.buildMainHTML(config)                    // 主界面
UITemplates.buildTypingIndicatorHTML()               // 打字指示器
UITemplates.buildUserMessageHTML(content)            // 用户消息
UITemplates.buildAssistantMessageHTML(content)       // AI 消息
UITemplates.buildCodeBlockHTML(code, lang, id)       // 代码块
UITemplates.buildExecutionResultHTML(success, text)  // 执行结果
UITemplates.buildHighRiskWarningHTML(code, index)    // 高危警告
UITemplates.buildWelcomeMessageHTML()                // 欢迎消息
UITemplates.buildSettingsDialogHTML(config, models)  // 设置对话框
UITemplates.escapeHtml(text)                         // HTML 转义
```

---

#### UIManager (`ui.js`)
**职责**: UI 交互逻辑、事件处理、DOM 操作

**接口**:
```javascript
UIManager.createAssistant(config)      // 创建主界面
UIManager.show()                       // 显示窗口
UIManager.hide()                       // 隐藏窗口
UIManager.showSettings()               // 显示设置对话框
UIManager.appendMessage(html)          // 追加消息
UIManager.showTypingIndicator()        // 显示打字指示器
UIManager.hideTypingIndicator()        // 隐藏打字指示器
UIManager.updateSendButtonState(bool)  // 更新发送按钮状态
```

**注意**: 
- 样式已分离到 ui-styles.js
- 模板已分离到 ui-templates.js
- ui.js 只保留交互逻辑

---

#### ModelManager (`models.js`)
**职责**: AI 模型列表管理 + 缓存

**接口**:
```javascript
ModelManager.fetchFreeModels()         // 从 API 获取模型
ModelManager.updateModelSelect()       // 更新下拉框
ModelManager.refreshModels()           // 强制刷新
ModelManager.loadCachedModels()        // 获取缓存模型
ModelManager.saveToCache(models)       // 保存到缓存
ModelManager.DEFAULT_MODELS            // 默认模型列表常量
```

**特性**:
- 24 小时缓存机制
- 支持从 OpenRouter API 动态获取免费模型
- 提供商图标映射

---

#### ProviderManager (`core/ProviderManager.js`) (v4.0.0+)
**职责**: AI 供应商管理（插件化架构）

**接口**:
```javascript
ProviderManager.init()                              // 初始化
ProviderManager.getAllProviders()                   // 获取所有供应商
ProviderManager.getProviderById(id)                 // 根据 ID 获取
ProviderManager.addProvider(config)                 // 添加供应商
ProviderManager.updateProvider(id, updates)         // 更新供应商
ProviderManager.deleteProvider(id)                  // 删除供应商
ProviderManager.getTemplate(name)                   // 获取 API 模板
ProviderManager.autoDiscoverLocalServices(baseUrl)  // 自动发现本地服务
ProviderManager.addModelsToProvider(id, models)     // 添加模型到供应商
```

**特性**:
- 插件化架构，每个供应商独立配置
- 支持多种 API 模板（OpenAI, Anthropic, Google 等）
- 本地服务自动发现（LM Studio, Ollama 等）
- 模型列表管理（拖拽排序、启用/禁用、测试）
- 智能刷新（对比新旧模型，询问是否保留）
- 一键测试所有模型可用性
- 自动删除无效模型

**数据格式**:
```javascript
{
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-or-...",
  template: "openai",  // 使用的 API 模板
  isLocal: false,      // 是否为本地服务
  models: [
    { id: "model-1", name: "Model 1", enabled: true },
    { id: "model-2", name: "Model 2", enabled: false }
  ],
  createdAt: 1234567890,
  updatedAt: 1234567890
}
```

---

#### APIRouter (`api-router.js`) (v4.0.0+)
**职责**: API 请求路由和故障转移

**接口**:
```javascript
APIRouter.callWithFallback(messages, config, providers)
// 尝试多个供应商，直到成功或全部失败
```

**特性**:
- 多供应商故障转移
- 自动重试机制
- 请求超时控制
- 详细的错误日志
- 支持流式和非流式响应

---

#### APIManager (`api.js`)
**职责**: AI API 调用（流式输出 + 阻塞式回退）

**接口**:
```javascript
APIManager.callAPIStreaming(...)       // 流式调用（推荐）
APIManager.callAPI(...)                // 阻塞式调用（已废弃）
APIManager.getProcessingState()        // 获取处理状态
```

**特性**:
- 支持 SSE (Server-Sent Events) 流式输出
- 支持 AbortController 取消请求
- 自动处理流式数据解析
- 提供阻塞式 fallback 方案

---

#### ChatManager (`chat.js`)
**职责**: 聊天逻辑核心（消息处理、代码执行、历史记录）

**接口**:
```javascript
ChatManager.handleMessage(message)             // 处理用户消息
ChatManager.clearChat()                        // 清空聊天
ChatManager.executeJavaScript(code)            // 执行 JS 代码
ChatManager.getCodeFromStore(id)               // 从存储获取代码
ChatManager.navigateToPreviousUserMessage()    // 导航到上一条消息
ChatManager.navigateToNextUserMessage()        // 导航到下一条消息
```

**特性**:
- 消息队列管理（异步非阻塞）
- 代码块自动提取与执行
- 高危代码安全确认机制
- 代码执行结果压缩与反馈
- 消息高亮与滚动定位

---

### 入口层

#### Main (`main.js`)
**职责**: 应用初始化、事件路由、流程编排

**初始化流程**:
```javascript
init()
  ├─→ initCoreModules()
  │    ├─→ ConfigManager.init({ eventManager })
  │    ├─→ HistoryManager.init()
  │    └─→ StateManager.init()
  ├─→ initBusinessModules()
  │    ├─→ 检查历史记录和状态
  │    ├─→ UIManager.createAssistant()
  │    └─→ 根据状态显示/隐藏窗口（默认隐藏）
  ├─→ setupEventListeners()
  │    └─→ 注册所有事件监听器
  ├─→ createLauncherButton()
  │    └─→ 创建右下角 🤖 按钮
  └─→ startApplication()
       └─→ 触发 APP_STARTED 事件
```

**事件监听器**:
- CHAT_MESSAGE_SENT → ChatManager.handleMessage()
- SETTINGS_OPEN → UIManager.showSettings()
- CHAT_CLEAR → ChatManager.clearChat()
- agent:execute:code → ChatManager.executeJavaScript()
- agent:stop:request → ChatManager.stopCurrentRequest()
- AGENT_OPEN → UIManager.show() + 加载历史
- AGENT_CLOSE → StateManager.saveChatVisibility(false)

**默认行为**:
- ✅ 首次打开网页：聊天窗口默认隐藏
- ✅ 点击 🤖 按钮：唤醒聊天窗口
- ✅ 关闭窗口：保存状态为隐藏

---

## 数据流

### 消息发送流程
```
用户输入消息
  ↓
UIManager 绑定 Enter 键事件
  ↓
EventManager.emit(CHAT_MESSAGE_SENT, message)
  ↓
main.js 监听到事件
  ↓
ChatManager.handleMessage(message)
  ↓
  ├─→ 添加到消息队列
  ├─→ addUserMessage() - 显示用户消息
  ├─→ HistoryManager.addMessage({role: 'user', content})
  ├─→ APIManager.callAPI(message, history, config)
  │    ├─→ buildMessages() - 构建消息数组
  │    ├─→ makeRequest() - 发起 HTTP 请求
  │    └─→ 返回 AI 响应
  ├─→ addAssistantMessage() - 显示 AI 消息
  ├─→ HistoryManager.addMessage({role: 'assistant', content})
  └─→ executeCodeBlocksFromMessage() - 执行代码块
       ├─→ 安全代码：自动执行
       ├─→ 高危代码：显示警告，等待确认
       └─→ 执行结果反馈给 AI
```

### 配置更新流程
```
用户打开设置
  ↓
UIManager.showSettings()
  ↓
用户修改配置并保存
  ↓
ConfigManager.set(key, value)
  ├─→ 更新内存缓存
  ├─→ GM_setValue 持久化
  └─→ EventManager.emit(CONFIG_UPDATED, {key, value})
  ↓
其他模块监听到 CONFIG_UPDATED 事件
  └─→ 更新自身状态
```

### 窗口状态流程
```
用户点击 🤖 按钮
  ↓
EventManager.emit(AGENT_OPEN)
  ↓
main.js 监听到事件
  ├─→ UIManager.show() - 显示窗口
  ├─→ StateManager.saveChatVisibility(true)
  └─→ 加载历史记录（如果有）

用户点击关闭按钮
  ↓
UIManager.hide()
  ↓
EventManager.emit(AGENT_CLOSE)
  ↓
main.js 监听到事件
  └─→ StateManager.saveChatVisibility(false)
```

---

## 开发规范

### 1. 模块编写规范

#### IIFE 模式
所有模块使用立即执行函数表达式：
```javascript
const ModuleName = (function() {
    'use strict';
    
    // 私有变量和函数
    
    function privateFunction() {
        // ...
    }
    
    // 公共接口
    return {
        publicFunction
    };
})();
```

#### JSDoc 注释
所有公共函数必须有 JSDoc：
```javascript
/**
 * 函数说明
 * @param {type} paramName - 参数说明
 * @returns {type} 返回值说明
 */
function publicFunction(paramName) {
    // ...
}
```

---

### 2. 代码风格

#### 命名规范
- 模块名: PascalCase (EventManager, ConfigManager)
- 函数名: camelCase (handleMessage, saveHistory)
- 常量: UPPER_SNAKE_CASE (MAX_HISTORY_LENGTH, EventTypes)
- 私有变量: camelCase (configCache, isInitialized)

#### 文件组织
- 每个模块一个文件
- 相关模块放在同一目录（core/）
- 文件名与模块名一致（小写 + .js）

---

### 3. 错误处理

#### 统一错误处理
```javascript
try {
    // 可能出错的代码
} catch (error) {
    console.error('[ERROR][模块名]', error);
    // 可选：显示用户友好的错误消息
}
```

#### 防御性编程
```javascript
// 检查参数有效性
if (!config.apiKey) {
    throw new Error('API Key 未设置');
}

// 空值保护
const history = (historyParam || []).slice(-10);

// 类型检查
if (typeof callback !== 'function') {
    console.error('callback 必须是函数');
    return;
}
```

---

### 4. 资源管理

#### 内存管理
- 限制集合大小（codeBlockStore ≤ 100）
- 定期清理旧数据
- 避免循环引用

#### 存储管理
- 历史记录限制 50 条
- 模型缓存 24 小时过期
- 按域名隔离存储

---

### 5. 日志规范

#### 允许的日志
```javascript
console.error('[ERROR]', message)  // 错误
console.warn('[WARN]', message)    // 警告
```

#### 禁止的日志
```javascript
console.log('✅ 操作成功')         // 调试信息
console.log('📡 事件触发')         // 调试信息
console.log('💾 数据已保存')       // 调试信息
```

---

### 6. 重构规范

#### 重构前
1. 搜索所有相关引用
   ```bash
   grep -r "oldFunction" src/
   ```
2. 使用 IDE 的"查找所有引用"
3. 评估影响范围

#### 重构中
1. 保持向后兼容（如果可能）
2. 逐步迁移，不要一次性全部修改
3. 每步都测试

#### 重构后
1. 全面搜索验证，确保没有遗漏
2. 运行构建脚本
3. 测试所有主要功能
4. 更新架构文档

---

### 7. 文档维护规范

#### 何时更新文档
- ✅ 新增模块
- ✅ 修改模块接口
- ✅ 改变数据流
- ✅ 修复重大 Bug
- ✅ 架构调整

#### 如何更新
1. 修改对应的模块说明
2. 更新数据流图
3. 更新变更记录
4. 提交时包含文档更新

---

## 变更记录

### v3.9.8 (2026-04-18)

#### 新增
- ✨ 手动添加模型功能（➕ 按钮）
- ✨ 智能刷新模型（支持 /v1/models 接口）
- ✨ 新旧模型对比，弹窗询问是否保留
- ✨ 模型测试功能增强（保存测试结果到缓存）
- ✨ 一键删除无效模型

#### 修复
- 🐛 修复 eval 执行代码不能使用 return 的问题
- 🐛 修复模型编辑功能的数组引用问题
- 🐛 修复流式响应显示的竞态条件
- 🐛 修复数据同步问题（删除模型后清理测试缓存）

#### 优化
- 🚀 系统提示词优化（明确代码执行规则）
- 🚀 UI 交互优化（拖拽排序、批量操作）
- 🚀 错误处理优化（更友好的提示）

---

### v3.9.0 (2026-04-17)

#### 新增
- ✨ 创建 `core/utils.js` 工具模块
- ✨ codeBlockStore 自动清理机制（最多 100 个）

#### 优化
- 🚀 移除 22+ 处调试日志
- 🚀 消除 HistoryManager 和 StateManager 的代码重复
- 🚀 修复 StateManager 初始化竞态条件
- 🚀 HistoryManager 添加数组副本保护
- 🚀 移除 EventManager.once() 未使用方法
- 🚀 移除 main.js 未使用的 modules 对象
- 🚀 移除 ConfigManager 未使用的配置键

#### 修复
- 🐛 默认隐藏聊天窗口（需要点击按钮唤醒）
- 🐛 API 调用时 history 为 undefined 的错误

#### 改进
- 📊 代码减少 58 行 (-3.1%)
- 📊 文件大小减少 2.4 KB (132.3 KB)
- 📊 控制台更清爽

---

### v3.8.6 (2026-04-17)

#### 功能优化
- 🚀 代码执行结果以代码块形式展示（max-height: 200px）
- 🚀 代码执行结果格式压缩（统计信息一行显示）
- 🚀 窗口拖动性能优化（requestAnimationFrame）

#### Bug 修复
- 🐛 修复自动执行代码后不显示停止按钮
- 🐛 修复设置弹窗重复打开问题
- 🐛 修复设置弹窗无法点击背景关闭
- 🐛 修复设置弹窗无法按 ESC 键关闭
- 🐛 修复聊天窗口默认显示问题

#### 代码质量
- ♻️ 移除所有调试日志（console.log）
- ♻️ 优化 callAPIForFeedback 状态管理
- ♻️ 正确清理事件监听器（避免内存泄漏）

---

### v3.8.5 (2026-04-17)

#### 重构
- ♻️ 拆分 ConfigManager
  - 创建 HistoryManager（历史管理）
  - 创建 StateManager（状态管理）
  - ConfigManager 只保留配置管理

#### 修复
- 🐛 更新所有 ConfigManager 调用为新的管理器

---

### v3.8.4 (2026-04-17)

#### 重构
- ♻️ 创建 ui-styles.js（样式模块）
- ♻️ 创建 ui-templates.js（模板模块）
- ♻️ ui.js 只保留交互逻辑

#### 优化
- 🚀 EventManager 添加监听器 ID 管理
- 🚀 防止事件监听器重复注册

---

### v3.8.3 (2026-04-17)

#### 修复
- 🐛 解决事件监听器重复注册导致的日志重复输出

---

## 附录

### A. 常见问题

#### Q: 如何添加新模块？
A: 
1. 在 src/ 或 src/core/ 创建文件
2. 使用 IIFE 模式编写模块
3. 在 build.js 的 modules 数组中添加
4. 在 main.js 中初始化和使用
5. 更新本文档

#### Q: 如何调试事件流？
A: 
```javascript
// 临时添加日志（调试用，完成后删除）
EventManager.on(EventTypes.CHAT_MESSAGE_SENT, (msg) => {
    console.log('DEBUG: 收到消息', msg);
});
```

#### Q: 如何检查模块依赖？
A: 
查看 build.js 的 modules 数组，按依赖顺序排列

#### Q: 如何优化拖动性能？
A: 
使用 requestAnimationFrame 与浏览器刷新率同步：
```javascript
// ✅ 正确：使用 rAF
let rafId = null;
document.addEventListener('mousemove', (e) => {
    if (rafId !== null) return; // 防抖
    rafId = requestAnimationFrame(() => {
        updatePosition();
        rafId = null;
    });
});

// ❌ 错误：直接操作 DOM
document.addEventListener('mousemove', (e) => {
    element.style.left = e.clientX + 'px'; // 频繁重排
});
```

#### Q: 如何处理模态框交互？
A: 
遵循标准模态框设计原则：
1. 防止重复打开（检查是否已存在）
2. 支持多种关闭方式（按钮、背景、ESC 键）
3. 正确清理事件监听器（避免内存泄漏）

```javascript
// ✅ 正确：完整实现
function showModal() {
    if (document.getElementById('modal')) return; // 防止重复
    // ... 创建模态框
    bindEscapeKey(); // 绑定 ESC 键
}

function closeModal() {
    modal.remove();
    removeEscapeKey(); // 清理监听器
}
```

---

### B. 性能优化建议

1. **减少 DOM 操作**
   - 批量更新 DOM
   - 使用 DocumentFragment
   - ✅ 已实现：窗口拖动使用 requestAnimationFrame

2. **避免内存泄漏**
   - 及时清理事件监听器
   - 限制集合大小
   - ✅ 已实现：ESC 键处理器正确清理
   - ✅ 已实现：rAF 回调正确取消

3. **优化 API 调用**
   - 缓存模型列表（24 小时）
   - 限制历史消息数量（10 条）
   - ✅ 已实现：AbortController 支持取消

4. **减少日志输出**
   - 只记录错误和警告
   - 避免频繁的 console.log
   - ✅ 已实现：移除所有调试日志

5. **UI 响应性**
   - 代码执行结果限制高度（200px）
   - 统计信息压缩显示（节省 40% 空间）
   - 防抖机制减少不必要的更新

---

### C. 安全注意事项

1. **代码执行安全**
   - 使用 unsafeWindow.eval 执行用户代码
   - 检测高危代码（跳转、删除、无限循环）
   - 高危代码需要手动确认

2. **数据存储安全**
   - 按域名隔离，防止跨站泄露
   - API Key 不导出（exportConfig 时隐藏）

3. **XSS 防护**
   - 所有用户输入都要 escapeHtml
   - 代码块中的代码也要转义显示

---

## 构建与发布

### 构建系统

#### 构建脚本 (`build.js`)
**职责**: 将所有模块合并为单个 user.js 文件

**特性**:
- 自动读取版本号（环境变量或默认值）
- 支持开发/发布两种模式
- 按依赖顺序加载模块
- 自动注入 UserScript 头部

#### 构建命令
```bash
# 开发模式（默认）
node build.js

# 发布模式
RELEASE=true node build.js
# 或
node build.js --release

# 指定版本
VERSION=3.9.0 RELEASE=true node build.js
```

### DEBUG_MODE 机制

#### 作用
控制调试日志的开启/关闭，影响以下函数：
- `Utils.debugLog()` - 替代 console.log()
- `Utils.debugWarn()` - 替代 console.warn()
- `Utils.debugError()` - 替代 console.error()

#### 切换逻辑
```javascript
// src/core/utils.js
const DEBUG_MODE = true;  // 开发模式（默认）

// 发布模式下，build.js 会自动替换为：
const DEBUG_MODE = false; // 发布模式已关闭调试日志
```

#### 影响范围
| 模式 | 日志输出 | 文件大小 | 性能 |
|------|---------|---------|------|
| 开发 | ✅ 全部输出 | ~162 KB | 略低 |
| 发布 | ❌ 无输出 | ~161 KB | 最优 |

### 发布流程

1. **更新版本号**
   ```bash
   # 修改 build.js 第 18 行
   const VERSION = process.env.VERSION || '3.9.0';
   ```

2. **构建发布版本**
   ```bash
   RELEASE=true node build.js
   ```

3. **验证构建结果**
   - 检查 `dist/agent.user.js` 中是否有 `DEBUG_MODE = false`
   - 确认无语法错误
   - 测试核心功能（流式输出、代码执行等）

4. **提交代码**
   ```bash
   git add .
   git commit -m "Release v3.9.0: 流式输出 + 快捷键系统"
   git tag v3.9.0
   git push origin main --tags
   ```

5. **上传到 Tampermonkey**
   - 将 `dist/agent.user.js` 安装/更新
   - 在实际网站中测试

### 版本历史

| 版本 | 日期 | 主要特性 | 文件大小 |
|------|------|---------|----------|
| v3.9.8 | 2026-04-18 | 供应商管理、模型测试、智能刷新 | ~285 KB |
| v3.9.0 | 2026-04-17 | 流式输出、快捷键、DEBUG_MODE | ~162 KB |
| v3.8.6 | 2026-04-17 | 拖动优化、设置弹窗修复 | 149.9 KB |
| v3.8.0 | 2026-04-16 | 事件驱动架构重构 | 145 KB |

---

**文档维护者**: AI Assistant  
**最后审核**: 2026-04-18 (v3.9.8)  
**下次审核**: v4.0 发布后
