/**
 * KernelEvents - 内核事件常量定义
 * 
 * 纯常量定义，零外部依赖
 * 包含：Chat / Settings / Service / UI / Storage / Scripts / Tool 事件
 * 以及 Kernel 系统事件
 * 
 * 事件命名规范：
 * - 格式：{domain}:{action}
 * - 示例：chat:messageAdded, settings:loaded
 * - 使用小写字母和冒号分隔
 */

const KernelEvents = {
  // ==================== Kernel 系统事件 ====================
  KERNEL: {
    BOOT_START: 'kernel:bootStart',
    BOOT_PHASE: 'kernel:bootPhase',
    BOOT_COMPLETE: 'kernel:bootComplete',
    BOOT_ERROR: 'kernel:bootError',
    SHUTDOWN: 'kernel:shutdown',
    STATE_CHANGED: 'kernel:stateChanged',
    SERVICE_REGISTERED: 'kernel:serviceRegistered',
    SERVICE_INITIALIZED: 'kernel:serviceInitialized',
    SERVICE_STATE_CHANGED: 'kernel:serviceStateChanged',
    SERVICE_ERROR: 'kernel:serviceError',
  },

  // ==================== Chat 相关事件 ====================
  CHAT: {
    MESSAGE_ADDED: 'chat:messageAdded',
    MESSAGE_UPDATED: 'chat:messageUpdated',
    MESSAGE_DELETED: 'chat:messageDeleted',
    MESSAGES_ADDED: 'chat:messagesAdded',
    USER_MESSAGE_SENT: 'chat:userMessageSent',
    STREAM_START: 'chat:streamStart',
    STREAM_CHUNK_APPEND: 'chat:streamChunkAppend',
    STREAM_UPDATE: 'chat:streamUpdate',
    STREAM_COMPLETE: 'chat:streamComplete',
    STREAM_ERROR: 'chat:streamError',
    STREAM_STOP: 'chat:streamStop',
    ACTIVITY_STATE_CHANGED: 'chat:activityStateChanged',
    STATE: {
      IDLE: 'idle',
      WAITING: 'waiting',
      THINKING: 'thinking',
      GENERATING: 'generating',
      COMPLETED: 'completed',
      FAILED: 'failed',
      STOPPED: 'stopped'
    },
    SESSION_CREATED: 'chat:sessionCreated',
    SESSION_SWITCHED: 'chat:sessionSwitched',
    SESSION_CLEARED: 'chat:sessionCleared',
    SESSION_DELETED: 'chat:sessionDeleted',
    SESSION_CLEAR_REQUEST: 'chat:sessionClearRequest',
    SESSION_LOADED: 'chat:sessionLoaded',
    SESSION_UPDATED: 'chat:sessionUpdated',
    CURRENT_SESSION_CHANGED: 'chat:currentSessionChanged',
    ALL_SESSIONS_CLEARED: 'chat:allSessionsCleared',
  },

  // ==================== Settings 相关事件 ====================
  SETTINGS: {
    LOADED: 'settings:loaded',
    UPDATED: 'settings:updated',
    SAVE_REQUEST: 'settings:saveRequest',
    SAVED: 'settings:saved',
    RESET: 'settings:reset',
    API_STANDARD_CHANGED: 'settings:apiStandardChanged',
    API_ENDPOINT_CHANGED: 'settings:apiEndpointChanged',
    MODEL_CHANGED: 'settings:modelChanged',
    MODELS_REQUEST: 'settings:modelsRequest',
    MODELS_LOADED: 'settings:modelsLoaded',
    MODELS_ERROR: 'settings:modelsError',
  },

  // ==================== Service 相关事件 ====================
  SERVICE: {
    CONFIGURED: 'service:configured',
    SWITCHED: 'service:switched',
    ERROR: 'service:error',
    STATE_CHANGED: 'service:stateChanged',
    HEALTH_CHECK: 'service:healthCheck',
  },

  // ==================== UI 相关事件 ====================
  UI: {
    PAGE_CHANGED: 'ui:pageChanged',
    THEME_CHANGED: 'ui:themeChanged',
    LOADING: 'ui:loading',
    ERROR: 'ui:error',
    NOTIFICATION: 'ui:notification',
  },

  // ==================== Storage 相关事件 ====================
  STORAGE: {
    LOADED: 'storage:loaded',
    SEARCHED: 'storage:searched',
    ERROR: 'storage:error',
    SAVED: 'storage:saved',
    DELETED: 'storage:deleted',
  },

  // ==================== Scripts 相关事件 ====================
  SCRIPTS: {
    LOADED: 'scripts:loaded',
    ERROR: 'scripts:error',
    INJECTED: 'scripts:injected',
    EXECUTED: 'scripts:executed',
  },

  // ==================== Tool 相关事件 ====================
  TOOL: {
    EXECUTING: 'tool:executing',
    COMPLETED: 'tool:completed',
    ALL_COMPLETED: 'tool:allCompleted',
    ERROR: 'tool:error',
    REGISTERED: 'tool:registered',
    UNREGISTERED: 'tool:unregistered',
  },

  // ==================== Task 相关事件 ====================
  TASK: {
    CREATED: 'task:created',
    STATUS_CHANGED: 'task:statusChanged',
    OUTPUT_UPDATED: 'task:outputUpdated',
    ERROR: 'task:error',
    QUEUED: 'task:queued',
    STARTED: 'task:started',
    COMPLETED: 'task:completed',
    CANCELLED: 'task:cancelled',
    RETRIED: 'task:retried',
    DELETED: 'task:deleted',
    BATCH_UPDATE: 'task:batchUpdate'
  },

  // ==================== IPC 系统事件 ====================
  IPC: {
    MIDDLEWARE_ERROR: 'ipc:middlewareError',
    CHANNEL_CREATED: 'ipc:channelCreated',
    MESSAGE_SENT: 'ipc:messageSent',
    MESSAGE_RECEIVED: 'ipc:messageReceived',
    REQUEST_TIMEOUT: 'ipc:requestTimeout',
  },

  // ==================== Capability 相关事件 ====================
  CAPABILITY: {
    CHECK: 'capability:check',
    DENIED: 'capability:denied',
    GRANTED: 'capability:granted',
    REVOKED: 'capability:revoked',
  }
};

