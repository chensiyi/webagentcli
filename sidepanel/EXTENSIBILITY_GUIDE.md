# 通用 AI 交互能力扩展指南

## 概述

本系统采用**插件化架构**设计，可以灵活支持现代 AI 模型的各种新特性：

- ✅ **多模态**（图片、音频、视频）
- ✅ **Thinking Mode**（思考模式）
- ✅ **Tool Calling**（工具调用）
- ✅ **Function Calling**（函数调用）
- ✅ **Parallel Tool Calls**（并行工具调用）
- ✅ **JSON Mode**（结构化输出）
- ✅ **未来扩展**...

## 架构设计

### 核心组件

```
utils/
├── messageTypes.js      # 消息类型定义和能力管理框架
├── thinkingMode.js      # Thinking Mode 示例实现
└── ...

managers/
└── ModelManager.js      # 模型管理器（集成 CapabilityManager）
```

### 关键类

1. **MessageTypes** - 全局命名空间
   - `ContentType` - 内容类型枚举
   - `MessageRole` - 消息角色枚举
   - `ModelCapability` - 模型能力枚举
   - `MessageHandlerRegistry` - 消息处理器注册表
   - `CapabilityManager` - 能力管理器
   - `MessageBuilder` - 消息构建器
   - `MessageParser` - 消息解析器

2. **CapabilityManager** - 能力检测
   - 白名单策略
   - 启发式检测
   - 自定义检测器注册
   - 结果缓存

3. **MessageHandlerRegistry** - 消息渲染
   - 按内容类型注册处理器
   - 动态扩展新类型
   - 自定义 UI 渲染逻辑

## 扩展示例

### 示例 1：添加新的模型能力检测

假设要添加对"代码执行"能力的支持：

```javascript
// 1. 在 messageTypes.js 中添加新的能力枚举
const ModelCapability = {
  // ... 现有能力
  CODE_EXECUTION: 'code_execution',  // 新增
};

// 2. 注册自定义检测器
const capabilityManager = window.MessageTypes.CapabilityManager;

capabilityManager.registerDetector(
  ModelCapability.CODE_EXECUTION,
  (modelName) => {
    const lower = modelName.toLowerCase();
    
    // 白名单
    const codeModels = ['gpt-4-code', 'claude-code', 'codellama'];
    if (codeModels.some(keyword => lower.includes(keyword))) {
      return true;
    }
    
    // 启发式检测
    return /(^|[-_/])code($|[-_/])/i.test(lower);
  }
);

// 3. 在 UI 中使用
const supportsCodeExecution = capabilityManager.checkCapability(
  'gpt-4-code',
  ModelCapability.CODE_EXECUTION
);
```

### 示例 2：添加新的消息类型渲染器

假设要添加对"代码执行结果"的渲染：

```javascript
// 1. 定义新的内容类型
const ContentType = {
  // ... 现有类型
  CODE_RESULT: 'code_result',  // 新增
};

// 2. 创建渲染器类
class CodeResultRenderer {
  render(contentItem) {
    const container = document.createElement('div');
    container.className = 'code-result-container';
    
    // 根据执行结果显示成功/失败
    if (contentItem.success) {
      container.innerHTML = `
        <div style="color: green;">✅ 执行成功</div>
        <pre>${contentItem.output}</pre>
      `;
    } else {
      container.innerHTML = `
        <div style="color: red;">❌ 执行失败</div>
        <pre>${contentItem.error}</pre>
      `;
    }
    
    return container;
  }
}

// 3. 注册处理器
const registry = window.MessageTypes.MessageHandlerRegistry;

registry.register(ContentType.CODE_RESULT, (contentItem) => {
  const renderer = new CodeResultRenderer();
  return renderer.render(contentItem);
});

// 4. 在消息中使用
const message = {
  role: 'assistant',
  content: [
    { type: 'text', text: '这是代码执行结果：' },
    { 
      type: 'code_result',
      success: true,
      output: 'Hello, World!'
    }
  ]
};
```

### 示例 3：完整的 Thinking Mode 集成

参考 `utils/thinkingMode.js` 的实现：

#### Step 1: 注册能力检测器

```javascript
capabilityManager.registerDetector(ModelCapability.THINKING, (modelName) => {
  const lower = modelName.toLowerCase();
  
  // 白名单匹配
  const thinkingModels = ['deepseek-r1', 'qwq', 'qwen3'];
  if (thinkingModels.some(k => lower.includes(k))) return true;
  
  // 启发式检测
  return /(^|[-_/])(thinking|reasoning|r1|qwq)($|[-_/])/i.test(lower);
});
```

#### Step 2: 创建渲染器

```javascript
class ThinkingRenderer {
  render(reasoningContent) {
    const container = document.createElement('div');
    container.className = 'thinking-container';
    container.innerHTML = `
      <div class="thinking-header">🧠 思考过程</div>
      <div class="thinking-content">${reasoningContent}</div>
    `;
    return container;
  }
  
  update(container, newContent) {
    const content = container.querySelector('.thinking-content');
    if (content) content.textContent += newContent;
  }
}
```

#### Step 3: 注册消息处理器

