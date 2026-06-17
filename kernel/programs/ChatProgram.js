import { KernelEvents } from '../Events.js';

export const CMD = Object.freeze({
  SEND: 'chat:cmd:send',
  STOP: 'chat:cmd:stop',
  DELETE_MESSAGE: 'chat:cmd:deleteMessage',
});

export default class ChatProgram {
  constructor(serviceCenter) {
    this.serviceCenter = serviceCenter;
    this.eventBus = serviceCenter.getEventBus();
    this._session = null;
    this._assistantMsgId = null;
    this._destroyed = false;
    this._onSend = (data) => this.sendMessage(data);
    this._onStop = () => this.cancel();
    this._onDeleteMessage = (data) => this._deleteMessage(data);
    this._onSessionChanged = () => this._onSessionChangedHandler();
    this.eventBus.on(CMD.SEND, this._onSend);
    this.eventBus.on(CMD.STOP, this._onStop);
    this.eventBus.on(CMD.DELETE_MESSAGE, this._onDeleteMessage);
    this.eventBus.on(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const bus = this.eventBus;
    bus.off(CMD.SEND, this._onSend);
    bus.off(CMD.STOP, this._onStop);
    bus.off(CMD.DELETE_MESSAGE, this._onDeleteMessage);
    bus.off(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, this._onSessionChanged);
  }

  async sendMessage({ content, sessionId = null, model = null, reasoningEffort = undefined, isToolContinuation = false } = {}) {
    if (!isToolContinuation && !content?.trim()) return;
    const sm = this.serviceCenter.getSessionManager();
    let service;
    try { service = this.serviceCenter.getCurrentProviderService(); }
    catch (e) { this.eventBus.emit(KernelEvents.CHAT.STREAM_ERROR, { error: e, message: '请先在设置中配置 AI 服务' }); return; }
    const settings = this.serviceCenter.getSettingsManager();
    try {
      this._session = sessionId ? sm.getSession(sessionId) : sm.getCurrentSession();
      if (!this._session) this._session = sm.createSession({ title: '新对话', reasoningEffort });
      if (reasoningEffort) this._session.reasoningEffort = reasoningEffort;
      const fresh = sm.getSession(this._session.id);
      const tools = [];
      const messages = [];
      if (!isToolContinuation) sm.addMessage({ role: 'user', content: content.trim(), id: Date.now().toString() }, this._session.id);
      await sm.flushAllStreamWrites();
      this.eventBus.emit(KernelEvents.CHAT.STREAM_COMPLETE, { sessionId: this._session.id });
    } catch (error) {
      this.eventBus.emit(KernelEvents.CHAT.STREAM_ERROR, { error, message: error.message });
    } finally { await sm.flushAllStreamWrites(); }
  }

  _deleteMessage(data) {
    const sm = this.serviceCenter.getSessionManager();
    const s = sm.getCurrentSession();
    if (s && data.messageId) { if (sm.deleteMessage(data.messageId, s.id)) this.eventBus.emit(KernelEvents.CHAT.MESSAGE_DELETED, { messageId: data.messageId }); }
  }

  _onSessionChangedHandler() {
    // 会话切换：简单的 stream stop，实际由 UI 或 Kernel 状态机处理
  }

  cancel() {
    this.serviceCenter.getCurrentProviderService()?.cancel?.();
    this.eventBus.emit(KernelEvents.CHAT.STREAM_STOP, { sessionId: this._session?.id });
  }
}