/**
 * 消息格式规范
 * 
 * 定义每个事件的数据结构，用于验证和文档
 */
const KernelMessageFormats = {
  // Kernel 系统事件
  KERNEL_BOOT_START: {
    timestamp: 'number - 启动时间戳'
  },
  KERNEL_BOOT_PHASE: {
    phase: 'string - 启动阶段名称',
    duration: 'number - 阶段耗时（毫秒）'
  },
  KERNEL_BOOT_COMPLETE: {
    duration: 'number - 总启动耗时（毫秒）',
    services: 'string[] - 已初始化的服务列表'
  },
  KERNEL_SERVICE_STATE_CHANGED: {
    service: 'string - 服务名称',
    oldState: 'string - 旧状态',
    newState: 'string - 新状态',
    reason: 'string - 状态变更原因（可选）'
  },

  // Chat 事件
  MESSAGE_ADDED: {
    message: 'Message对象',
    type: "'user' | 'assistant' | 'system' | 'tool'"
  },
  STREAM_UPDATE: {
    message: 'Message对象',
    content: 'string - 新增的文本内容',
    reasoning_content: 'string - 推理内容（可选）'
  },
  STREAM_CHUNK_APPEND: {
    messageId: 'string - 消息ID',
    content: 'string - 分片内容（可能为空）',
    reasoning_content: 'string - 推理分片内容（可能为空）'
  },
  STREAM_COMPLETE: {
    message: 'Message对象',
    duration: 'number - 耗时（毫秒，可选）'
  },
  STREAM_ERROR: {
    error: 'Error对象',
    message: 'string - 错误消息'
  },
  SESSION_SWITCHED: {
    sessionId: 'string',
    session: 'Session对象'
  },
  SESSION_CREATED: {
    session: 'Session对象'
  },
  SESSION_DELETED: {
    sessionId: 'string'
  },

  // Settings 事件
  SETTINGS_UPDATED: {
    key: 'string - 更新的键名',
    value: 'any - 新值',
    oldValue: 'any - 旧值（可选）'
  },
  SETTINGS_LOADED: {
    settings: 'Settings对象'
  },

  // Service 事件
  SERVICE_STATE_CHANGED: {
    service: 'string - 服务名称',
    oldState: 'string - 旧状态',
    newState: 'string - 新状态',
    reason: 'string - 状态变更原因（可选）'
  },
  SERVICE_ERROR: {
    service: 'string - 服务名称',
    error: 'Error对象',
    context: 'Object - 错误上下文（可选）'
  },

  // Tool 事件
  TOOL_EXECUTING: {
    tool: 'string - 工具名称',
    args: 'Object - 工具参数'
  },
  TOOL_COMPLETED: {
    tool: 'string - 工具名称',
    result: 'Object - 工具结果',
    duration: 'number - 执行耗时（毫秒）'
  },
  TOOL_ERROR: {
    tool: 'string - 工具名称',
    error: 'Error对象'
  },

  // UI 事件
  UI_LOADING: {
    key: 'string - 加载标识',
    loading: 'boolean - 是否加载中'
  },
  UI_ERROR: {
    message: 'string - 错误消息',
    error: 'Error对象（可选）'
  },
  UI_NOTIFICATION: {
    type: "'info' | 'success' | 'warning' | 'error'",
    message: 'string - 通知消息',
    duration: 'number - 显示时长（毫秒，可选）'
  }
};

/**
 * 事件验证器
 * 用于验证事件数据是否符合规范
 */
class EventValidator {
  /**
   * 验证事件数据
   * @param {string} eventName - 事件名称
   * @param {Object} data - 事件数据
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(eventName, data) {
    const format = KernelMessageFormats[eventName];
    if (!format) {
      return { valid: true, errors: [] }; // 未知事件，跳过验证
    }

    const errors = [];
    
    for (const [key, description] of Object.entries(format)) {
      if (!(key in data)) {
        errors.push(`Missing required field: ${key}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取事件格式定义
   * @param {string} eventName - 事件名称
   * @returns {Object|null}
   */
  static getFormat(eventName) {
    return KernelMessageFormats[eventName] || null;
  }

  /**
   * 获取所有事件格式
   * @returns {Object}
   */
  static getAllFormats() {
    return { ...KernelMessageFormats };
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KernelEvents, KernelMessageFormats };
}
if (typeof window !== 'undefined') {
  window.KernelEvents = KernelEvents;
  window.KernelMessageFormats = KernelMessageFormats;
}
