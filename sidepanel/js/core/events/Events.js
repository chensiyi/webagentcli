/**
 * 事件常量定义
 * 统一管理所有事件名称和消息格式
 */

const Events = {
  // ==================== Chat 相关事件 ====================
  CHAT: {
    // 消息生命周期
    MESSAGE_ADDED: 'chat:messageAdded',        // 消息已添加
    MESSAGE_UPDATED: 'chat:messageUpdated',    // 消息已更新
    MESSAGE_DELETED: 'chat:messageDeleted',    // 消息已删除
    MESSAGES_ADDED: 'chat:messagesAdded',      // 批量消息添加
    
    // 用户交互
    USER_MESSAGE_SENT: 'chat:userMessageSent', // 用户发送消息
    
    // 流式请求
    STREAM_START: 'chat:streamStart',          // 流式请求开始
    STREAM_CHUNK_APPEND: 'chat:streamChunkAppend', // 流式分片追加（包含 content 和 reasoning_content）
    STREAM_UPDATE: 'chat:streamUpdate',        // 流式内容更新（已废弃）
    STREAM_COMPLETE: 'chat:streamComplete',    // 流式请求完成
    STREAM_ERROR: 'chat:streamError',          // 流式请求出错
    STREAM_STOP: 'chat:streamStop',            // 用户停止生成
    // 活动状态变更（用于按钮显示和 UI 锁定）
    ACTIVITY_STATE_CHANGED: 'chat:activityStateChanged',
    
    // 状态枚举
    STATE: {
      IDLE: 'idle',           // 空闲
      WAITING: 'waiting',     // 等待响应中
      THINKING: 'thinking',   // 思考中
      GENERATING: 'generating', // 生成正文中
      COMPLETED: 'completed', // 已完成
      FAILED: 'failed',       // 失败
      STOPPED: 'stopped'      // 已停止
    },
    // 会话管理
    SESSION_CREATED: 'chat:sessionCreated',    // 会话创建
    SESSION_SWITCHED: 'chat:sessionSwitched',  // 会话切换
    SESSION_CLEARED: 'chat:sessionCleared',    // 会话清空
    SESSION_DELETED: 'chat:sessionDeleted',    // 会话删除
    SESSION_CLEAR_REQUEST: 'chat:sessionClearRequest', // 清空会话请求
    SESSION_LOADED: 'chat:sessionLoaded',      // 会话加载
    SESSION_UPDATED: 'chat:sessionUpdated',    // 会话更新
    CURRENT_SESSION_CHANGED: 'chat:currentSessionChanged', // 当前会话变更
    ALL_SESSIONS_CLEARED: 'chat:allSessionsCleared', // 所有会话清空
  },
  
  // ==================== Settings 相关事件 ====================
  SETTINGS: {
    // 设置生命周期
    LOADED: 'settings:loaded',             // 设置已加载
    UPDATED: 'settings:updated',           // 设置已更新
    SAVE_REQUEST: 'settings:saveRequest',  // 请求保存设置
    SAVED: 'settings:saved',               // 设置已保存
    RESET: 'settings:reset',               // 设置已重置
    
    // API 配置变更
    API_STANDARD_CHANGED: 'settings:apiStandardChanged',  // API 标准变更
    API_ENDPOINT_CHANGED: 'settings:apiEndpointChanged',  // API 端点变更
    MODEL_CHANGED: 'settings:modelChanged',               // 模型变更
    
    // 模型管理
    MODELS_REQUEST: 'settings:modelsRequest',    // 请求加载模型列表
    MODELS_LOADED: 'settings:modelsLoaded',      // 模型列表已加载
    MODELS_ERROR: 'settings:modelsError',        // 模型加载错误
  },
  
  // ==================== Service 相关事件 ====================
  SERVICE: {
    CONFIGURED: 'service:configured',          // 服务已配置
    SWITCHED: 'service:switched',              // 服务已切换
    ERROR: 'service:error',                    // 服务错误
  },
  
  // ==================== UI 相关事件 ====================
  UI: {
    PAGE_CHANGED: 'ui:pageChanged',            // 页面切换
    THEME_CHANGED: 'ui:themeChanged',          // 主题变更
    LOADING: 'ui:loading',                     // 加载状态
  },
  
  // ==================== Storage 相关事件 ====================
  STORAGE: {
    LOADED: 'storage:loaded',                  // 存储数据已加载
    SEARCHED: 'storage:searched',              // 搜索结果
    ERROR: 'storage:error',                    // 存储操作错误
  },
  
  // ==================== Scripts 相关事件 ====================
  SCRIPTS: {
    LOADED: 'scripts:loaded',                  // 脚本列表已加载
    ERROR: 'scripts:error',                    // 脚本操作错误
  },

  // ==================== Tool 相关事件 ====================
  TOOL: {
    EXECUTING: 'tool:executing',               // 工具开始执行 { toolName, toolCallId, sessionId }
    COMPLETED: 'tool:completed',               // 工具执行完成 { toolName, toolCallId, status, duration, sessionId }
    ALL_COMPLETED: 'tool:allCompleted',        // 本轮所有工具执行完毕 { toolResults: [], sessionId }
  }
};

/**
 * 消息格式规范
 * 
 * 标准消息结构：
 * {
 *   event: string,           // 事件名称（使用 Events 常量）
 *   data: Object,            // 事件数据
 *   timestamp: number,       // 时间戳
 *   id: string              // 消息ID
 * }
 * 
 * 各事件的 data 格式：
 */

const MessageFormats = {
  // 消息添加
  MESSAGE_ADDED: {
    message: 'Message对象',
    type: "'user' | 'assistant' | 'system' | 'tool'"
  },
  
  // 流式更新
  STREAM_UPDATE: {
    message: 'Message对象',
    content: 'string - 新增的文本内容',
    reasoning_content: 'string - 推理内容（可选）'
  },
  
  // 流式分片追加
  STREAM_CHUNK_APPEND: {
    messageId: 'string - 消息ID',
    content: 'string - 分片内容（可能为空）',
    reasoning_content: 'string - 推理分片内容（可能为空）'
  },
  
  // 流式完成
  STREAM_COMPLETE: {
    message: 'Message对象',
    duration: 'number - 耗时（毫秒，可选）'
  },
  
  // 流式错误
  STREAM_ERROR: {
    error: 'Error对象',
    message: 'string - 错误消息'
  },
  
  // 会话切换
  SESSION_SWITCHED: {
    sessionId: 'string',
    session: 'Session对象'
  },
  
  // 设置更新
  SETTINGS_UPDATED: {
    key: 'string - 更新的键名',
    value: 'any - 新值',
    oldValue: 'any - 旧值（可选）'
  }
};

// 导出到全局
window.Events = Events;
window.MessageFormats = MessageFormats;
