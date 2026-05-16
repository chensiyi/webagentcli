# 数据模型文档

## 概述

本文档描述 Web Agent Client 的核心数据模型，位于 `sidepanel/js/core/models/` 目录。

所有模型类都导出到全局 `window` 对象，方便各层代码访问。

---

## Message (消息)

**文件**: `sidepanel/js/core/models/Message.js`

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 唯一标识符 |
| `role` | string | - | 角色类型：`'user'` \| `'assistant'` \| `'system'` \| `'tool'` |
| `content` | string | `''` | 消息内容 |
| `timestamp` | number | `Date.now()` | 创建时间戳 |
| `tool_calls` | array\|null | `null` | 工具调用列表（assistant 消息） |
| `tool_call_id` | string\|null | `null` | 工具调用 ID（tool 消息） |
| `reasoning_content` | string | `''` | 推理/思考内容 |
| `metadata` | object | `{}` | 附加元数据 |

### 方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `isUser()` | boolean | 是否为用户消息 |
| `isAssistant()` | boolean | 是否为助手消息 |
| `hasToolCalls()` | boolean | 是否包含工具调用 |
| `toJSON()` | object | 序列化为纯对象 |
| `static fromJSON(data)` | Message | 从纯对象反序列化 |

### 消息格式示例

**用户消息**:
```json
{
  "id": "msg_1234567890_abc123",
  "role": "user",
  "content": "帮我写一个 Python 脚本",
  "timestamp": 1713369600000,
  "tool_calls": null,
  "tool_call_id": null,
  "reasoning_content": "",
  "metadata": {}
}
```

**助手消息（含工具调用）**:
```json
{
  "id": "msg_1234567891_def456",
  "role": "assistant",
  "content": "我来帮你搜索一下相关信息",
  "timestamp": 1713369601000,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "search",
        "arguments": "{\"query\": \"Python script\"}"
      }
    }
  ],
  "tool_call_id": null,
  "reasoning_content": "用户需要一个 Python 脚本，我应该先搜索相关信息",
  "metadata": {}
}
```

**工具结果消息**:
```json
{
  "id": "msg_1234567892_ghi789",
  "role": "tool",
  "content": "[搜索结果] Python 是一种高级编程语言...",
  "timestamp": 1713369602000,
  "tool_calls": null,
  "tool_call_id": "call_abc123",
  "reasoning_content": "",
  "metadata": {}
}
```

---

## Session (会话)

**文件**: `sidepanel/js/core/models/Session.js`

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 唯一标识符 |
| `title` | string | `'新对话'` | 会话标题 |
| `messages` | Message[] | `[]` | 消息列表 |
| `createdAt` | number | `Date.now()` | 创建时间戳 |
| `updatedAt` | number | `Date.now()` | 最后更新时间戳 |
| `updated_at` | number | 同 updatedAt | 兼容旧版命名 |
| `metadata` | object | `{}` | 附加元数据 |
| `port` | object\|null | `null` | 运行时端口（不持久化） |
| `isStreaming` | boolean | `false` | 是否正在流式响应（不持久化） |

### 方法

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `addMessage(msg)` | Message | - | 添加消息 |
| `deleteMessage(id)` | string | boolean | 删除消息 |
| `removeMessage(id)` | string | boolean | 删除消息（别名） |
| `updateMessage(id, updater)` | string, Function | boolean | 更新消息 |
| `getLastMessage()` | - | Message\|null | 获取最后一条消息 |
| `clearMessages()` | - | - | 清空所有消息 |
| `hasMessages()` | - | boolean | 是否有消息 |
| `toJSON()` | - | object | 序列化 |
| `static fromJSON(data)` | object | Session | 反序列化 |

### updateMessage 使用示例

```javascript
session.updateMessage(messageId, (msg) => {
  msg.content += chunk.content;
  // 可以返回新对象或修改原对象
});
```

---

## Settings (设置)

**文件**: `sidepanel/js/core/models/Settings.js`

### 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiStandard` | string | `'openrouter'` | API 标准：`'openai'` \| `'lm-studio'` \| `'openrouter'` \| `'ollama'` \| `'anthropic'` |
| `apiEndpoint` | string | - | API 端点 URL |
| `apiKey` | string | `''` | API 密钥 |
| `model` | string | - | 当前模型 |
| `theme` | string | `'light'` | 主题：`'light'` \| `'dark'` |
| `autoContextWindow` | boolean | `true` | 自动调整上下文窗口 |

### 方法

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `toJSON()` | - | object | 序列化 |
| `static fromJSON(data)` | object | Settings | 反序列化 |
| `static getDefaultEndpoint(standard)` | string | string | 获取默认端点 |

### 各 API 标准默认端点

| API 标准 | 默认端点 |
|----------|----------|
| `openai` | `https://api.openai.com/v1` |
| `lm-studio` | `http://localhost:1234` |
| `openrouter` | `https://openrouter.ai/api/v1` |
| `ollama` | `http://localhost:11434` |
| `anthropic` | `https://api.anthropic.com` |

---

## Storage (存储)

**文件**: `sidepanel/js/core/models/Storage.js`

用于缓存管理，支持模型列表等数据的本地缓存。

### 方法

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `setCache(key, data)` | string, any | Promise | 设置缓存 |
| `getCache(key)` | string | Promise<any> | 获取缓存 |
| `clearCache(key)` | string | Promise | 清除指定缓存 |
| `clearAllCache()` | - | Promise | 清除所有缓存 |

---

## Scripts (脚本)

**文件**: `sidepanel/js/core/models/Scripts.js`

管理用户脚本的元数据。

### 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 脚本唯一标识符 |
| `name` | string | 脚本名称 |
| `code` | string | 脚本代码 |
| `description` | string | 描述 |
| `enabled` | boolean | 是否启用 |
| `matchPatterns` | string[] | 匹配模式 |
| `metadata` | object | 附加元数据 |

---

## 模型关系图

```
┌─────────────────────────────────────────────────────┐
│                    Session                          │
│  ┌─────────────────────────────────────────────┐    │
│  │  messages: [Message, Message, Message, ...] │    │
│  │                                             │    │
│  │  Message                                     │    │
│  │  ───────────────────────────────────────┐  │    │
│  │  │  role: 'user'/'assistant'/'tool'      │  │    │
│  │  │  content: string                       │  │    │
│  │  │  tool_calls: [...]                     │  │    │
│  │  │  reasoning_content: string             │  │    │
│  │  └───────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  title: string                                      │
│  createdAt: timestamp                               │
│  updatedAt: timestamp                               │
─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    Settings                         │
│  apiStandard: 'openai'/'lm-studio'/...              │
│  apiEndpoint: string                                │
│  apiKey: string                                     │
│  model: string                                      │
│  theme: 'light'/'dark'                              │
─────────────────────────────────────────────────────┘
```

---

## 序列化与持久化

### 持久化流程

```
Session/Message/Settings
        │
        ▼ toJSON()
    纯 JSON 对象
        │
        ▼ chrome.storage.local.set()
    浏览器存储
        │
        ▼ chrome.storage.local.get()
    纯 JSON 对象
        │
        ▼ Session.fromJSON() / Message.fromJSON()
    模型实例
```

### 注意事项

1. **Message** 和 **Session** 支持双向序列化
2. **Settings** 在 `app.js` 初始化时从 `chrome.storage.local` 加载
3. **Session** 在 `SessionManager` 中管理持久化
4. 运行时状态（如 `port`, `isStreaming`）不会被持久化
