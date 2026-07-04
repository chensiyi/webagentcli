/**
 * ContextBuilder — LLM 上下文组装器
 *
 * 职责：
 * 1. 构建 System Prompt（身份声明 + 页面环境 + 可用工具列表 + 行为原则）
 * 2. 按 contextWindowSize 截断历史消息，保护 tool_call/tool_result 配对
 * 3. 将内部消息格式统一转为 LLM API 格式
 *
 * 纯逻辑类，零副作用（不 emit 事件、不写存储）。
 * chrome.tabs 查询是唯一的浏览器依赖，在非浏览器环境静默跳过。
 */

import { MessageStructure } from '../../models/MessageContent.js';

/** ContextBuilder 配置 */
export interface ContextBuilderOptions {
  /** System prompt 角色描述，默认使用内置中文 Web Agent 提示 */
  systemRole?: string;
  /** 行为原则，附加在 system prompt 末尾 */
  systemPrinciples?: string;
}

/** 内部消息格式（兼容 Message 和普通对象） */
type InternalMessage = { role?: string; content?: unknown; toolCalls?: unknown[]; toolCallId?: string; toJSON?: () => Record<string, unknown> };

/** 会话对象的最小接口 */
interface SessionLike {
  messages?: InternalMessage[];
}

/** 设置对象的最小接口 */
interface SettingsLike {
  contextWindowSize?: number;
  autoContextTruncation?: boolean;
}

export class ContextBuilder {
  private systemRole: string;
  private systemPrinciples: string;

  constructor(options: ContextBuilderOptions = {}) {
    this.systemRole = options.systemRole || '你是一个运行在 Chrome 扩展 Side Panel 中的 Web Agent。你可以通过工具与浏览器页面交互，完成用户指定的任务。';
    this.systemPrinciples = options.systemPrinciples || '原则：\n1. 优先使用工具完成页面操作\n2. 工具调用失败时，分析错误信息，修正参数或换方案重试\n3. 暂时不需要的工具不要调用，等用户新消息到了再执行下一步\n4. 重要操作前建议先获取页面内容了解状态';
  }

  /**
   * 构建完整的 LLM 请求消息序列
   *
   * @param session  当前会话（含消息列表）
   * @param settings 全局设置（含 contextWindowSize）
   * @param tools    已注册工具的 OpenAI function definitions
   * @returns 可直接发给 LLM API 的消息数组
   */
  async buildMessages(
    session: SessionLike,
    settings: SettingsLike,
    tools: unknown[]
  ): Promise<Record<string, unknown>[]> {
    const systemMsg = await this._buildSystemPrompt(tools);
    const sessionMessages = this._prepSessionMessages(session, settings);

    const allMessages = [systemMsg, ...sessionMessages];
    return allMessages.map(m => {
      const src = (m && typeof (m as any).toJSON === 'function') ? (m as any).toJSON() : m;
      return MessageStructure.toAPIFormat(src);
    });
  }

  // ─── System Prompt ──────────────────────────────────────────

  private async _buildSystemPrompt(tools: unknown[]): Promise<Record<string, unknown>> {
    const parts: string[] = [];

    parts.push(this.systemRole);

    // 当前页面环境
    const pageCtx = await this._getPageContext();
    if (pageCtx) parts.push(pageCtx);

    // 可用工具清单（仅名称，完整定义通过 API tools 参数传递）
    if (tools && tools.length > 0) {
      const names = tools
        .map(t => (t as any)?.function?.name)
        .filter(Boolean);
      if (names.length > 0) {
        parts.push(`可用工具：${names.join('、')}。\n工具的完整定义和参数 schema 已通过 API 的 tools 参数传递，请按定义调用。`);
      }
    }

    parts.push(this.systemPrinciples);

    return { role: 'system', content: parts.join('\n\n') };
  }

  private async _getPageContext(): Promise<string> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab) {
        return `当前页面: ${tab.title || '(无标题)'} — ${tab.url || '(无URL)'}`;
      }
    } catch (_e) { /* 非浏览器环境，跳过 */ }
    return '';
  }

  // ─── 消息准备 ──────────────────────────────────────────────

  private _prepSessionMessages(session: SessionLike, settings: SettingsLike): InternalMessage[] {
    let msgs = (session.messages || []).filter(m => m != null);
    const maxSize = settings?.contextWindowSize || 20;

    if (settings?.autoContextTruncation !== false && msgs.length > maxSize) {
      msgs = this._truncate(msgs, maxSize);
    }

    return msgs;
  }

  // ─── 截断算法 ──────────────────────────────────────────────

  /**
   * 截断消息列表，保护 tool_call / tool_result 配对完整性。
   *
   * 策略：从末尾保留 maxSize 条。如果截断点后方第一条是 tool 消息（tool result），
   * 则向前回退直到找到对应的 assistant tool_call，确保 LLM 收到完整配对。
   */
  private _truncate(messages: InternalMessage[], maxSize: number): InternalMessage[] {
    if (messages.length <= maxSize) return messages;

    let cut = messages.length - maxSize;

    while (cut < messages.length) {
      const msg = messages[cut];
      const role = this._getRole(msg);

      if (role === 'tool') {
        cut--; // tool result 不能孤悬，向前找配对的 assistant tool_call
      } else if (role === 'assistant') {
        const toolCalls = (msg as any)?.toolCalls;
        if (toolCalls?.length) {
          break; // 这条 assistant 带 tool_calls，从这儿开始保留
        }
        break;
      } else {
        break; // 普通消息，截断点 OK
      }
    }

    if (cut < 0) cut = 0;
    return messages.slice(cut);
  }

  private _getRole(msg: InternalMessage): string {
    return msg?.role
      || (msg && typeof (msg as any).toJSON === 'function' ? (msg as any).toJSON().role : '')
      || '';
  }
}
