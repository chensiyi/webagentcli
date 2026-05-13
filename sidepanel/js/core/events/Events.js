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
    
    // 流式请求
    STREAM_START: 'chat:streamStart',          // 流式请求开始
    STREAM_UPDATE: 'chat:streamUpdate',        // 流式内容更新
    STREAM_COMPLETE: 'chat:streamComplete',    // 流式请求完成
    STREAM_ERROR: 'chat:streamError',          // 流式请求出错
    STREAM_STOP: 'chat:streamStop',            // 用户停止生成
    
    // 会话管理
    SESSION_CREATED: 'chat:sessionCreated',    // 会话创建
    SESSION_SWITCHED: 'chat:sessionSwitched',  // 会话切换
    SESSION_CLEARED: 'chat:sessionCleared',    // 会话清空
    SESSION_DELETED: 'chat:sessionDeleted',    // 会话删除
  },
  
  // ==================== Settings 相关事件 ====================
  SETTINGS: {
    UPDATED: 'settings:updated',               // 设置已更新
    RESET: 'settings:reset',                   // 设置已重置
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
