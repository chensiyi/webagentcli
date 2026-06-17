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

export const KernelEvents = {
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
  SERVICE: {
    CONFIGURED: 'service:configured',
    SWITCHED: 'service:switched',
    ERROR: 'service:error',
    STATE_CHANGED: 'service:stateChanged',
    HEALTH_CHECK: 'service:healthCheck',
  },
  UI: {
    PAGE_CHANGED: 'ui:pageChanged',
    THEME_CHANGED: 'ui:themeChanged',
    LOADING: 'ui:loading',
    ERROR: 'ui:error',
    NOTIFICATION: 'ui:notification',
  },
  STORAGE: {
    LOADED: 'storage:loaded',
    SEARCHED: 'storage:searched',
    ERROR: 'storage:error',
    SAVED: 'storage:saved',
    DELETED: 'storage:deleted',
  },
  SCRIPTS: {
    LOADED: 'scripts:loaded',
    ERROR: 'scripts:error',
    INJECTED: 'scripts:injected',
    EXECUTED: 'scripts:executed',
  },
  TOOL: {
    EXECUTING: 'tool:executing',
    COMPLETED: 'tool:completed',
    ALL_COMPLETED: 'tool:allCompleted',
    ERROR: 'tool:error',
    REGISTERED: 'tool:registered',
    UNREGISTERED: 'tool:unregistered',
  },
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
    BATCH_UPDATE: 'task:batchUpdate',
  },
  IPC: {
    MIDDLEWARE_ERROR: 'ipc:middlewareError',
    CHANNEL_CREATED: 'ipc:channelCreated',
    MESSAGE_SENT: 'ipc:messageSent',
    MESSAGE_RECEIVED: 'ipc:messageReceived',
    REQUEST_TIMEOUT: 'ipc:requestTimeout',
  },
  CAPABILITY: {
    CHECK: 'capability:check',
    DENIED: 'capability:denied',
    GRANTED: 'capability:granted',
    REVOKED: 'capability:revoked',
  }
};

export const KernelMessageFormats = {
  KERNEL_BOOT_START: { timestamp: 'number' },
  KERNEL_BOOT_PHASE: { phase: 'string', duration: 'number' },
  KERNEL_BOOT_COMPLETE: { duration: 'number', services: 'string[]' },
  KERNEL_SERVICE_STATE_CHANGED: { service: 'string', oldState: 'string', newState: 'string', reason: 'string?' },
  MESSAGE_ADDED: { message: 'Message', type: "'user'|'assistant'|'system'|'tool'" },
  STREAM_UPDATE: { message: 'Message', content: 'string', reasoning_content: 'string?' },
  STREAM_CHUNK_APPEND: { messageId: 'string', content: 'string', reasoning_content: 'string' },
  STREAM_COMPLETE: { message: 'Message', duration: 'number?' },
  STREAM_ERROR: { error: 'Error', message: 'string' },
  SESSION_SWITCHED: { sessionId: 'string', session: 'Session' },
  SESSION_CREATED: { session: 'Session' },
  SESSION_DELETED: { sessionId: 'string' },
  SETTINGS_UPDATED: { key: 'string', value: 'any', oldValue: 'any?' },
  SETTINGS_LOADED: { settings: 'Settings' },
  SERVICE_STATE_CHANGED: { service: 'string', oldState: 'string', newState: 'string', reason: 'string?' },
  SERVICE_ERROR: { service: 'string', error: 'Error', context: 'Object?' },
  TOOL_EXECUTING: { tool: 'string', args: 'Object' },
  TOOL_COMPLETED: { tool: 'string', result: 'Object', duration: 'number' },
  TOOL_ERROR: { tool: 'string', error: 'Error' },
  UI_LOADING: { key: 'string', loading: 'boolean' },
  UI_ERROR: { message: 'string', error: 'Error?' },
  UI_NOTIFICATION: { type: "'info'|'success'|'warning'|'error'", message: 'string', duration: 'number?' }
};

export class EventValidator {
  static validate(eventName, data) {
    const format = KernelMessageFormats[eventName];
    if (!format) return { valid: true, errors: [] };
    const errors = [];
    for (const [key] of Object.entries(format)) {
      if (!(key in data)) errors.push(`Missing required field: ${key}`);
    }
    return { valid: errors.length === 0, errors };
  }
  static getFormat(eventName) { return KernelMessageFormats[eventName] || null; }
  static getAllFormats() { return { ...KernelMessageFormats }; }
}

export default KernelEvents;