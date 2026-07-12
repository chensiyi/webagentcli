/**
 * KernelEvents - 内核事件常量定义
 * 
 * 纯常量定义，零外部依赖
 * 包含：Session / Settings / Service / UI / Storage / Scripts / Tool 事件
 * 以及 Kernel 系统事件
 * 
 * 事件命名规范：
 * - 格式：{domain}:{action}
 * - 示例：session:messageAdded, settings:loaded
 * - 使用小写字母和冒号分隔
 */

export const KernelEvents = {
  KERNEL: {
    BOOT_START: 'kernel:bootStart',
    BOOT_PHASE: 'kernel:bootPhase',
    BOOT_COMPLETE: 'kernel:bootComplete',
    BOOT_ERROR: 'kernel:bootError',
    CRASHED: 'kernel:crashed',
    PING: 'kernel:ping',
    SHUTDOWN: 'kernel:shutdown',
    STATE_CHANGED: 'kernel:stateChanged',
    SERVICE_REGISTERED: 'kernel:serviceRegistered',
    SERVICE_INITIALIZED: 'kernel:serviceInitialized',
    SERVICE_STATE_CHANGED: 'kernel:serviceStateChanged',
    SERVICE_ERROR: 'kernel:serviceError',
  },
  SESSION: {
    MESSAGE_ADDED: 'session:messageAdded',
    MESSAGE_UPDATED: 'session:messageUpdated',
    MESSAGE_DELETED: 'session:messageDeleted',
    MESSAGES_ADDED: 'session:messagesAdded',
    USER_MESSAGE_SENT: 'session:userMessageSent',
    STREAM_START: 'session:streamStart',
    STREAM_CHUNK_APPEND: 'session:streamChunkAppend',
    STREAM_UPDATE: 'session:streamUpdate',
    STREAM_COMPLETE: 'session:streamComplete',
    STREAM_ERROR: 'session:streamError',
    STREAM_STOP: 'session:streamStop',
    WARNING: 'session:warning',
    ACTIVITY_STATE_CHANGED: 'session:activityStateChanged',
    SESSION_CREATED: 'session:sessionCreated',
    SESSION_SWITCHED: 'session:sessionSwitched',
    SESSION_CLEARED: 'session:sessionCleared',
    SESSION_DELETED: 'session:sessionDeleted',
    SESSION_CLEAR_REQUEST: 'session:sessionClearRequest',
    SESSION_LOADED: 'session:sessionLoaded',
    SESSION_UPDATED: 'session:sessionUpdated',
    CURRENT_SESSION_CHANGED: 'session:currentSessionChanged',
    ALL_SESSIONS_CLEARED: 'session:allSessionsCleared',
    // 内核授权命令（由 session RPC facade 经 createSessionFacade 直接 emit 并驱动编排，不再经 eventhandler 转译）
    // 祈使式，与上方过去式事件（如 MESSAGE_ADDED）配对：addMessage ↔ messageAdded，时态区分命令与事件
    ADD_MESSAGE: 'session:addMessage',
    STOP_STREAM: 'session:stopStream',
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
    CHANGED: 'scripts:changed',
    /** 用户脚本经 GM_registerMenuCommand 注册/反注册菜单命令后广播（Shell 菜单 UI 刷新） */
    MENU_CHANGED: 'scripts:menuChanged',
  },
  TOOL: {
    EXECUTING: 'tool:executing',
    COMPLETED: 'tool:completed',
    ALL_COMPLETED: 'tool:allCompleted',
    ERROR: 'tool:error',
    REGISTERED: 'tool:registered',
    UNREGISTERED: 'tool:unregistered',
    CHANGED: 'tool:changed',
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
    CANCEL_REQUEST: 'task:cancelRequest',
    FORCE_KILLED: 'task:forceKilled',
    RETRIED: 'task:retried',
    DELETED: 'task:deleted',
    BATCH_UPDATE: 'task:batchUpdate',
  },
  IPC: {
    MIDDLEWARE_ERROR: 'ipc:middlewareError',
    CHANNEL_CREATED: 'ipc:channelCreated',
    MESSAGE_SENT: 'ipc:messageSent',
    MESSAGE_RECEIVED: 'ipc:messageReceived',
  },
  CAPABILITY: {
    CHECK: 'capability:check',
    DENIED: 'capability:denied',
    GRANTED: 'capability:granted',
    REVOKED: 'capability:revoked',
  },
  /**
   * 危险工具人工确认闸门事件。
   * 内核在 invoke 危险工具（Tool.danger===true）前，经内核 IPC 向 Shell 广播 REQUEST，
   * Shell 弹确认框，用户决策后经专用 RPC `confirm.resolve` 回写（见 background/rpc-facades）。
   * 这是「UI 专用确认 RPC 接口」的 kernel→shell 半边（事件通知）；shell→kernel 半边是 RPC 调用。
   */
  CONFIRM: {
    REQUEST: 'confirm:request',
    /** 内核已收到用户决策（或超时自动拒绝）后广播，Shell 据此移除气泡内的待确认态 */
    RESOLVED: 'confirm:resolved',
  }
};

/**
 * IPC 命名空间通道名（getOrCreateChannel 参数）。
 * 集中定义，避免各 Manager / Shell 页面里裸字符串 'session' / 'settings' / ... 漂移。
 */
export const KernelChannels = {
  SESSION: 'session',
  SETTINGS: 'settings',
  SCRIPTS: 'scripts',
  TASK: 'task',
  TOOL: 'tool',
  STORAGE: 'storage',
} as const;

/**
 * 内核授权命令（addMessage / stopStream）已并入 KernelEvents.SESSION 组，
 * 与 USER_APPLY_*（用户意图）及过去式事件（MESSAGE_ADDED 等）同处一个命名空间，
 * 采用「时态区分」：祈使式命令 ↔ 过去式事件，cmd: 中缀冗余已移除。
 * 引用方式：KernelEvents.SESSION.ADD_MESSAGE / KernelEvents.SESSION.STOP_STREAM。
 */