```javascript
registry.register(ContentType.REASONING, (contentItem) => {
  const renderer = new ThinkingRenderer();
  return renderer.render(contentItem.reasoning || '');
});
```

#### Step 4: 在流式响应中处理

```javascript
// 在 chat.js 的 port.onMessage 监听器中
if (msg.type === 'reasoning') {
  // 检查是否有 reasoning 容器
  let reasoningContainer = lastMessageElement.querySelector('.thinking-container');
  
  if (!reasoningContainer) {
    // 创建新的 thinking 容器
    const renderer = new ThinkingRenderer();
    reasoningContainer = renderer.render(msg.reasoning_content);
    lastMessageElement.insertBefore(reasoningContainer, lastMessageElement.firstChild);
  } else {
    // 更新现有容器
    const renderer = new ThinkingRenderer();
    renderer.update(reasoningContainer, msg.reasoning_content);
  }
}
```

### 示例 4：Tool Calling 完整流程

```javascript
// 1. 定义工具
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '城市名称' }
        },
        required: ['location']
      }
    }
  }
];

// 2. 发送请求时附带工具定义
port.postMessage({
  messages: chatMessages,
  apiKey: settings.apiKey,
  apiEndpoint,
  model: settings.model,
  tools: tools,  // 添加工具
  tool_choice: 'auto'  // 自动选择是否调用工具
});

// 3. 处理工具调用响应
if (msg.type === 'tool_call') {
  // 显示工具调用 UI
  const renderer = new ToolCallRenderer();
  msg.tool_calls.forEach(toolCall => {
    const element = renderer.render(toolCall);
    lastMessageElement.appendChild(element);
  });
  
  // 执行工具
  for (const toolCall of msg.tool_calls) {
    const result = await executeTool(toolCall);
    
    // 发送工具结果回模型
    port.postMessage({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: result
    });
  }
}
```

## API 参考

### CapabilityManager

```javascript
// 注册自定义检测器
registerDetector(capability, detector)

// 检测模型能力
checkCapability(modelName, capability)

// 获取完整能力配置
getModelCapabilities(modelName)

// 清除缓存
clearCache()
```

### MessageHandlerRegistry

```javascript
// 注册处理器
register(contentType, handler)

// 获取处理器
getHandler(contentType)

// 检查是否有处理器
hasHandler(contentType)

// 获取所有已注册类型
getRegisteredTypes()
```

### MessageBuilder

```javascript
// 创建文本消息
createTextMessage(text, role)

// 创建多模态消息
createMultiModalMessage(contentItems, role)

// 添加工具调用
addToolCalls(message, toolCalls)

// 创建工具结果消息
createToolResultMessage(toolCallId, content, name)

// 添加思考过程
addReasoning(message, reasoning)
```

### MessageParser

```javascript
// 解析流式响应块
parseStreamChunk(chunkData)

// 解析完整响应
parseCompleteResponse(responseData)
```

## 最佳实践

### 1. 能力检测优先级

```
1. 缓存查询（最快）
2. 自定义检测器（灵活）
3. 默认检测逻辑（兜底）
```

### 2. 消息渲染策略

```
1. 优先使用增量更新（性能好）
2. 回退到全量重渲染（兼容性好）
3. 保持 UI 状态一致性
```

### 3. 错误处理

```javascript
// 始终检查处理器是否存在
const handler = registry.getHandler(contentType);
if (handler) {
  return handler(contentItem);
} else {
  console.warn(`No handler for content type: ${contentType}`);
  return document.createTextNode(contentItem.text || '');
}
```

### 4. 性能优化

```javascript
// 使用缓存避免重复检测
const capability = capabilityManager.checkCapability(model, cap);

// 流式更新时只更新变化的部分
if (lastMessageElement) {
  lastMessageElement.innerHTML = renderMarkdown(newContent);
} else {
  render(); // 全量重渲染作为回退
}
```

## 调试技巧

### 1. 启用详细日志

```javascript
console.log('[CapabilityManager] Checking capability:', {
  model: modelName,
  capability: capability,
  result: result
});
```

### 2. 检查注册状态

```javascript
console.log('Registered content types:', 
  registry.getRegisteredTypes()
);
```

### 3. 验证能力检测

```javascript
const caps = capabilityManager.getModelCapabilities('gpt-4o');
console.table(caps);
```

## 未来扩展方向

1. **实时音视频流** - 添加 `STREAM_AUDIO`、`STREAM_VIDEO` 类型
2. **多轮工具调用** - 支持工具调用的链式执行
3. **Agent 工作流** - 支持复杂的 Agent 编排
4. **记忆管理** - 长期记忆的存储和检索
5. **知识图谱** - 结构化知识的可视化
6. **协作编辑** - 多人实时协作

## 总结

通过这个通用框架，你可以：

✅ **快速添加新能力** - 只需注册检测器和处理器  
✅ **保持向后兼容** - 回退机制确保旧功能正常  
✅ **灵活定制 UI** - 每个内容类型都可以自定义渲染  
✅ **高性能** - 缓存 + 增量更新  
✅ **易维护** - 清晰的职责分离  

任何新的 AI 交互模式都可以通过这个框架轻松集成！
