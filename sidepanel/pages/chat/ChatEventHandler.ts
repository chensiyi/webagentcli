/**
 * ChatEventHandler — 聊天事件转译层（Svelte 版）
 *
 * 职责：
 * 1. 监听 UI 层发出的 USER_APPLY_* 消息
 * 2. 鉴权、参数校验（预留）
 * 3. 转译为 ChatProgram 方法调用
 *
 * 事件流：UI → ChatEventHandler（转译）→ ChatProgram.sendMessage / cancel
 *
 * 对标旧版 sidepanel/js/event-handlers/ChatEventHandler.js，
 * 但 Svelte 版不直接操作 DOM（由 Svelte 组件负责渲染）。
 */

import { Log } from 'kernel/services/Log.js';
import { KernelEvents, KernelChannels } from 'kernel/Events.js';

export class ChatEventHandler {
  private kernel: any;
  private ipc: any;
  private chatChannel: any;
  private chatProgram: any;

  constructor(kernel: any, chatProgram: any) {
    this.kernel = kernel;
    this.chatProgram = chatProgram;
    this.ipc = kernel?.getIPC?.();
    this.chatChannel = this.ipc?.getOrCreateChannel?.(KernelChannels.CHAT) || this.ipc;

    this._registerEventListeners();
    Log.info('ChatEventHandler', 'Initialized');
  }

  destroy() {
    if (this.chatChannel) {
      this.chatChannel.off(KernelEvents.CHAT.USER_APPLY_SEND);
      this.chatChannel.off(KernelEvents.CHAT.USER_APPLY_STOP);
    }
  }

  private _registerEventListeners() {
    if (!this.chatChannel) return;

    // ---- 用户操作转译 ----

    this.chatChannel.on(KernelEvents.CHAT.USER_APPLY_SEND, (data: Record<string, unknown>) => {
      this._handleApplySend(data);
    });

    this.chatChannel.on(KernelEvents.CHAT.USER_APPLY_STOP, () => {
      this._handleApplyStop();
    });
  }

  /** 用户发送消息 → 校验 → ChatProgram.sendMessage */
  private _handleApplySend(data: Record<string, unknown>) {
    const { content, reasoningEffort } = data;
    if (typeof content !== 'string' || !content.trim()) {
      Log.warn('ChatEventHandler', 'Empty content blocked');
      return;
    }
    Log.info('ChatEventHandler', `User send: contentLength=${(content as string).length}, reasoningEffort=${reasoningEffort || 'none'}`);

    this.chatProgram.sendMessage({ content, reasoningEffort }).catch((err: Error) => {
      Log.error('ChatEventHandler', 'sendMessage failed:', err);
      this.chatChannel?.emit(KernelEvents.CHAT.STREAM_ERROR, {
        error: err,
        message: err.message || String(err),
      });
    });
  }

  /** 用户请求停止 → ChatProgram.cancel */
  private _handleApplyStop() {
    Log.info('ChatEventHandler', 'User requested stop');
    this.chatProgram.cancel();
  }
}
