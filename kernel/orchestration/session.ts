/**
 * orchestration/session.ts — 会话编排（每轮调用的纯函数，无单例）
 *
 * 设计（对标 OpenAI Runner / LangGraph / Vercel streamText 的会话管理范式）：
 * - 本模块不持有全局会话状态；每轮调用 runConversation 时，turn 状态存于模块级
 *   Map<sessionId, TurnState>，按 session 作用域——不同会话互不互斥（去掉旧版全局 _turn 锁）。
 * - 不订阅任何 IPC 通道；事件一律通过 onEvent 回调向外发射，由调用方（session RPC facade）注入 emit 接到 sessionChannel。
 * - provider 缓存注入、请求构造抽到 buildTurnRequest / applySessionCache（纯函数，可单测）。
 *
 * 公共 API：runConversation(kernel, input, { onEvent }) / cancelConversation(kernel, emit, sessionId?)
 *
 * 模块拆分（沿用）：
 * - ContextBuilder  → System Prompt + 消息截断 + API 格式转换
 * - ToolExecutor    → 工具调用循环（执行/结果收集/消息写入/事件发射）
 *
 * SESSION 组授权命令（ADD_MESSAGE / STOP_STREAM）定义于 kernel/Events.ts 的 KernelEvents.SESSION（与 USER_APPLY_* 同处），
 * 由 session RPC facade（createSessionFacade）直接 emit 内核授权命令并驱动编排，不再经 eventhandler 转译接线。
 */

import { KernelEvents } from '../Events.js';
import { Log } from '../services/Log.js';
import { Message } from '../models/Message.js';
import { ThinkingConfig } from '../models/MessageContent.js';
import { Session } from '../models/Session.js';
import { Kernel } from '../Kernel.js';
import { ContextBuilder } from './session-context.js';

/**
 * 解析某会话的有效工具定义集（openai 格式）。
 * 两层开关合并（依据用户设计：全局优先级最高，会话级低于全局）：
 *  1. 全局开关（ToolsManager）——全局关的工具根本不进入结果；
 *  2. 会话级局部开关（session.toolEnabled）——全局开时，若本会话该工具为 false，
 *     则在本会话内剔除；其余继承全局开启态。
 * 全局是天花板：会话级 true 无法「重新开启」一个全局已关的工具。
 */
export function resolveSessionToolDefs(kernel: Kernel, session: Session): unknown[] {
  const tm = kernel.getToolsManager();
  const overrides = session?.toolEnabled || null;
  return tm.getEnabled()
    .filter((t) => !(overrides && overrides[t.name] === false))
    .map((t) => t.toOpenAIFunction());
}
import { ToolExecutor } from './session-tools.js';
import { buildTurnRequest, applySessionCache } from './request.js';

/** 当前进行中的一轮生成（按 session 作用域，存于 turns Map）。 */
export interface TurnState {
  sessionId: string;
  assistantMessageId: string;
  startedAt: number;
  lastActiveAt: number;
}

export interface ConversationInput {
  sessionId?: string | null;
  content?: string | any[];
  reasoningEffort?: string;
  model?: unknown;
  isToolContinuation?: boolean;
  /** Shell 传入的活动标签页 id，供 ScriptTool 等页面操作类工具定位目标 */
  tabId?: number | null;
}

export interface ConversationHooks {
  onEvent: (event: string, data: unknown) => void;
}

// 模块级：按 sessionId 追踪进行中的轮次（取代旧版单例的全局 _turn）
const turns = new Map<string, TurnState>();
// 无状态的上下文构建器（模块级单例）
const contextBuilder = new ContextBuilder();

// ─── 公共入口：解析/创建会话，转交 runTurn ─────────────────────

export async function runConversation(
  kernel: Kernel,
  input: ConversationInput,
  hooks: ConversationHooks,
): Promise<void> {
  const {
    sessionId = null,
    content = '',
    reasoningEffort = 'off',
    model = null,
    isToolContinuation = false,
  } = input;
  const emit = hooks.onEvent;

  // provider 未就绪（设置尚未加载 / 未配置）→ 直接报错返回，不进入管线
  const service = kernel.getProviderFactory()?.getCurrentProvider();
  if (!service) {
    const err = new Error('Provider service not initialized yet. Please wait for settings to load or configure a provider in Settings.');
    emit(KernelEvents.SESSION.STREAM_ERROR, { error: err, message: err.message });
    return;
  }

  const sm = kernel.getSessionManager();

  let session: Session | null = null;
  try {
    if (!sessionId) throw new Error('sessionId is required to send a message');
    session = sm.getSession(sessionId as string);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (reasoningEffort && session.reasoningEffort !== (reasoningEffort as string)) {
      session.reasoningEffort = reasoningEffort as string;
    }
  } catch (e: any) {
    emit(KernelEvents.SESSION.STREAM_ERROR, { error: e, message: e.message });
    return;
  }

  return runTurn(kernel, session.id, { content, model, isToolContinuation: !!isToolContinuation, tabId: input.tabId ?? null }, emit);
}

