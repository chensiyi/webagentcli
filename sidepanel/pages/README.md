# Pages 页面目录

## 📁 目录结构

```
pages/
├── chat/           # 聊天页面（复杂，有子目录）
├── dom.js          # DOM 工具函数
├── history.js      # 历史对话页面
├── scripts.js      # 用户脚本管理页面
├── settings.js     # 设置页面
└── storage.js      # 存储管理页面
```

## 🎯 职责说明

### dom.js - DOM 工具
**职责**：提供统一的 DOM 操作接口

- 提供 `window.DOM.create()` - 创建 DOM 元素
- 提供 `window.DOM.clear()` - 清空容器

**全局变量导出**：
- `window.DOM` (object)
- `window.Pages` (object, 初始化)

⚠️ **重要**：这是所有页面的基础依赖，必须第一个加载

---

### history.js - 历史对话页面
**职责**：显示和管理历史对话列表

**功能**：
- 显示所有会话列表
- 搜索会话（支持多模态消息）
- 删除会话
- 切换到指定会话

**全局变量导出**：
- `window.Pages.history` (function)

**依赖**：
- `window.SessionManager`
- `window.DOM`
- `window.formatTimeAgo` (来自 utils/time.js)

---

### scripts.js - 用户脚本管理页面
**职责**：用户脚本的安装、卸载、启用/禁用管理界面

**功能**：
- 显示已安装的脚本列表
- 安装新脚本
- 卸载脚本
- 启用/禁用脚本
- 查看脚本详情

**全局变量导出**：
- `window.Pages.scripts` (function)

**依赖**：
- `window.UserScriptManager`
- `window.DOM`
- `window.Toast`

---

### settings.js - 设置页面
**职责**：应用配置管理

**功能**：
- API 配置（端点、密钥、模型）
- 模型参数（temperature, max_tokens）
- 工具开关
- 思考模式开关
- 其他应用设置

**全局变量导出**：
- `window.Pages.settings` (function)

**依赖**：
- `window.SettingsStorage`
- `window.ModelManager`
- `window.DOM`
- `window.Toast`

⚠️ **注意**：这是最大的页面文件（25.9KB），包含大量 UI 逻辑

---

### storage.js - 存储管理页面
**职责**：数据导入/导出和清理

**功能**：
- 导出所有数据（JSON）
- 导入数据（JSON）
- 清理所有数据
- 显示存储使用情况

**全局变量导出**：
- `window.Pages.storage` (function)

**依赖**：
- `window.SessionManager`
- `window.DOM`
- `window.Toast`
- `window.ConfirmDialog`

---

## 🔗 调用关系

```
app.js
  └─> window.Pages.chat()      // 切换到聊天页面
  └─> window.Pages.history()   // 切换到历史页面
  └─> window.Pages.settings()  // 切换到设置页面
  └─> window.Pages.scripts()   // 切换到脚本页面
  └─> window.Pages.storage()   // 切换到存储页面
  
每个页面函数接收 container 参数，负责渲染自己的 UI
```

## 📊 页面切换机制

所有页面都注册到 `window.Pages` 对象下：

```javascript
window.Pages = {
  chat: function(container) { ... },
  history: function(container) { ... },
  settings: function(container) { ... },
  scripts: function(container) { ... },
  storage: function(container) { ... }
}
```

app.js 通过调用对应的函数来切换页面：
```javascript
window.Pages.chat(rootElement);
```

## ⚠️ 注意事项

1. **统一接口**：所有页面都是接受 container 参数的函数
2. **共享状态**：多个页面共享 SessionManager、SettingsStorage 等
3. **DOM 清理**：切换页面时应先清空 container（由 DOM.clear 处理）
4. **事件监听**：页面可能需要监听全局事件（如 `chat:refresh`）

## ✅ 健康检查

- [x] 无重复定义
- [x] 页面接口统一
- [x] 职责分离清晰
- [x] 共享状态管理合理
- [ ] settings.js 过大（25.9KB），可考虑拆分
