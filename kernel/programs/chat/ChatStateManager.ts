/**
 * ChatStateManager — 聊天状态机
 *
 * 职责：
 * - 管理 ChatProgram 的生命周期状态（IDLE → WAITING → THINKING → GENERATING → 终态）
 * - 提供状态转换、查询、队列状态快照
 * - 纯逻辑，零外部依赖，单元可测
 */

/** 聊天程序状态枚举 */
export const CHAT_STATE = Object.freeze({
  IDLE:       'idle',
  WAITING:    'waiting',
  THINKING:   'thinking',
  GENERATING: 'generating',
  COMPLETED:  'completed',
  FAILED:     'failed',
  STOPPED:    'stopped',
});

export type ChatState = typeof CHAT_STATE[keyof typeof CHAT_STATE];

/** 活动状态快照（供 UI 消费） */
export interface QueueStatus {
  state: ChatState;
  sessionId: string | null;
  hasActive: boolean;
}

export class ChatStateManager {
  private _state: ChatState;
  private _onChange: ((previous: ChatState, current: ChatState) => void) | null;

  constructor(
    initialState: ChatState = CHAT_STATE.IDLE,
    onChange?: (previous: ChatState, current: ChatState) => void,
  ) {
    this._state = initialState;
    this._onChange = onChange || null;
  }

  /** 当前状态 */
  get state(): ChatState { return this._state; }

  /** 是否处于活跃状态（非 IDLE） */
  get isActive(): boolean { return this._state !== CHAT_STATE.IDLE; }

  /**
   * 状态转换。同状态无操作。
   * 如果注册了 onChange 回调，转换时调用它。
   */
  transition(newState: ChatState): void {
    if (this._state === newState) return;
    const previous = this._state;
    this._state = newState;
    if (this._onChange) this._onChange(previous, newState);
  }

  /** 重置到 IDLE */
  reset(): void { this._state = CHAT_STATE.IDLE; }

  /** 生成队列状态快照 */
  getQueueStatus(sessionId: string | null): QueueStatus {
    return {
      state: this._state,
      sessionId,
      hasActive: this._state !== CHAT_STATE.IDLE,
    };
  }
}