// ─── 单轮生成管线（围绕某个 session；ReAct 续轮递归进入） ──────

async function runTurn(
  kernel: Kernel,
  sessionId: string,
  opts: { content: string | any[]; model: unknown; isToolContinuation: boolean; tabId?: number | null },
  emit: (event: string, data: unknown) => void,
): Promise<void> {
  const { content, model, isToolContinuation, tabId } = opts;
  const sm = kernel.getSessionManager();
  const settings = kernel.getSettingsManager().getSettings();
  const sid = sessionId;

  try {
    // ── 前置：用户消息 + 自动标题（仅非续轮） ──
    if (!isToolContinuation) {
      const hasContent =
        typeof content === 'string'
          ? !!content.trim()
          : Array.isArray(content) && content.length > 0;
      if (!hasContent) throw new Error('Message content is required');
      if (turns.has(sid)) throw new Error('A message is already being generated for this session');
      // 按 session 预留 turn，防止同会话并发 SEND 叠加（不同会话互不互斥）
      turns.set(sid, { sessionId: sid, assistantMessageId: '', startedAt: Date.now(), lastActiveAt: Date.now() });

      const userContent = typeof content === 'string' ? content.trim() : content;
      const userMsg = new Message({ role: 'user', content: userContent });
      await sm.addMessage(userMsg, sid);
      // 携带完整 message 对象，供 Shell 侧零 RPC 差量 upsert 进列表（否则需全量重拉才能显示）
      emit(KernelEvents.SESSION.MESSAGE_ADDED, { message: userMsg, messageId: userMsg.id, sessionId: sid });

      // 会话中仅此一条消息 → 首次发送，自动生成标题（纯数据派生，下沉 SessionManager）
      const session = sm.getSession(sid);
      if (session && session.messages.length === 1) {
        const autoTitle = sm.deriveAutoTitle(content as string);
        await sm.updateSession(sid, { title: autoTitle });
      }
    } else if (!turns.has(sid)) {
      throw new Error('No active turn for tool continuation');
    }

    // ── 上下文构建（委托 ContextBuilder） ──
    const freshSession = sm.getSession(sid);
    if (!freshSession) throw new Error(`Session not found: ${sid}`);
    // 两层开关合并：全局（ToolsManager）为天花板，本会话 toolEnabled 仅能收窄
    const tools = resolveSessionToolDefs(kernel, freshSession);
    const { messages: messagesForRequest, mediaWarnings } = await contextBuilder.buildMessages(freshSession, settings, tools, kernel.getMediaResolver() || undefined);

    // 媒体解析失败（如 mediaId 孤儿、IndexedDB 异常）上报 warning，由 Shell 弹 toast 提示用户
    if (mediaWarnings.length) {
      emit(KernelEvents.SESSION.WARNING, { warnings: mediaWarnings, sessionId: sid });
    }

    // 调试：打印每条消息的 content 形态，确认图片块是否进入请求体（image_url）
    try {
      Log.info('SESSION', '[media-debug] request messages summary', {
        count: messagesForRequest.length,
        perMessage: messagesForRequest.map((m: any, i: number) => ({
          i,
          role: m.role,
          contentKind: Array.isArray(m.content) ? 'parts[]' : typeof m.content,
          partTypes: Array.isArray(m.content) ? m.content.map((p: any) => p?.type) : undefined,
        })),
      });
    } catch { /* ignore */ }

    const modelId = model ? (model as any).id : (settings?.model || '');
    const thinkingEffort = freshSession.reasoningEffort || 'off';

    const service = kernel.getProviderFactory()?.getCurrentProvider();
    if (!service) throw new Error('Provider service not initialized yet.');

    // provider 缓存注入（抽出为纯函数副作用点）
    applySessionCache(service, sid);

    // ── API 请求 ──
    const request = buildTurnRequest({
      model: modelId,
      messages: messagesForRequest,
      thinking: new ThinkingConfig(thinkingEffort),
      tools: Array.isArray(tools) && tools.length > 0 ? tools : null,
    });

    // ── Assistant 消息占位（数据操作下沉 SessionManager） ──
    const assistantMsg = await sm.createAssistantPlaceholder(sid);
    const turn = turns.get(sid)!;
    turn.assistantMessageId = assistantMsg.id;
    emit(KernelEvents.SESSION.MESSAGE_ADDED, { message: assistantMsg, messageId: assistantMsg.id, sessionId: sid });
    emit(KernelEvents.SESSION.STREAM_START, { sessionId: sid, messageId: assistantMsg.id });

    // ── 流式响应 ──
    const result = await service.chatStream(request, (chunk: Record<string, unknown>) => {
      const t = turns.get(sid);
      if (t) t.lastActiveAt = Date.now();

      const c = (chunk.content as string) || '';
      const r = (chunk.reasoning_content as string) || '';

      sm.streamChunkMessage(assistantMsg.id, { content: c, reasoning_content: r }, sid);
      emit(KernelEvents.SESSION.STREAM_CHUNK_APPEND, {
        sessionId: sid, messageId: assistantMsg.id, content: c, reasoning_content: r,
      });
    });

    if (!result) {
      return;
    }

    // 流式结束：立即把累积的 token 强制落盘（不依赖批处理定时器窗口）
    await sm.flushSession(sid);

    // ── 工具调用（委托 ToolExecutor 做执行循环） ──
    if (result.toolCalls && result.toolCalls.length > 0) {
      await sm.updateMessage(assistantMsg.id, (msg: any) => {
        result.toolCalls.forEach((tc: any) => msg.addToolCall(tc));
        return msg;
      }, sid, { immediate: true });

      const duration = Date.now() - turns.get(sid)!.startedAt;
      // 流式结束：把最终完整消息（含累积 content / reasoning / toolCalls）推给 Shell，
      // 让 Shell 的 messages 列表与内核权威态对齐，再由其删除流式累积缓冲（streamingMap）。
      emit(KernelEvents.SESSION.MESSAGE_UPDATED, { message: assistantMsg, messageId: assistantMsg.id, sessionId: sid });
      emit(KernelEvents.SESSION.STREAM_COMPLETE, { sessionId: sid, messageId: assistantMsg.id, duration });

      const toolExecutor = new ToolExecutor(kernel, emit);
      await toolExecutor.execute(result.toolCalls, sid, { tabId: tabId ?? undefined });
      // 工具执行完成后，继续下一轮（ReAct 循环，递归进入续轮）
      await runTurn(kernel, sid, { content: '', model: null, isToolContinuation: true }, emit);
      return;
    }

    const duration = Date.now() - turns.get(sid)!.startedAt;
    // 流式结束：把最终完整消息推给 Shell，与内核权威态对齐（见上方同款注释）。
    emit(KernelEvents.SESSION.MESSAGE_UPDATED, { message: assistantMsg, messageId: assistantMsg.id, sessionId: sid });
    emit(KernelEvents.SESSION.STREAM_COMPLETE, { sessionId: sid, messageId: assistantMsg.id, duration });
  } catch (error: any) {
    const turn = turns.get(sid);
    const assistantMessageId = turn?.assistantMessageId;
    if (assistantMessageId) {
      sm.updateMessage(assistantMessageId, (msg: any) => {
        msg.content = `❌ 发送失败: ${error.message}`;
        return msg;
      }, sid, { immediate: true });
    }
    emit(KernelEvents.SESSION.STREAM_ERROR, {
      error, message: error.message,
      sessionId: sid, messageId: assistantMessageId,
    });
  } finally {
    turns.delete(sid);
  }
}

// ─── 取消 ──────────────────────────────────────────────────

/**
 * 取消进行中的轮次。
 * @param emit        事件发射回调（与 runConversation 同源）
 * @param sessionId  指定则只取消该会话；省略则取消全部进行中的轮次
 */
export function cancelConversation(
  kernel: Kernel,
  emit: (event: string, data: unknown) => void,
  sessionId?: string | null,
): void {
  const factory = kernel.getProviderFactory();

  if (sessionId) {
    const turn = turns.get(sessionId);
    if (!turn) return;
    factory?.getCurrentProvider()?.cancel?.();
    turns.delete(sessionId);
    emit(KernelEvents.SESSION.STREAM_STOP, {
      sessionId,
      messageId: turn.assistantMessageId,
    });
    return;
  }

  if (turns.size === 0) return;
  factory?.getCurrentProvider()?.cancel?.();
  const stopped = [...turns.values()];
  turns.clear();
  stopped.forEach((t) => emit(KernelEvents.SESSION.STREAM_STOP, {
    sessionId: t.sessionId,
    messageId: t.assistantMessageId,
  }));
}
