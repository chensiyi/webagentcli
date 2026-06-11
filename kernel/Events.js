/**
 * KernelEvents - 内核事件常量定义
 * 
 * 纯常量定义，零外部依赖
 * 包含：Chat / Settings / Service / UI / Storage / Scripts / Tool 事件
 * 以及 Kemel 系统事件
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
  },

  // ==================== UI 相关事件 ====================
  UI: {
    PAGE_CHANGED: 'ui:pageChanged',
    THEME_CHANGED: 'ui:themeChanged',
    LOADING: 'ui:loading',
  },

  // ==================== Storage 相关事件 ====================
  STORAGE: {
    LOADED: 'storage:loaded',
    SEARCHED: 'storage:searched',
    ERROR: 'storage:error',
  },

  // ==================== Scripts 相关事件 ====================
  SCRIPTS: {
    LOADED: 'scripts:loaded',
    ERROR: 'scripts:error',
  },

  // ==================== Tool 相关事件 ====================
  TOOL: {
    EXECUTING: 'tool:executing',
    COMPLETED: 'tool:completed',
    ALL_COMPLETED: 'tool:allCompleted',
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
 */
const KernelMessageFormats = {
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
  SETTINGS_UPDATED: {
    key: 'string - 更新的键名',
    value: 'any - 新值',
    oldValue: 'any - 旧值（可选）'
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KernelEvents, KernelMessageFormats };
}
if (typeof window !== 'undefined') {
  window.KernelEvents = KernelEvents;
  window.KernelMessageFormats = KernelMessageFormats;
}
