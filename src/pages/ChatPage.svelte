<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { KernelEvents } from '../../kernel/Events.js';
  import { useKernel, useNavigate } from '../lib/kernel-context.js';
  import { useToast } from '../lib/stores/toast.svelte.ts';
  import Button from '../components/ui/Button.svelte';
  import Dialog from '../components/ui/Dialog.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';

  const kernel: any = useKernel();
  const navigate = useNavigate();
  const toast = useToast();

  // ==================== 核心引用 ====================
  const ipc: any = kernel?.getIPC?.();
  const chatChannel = ipc?.getOrCreateChannel?.('chat') || ipc;
  const toolChannel = ipc?.getOrCreateChannel?.('tool') || ipc;
  const sessionManager: any = kernel?.getSessionManager?.();
  const toolRegistry: any = kernel?.toolRegistry;

  // ==================== 响应式状态 ====================
  let messages = $state<any[]>([]);
  let session = $state<any>(null);
  let isStreaming = $state(false);
  let inputText = $state('');
  let toolPanelVisible = $state(false);
  let allTools = $state<any[]>([]);

  // 流式内容累积 Map: messageId → { content, reasoning }
  let streamingMap = $state<Record<string, { content: string; reasoning: string }>>({});

  // 推理强度
  let reasoningEffort = $state('medium');
  let showThinkingControl = $state(false);

  // 删除确认弹窗
  let deleteTargetId = $state<string | null>(null);

  // ==================== 工具函数 ====================

  /** 从 msg.content 统一提取纯文本 */
  function extractText(content: unknown): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (content as any[])
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n\n');
    }
    return String(content);
  }

  /** Markdown 渲染 */
  function renderMarkdown(md: string): string {
    if (!md) return '';
    try {
      return (window as any).marked?.parse(md) ?? md;
    } catch {
      return md;
    }
  }

  /** HTML 安全转义 */
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 检查当前模型是否支持思考模式 */
  function checkModelSupportsThinking(): boolean {
    try {
      const settings = kernel?.getSettingsManager?.()?.getSettings?.();
      return !!(settings && settings.model);
    } catch {
      return false;
    }
  }

  // ==================== 消息刷新 ====================

  function refreshMessages() {
    const s = sessionManager?.getCurrentSession?.();
    session = s || null;
    messages = s?.messages ? [...s.messages] : [];
    showThinkingControl = checkModelSupportsThinking();
    reasoningEffort = s?.reasoningEffort || 'medium';
  }

  // ==================== 业务逻辑 ====================

  function handleSend() {
    const content = inputText.trim();
    if (!content) return;

    inputText = '';
    chatChannel?.emit(KernelEvents.CHAT.USER_APPLY_SEND, {
      content,
      reasoningEffort: session?.reasoningEffort || reasoningEffort,
    });
  }

  function handleStop() {
    chatChannel?.emit(KernelEvents.CHAT.USER_APPLY_STOP);
  }

  function handleNewChat() {
    sessionManager?.setCurrentSession?.(null);
    streamingMap = {};
    refreshMessages();
  }

  function confirmDelete(id: string) {
    deleteTargetId = id;
  }

  function handleDeleteMessage() {
    if (!deleteTargetId) return;
    chatChannel?.emit(KernelEvents.CHAT.USER_APPLY_DELETE_MESSAGE, {
      messageId: deleteTargetId,
    });
    deleteTargetId = null;
    toast.success('已删除');
  }

  function handleReasoningEffortChange(val: string) {
    reasoningEffort = val;
    if (session) {
      sessionManager?.updateSession?.(session.id, (s: any) => (s.reasoningEffort = val));
    }
  }

  function toggleTool(tool: any) {
    if (tool.enabled) {
      tool.disable?.();
    } else {
      tool.enable?.();
    }
    // 强制刷新工具列表以触发 UI 更新
    refreshTools();
  }

  function refreshTools() {
    allTools = toolRegistry?.getAll?.() || [];
  }

  // ==================== 自动滚动 ====================
  let messagesContainer: HTMLDivElement | undefined;
  let prevMessageCount = 0;

  function scrollToBottom(force = false) {
    if (!messagesContainer) return;
    const el = messagesContainer;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (force || nearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  $effect(() => {
    // 检测消息数组变化并自动滚动
    const count = messages.length;
    if (count !== prevMessageCount) {
      prevMessageCount = count;
      scrollToBottom(count > prevMessageCount);
    }
  });

  // 流式过程中持续滚动
  $effect(() => {
    if (isStreaming) {
      scrollToBottom(true);
    }
  });

  // ==================== IPC 事件监听 ====================
  onMount(() => {
    if (!chatChannel) return;

    // 流式生命周期
    chatChannel.on(KernelEvents.CHAT.STREAM_START, () => {
      isStreaming = true;
    });

    chatChannel.on(KernelEvents.CHAT.STREAM_COMPLETE, (data: any) => {
      isStreaming = false;
      // 清除该消息的流式覆盖
      if (data?.message?.id) {
        const newMap = { ...streamingMap };
        delete newMap[data.message.id];
        streamingMap = newMap;
      }
      refreshMessages();
      scrollToBottom(true);
    });

    chatChannel.on(KernelEvents.CHAT.STREAM_STOP, () => {
      isStreaming = false;
      refreshMessages();
    });

    chatChannel.on(KernelEvents.CHAT.STREAM_ERROR, (data: any) => {
      isStreaming = false;
      toast.error(data?.message || '发送失败');
      refreshMessages();
    });

    // 消息变更 → 全量刷新
    chatChannel.on(KernelEvents.CHAT.MESSAGE_ADDED, () => {
      refreshMessages();
    });

    chatChannel.on(KernelEvents.CHAT.MESSAGE_DELETED, () => {
      refreshMessages();
    });

    chatChannel.on(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, () => {
      streamingMap = {};
      refreshMessages();
    });

    // 流式分片追加
    chatChannel.on(KernelEvents.CHAT.STREAM_CHUNK_APPEND, (data: any) => {
      const { messageId, content, reasoning_content } = data;
      if (!messageId) return;

      const entry = streamingMap[messageId] || { content: '', reasoning: '' };
      if (content) entry.content += content;
      if (reasoning_content) entry.reasoning += reasoning_content;
      streamingMap = { ...streamingMap, [messageId]: entry };
    });

    // 消息更新（全文替换）
    chatChannel.on(KernelEvents.CHAT.MESSAGE_UPDATED, (data: any) => {
      if (!data?.message) return;
      const idx = messages.findIndex((m) => m.id === data.message.id);
      if (idx >= 0) {
        messages = [...messages.slice(0, idx), data.message, ...messages.slice(idx + 1)];
      }
    });

    // 工具事件
    if (toolChannel) {
      toolChannel.on(KernelEvents.TOOL.EXECUTING, () => {
        // UI 已通过 isStreaming 控制，但也可在此添加进度指示
      });

      toolChannel.on(KernelEvents.TOOL.COMPLETED, () => {
        // 工具完成后消息会通过 MESSAGE_ADDED/MESSAGE_UPDATED 触发刷新
      });
    }

    // 初始化
    refreshMessages();
    refreshTools();
  });

  onDestroy(() => {
    // IPC 监听器清理交由 kernel 管理（随页面卸载自然销毁）
  });

  // ==================== 获取消息显示内容 ====================
  function getMessageDisplayContent(msg: any): string {
    const streaming = streamingMap[msg.id];
    if (streaming && streaming.content) {
      // 流式进行中：显示累积内容
      return streaming.content;
    }
    // 流式完成或非流式：显示消息内容
    return extractText(msg.content);
  }

  function getMessageDisplayReasoning(msg: any): string | null {
    const streaming = streamingMap[msg.id];
    if (streaming && streaming.reasoning) {
      return streaming.reasoning;
    }
    if (msg.reasoning_content) {
      return extractText(msg.reasoning_content);
    }
    return null;
  }

  // ==================== 思考强度选项 ====================
  const reasoningEfforts = [
    { value: 'high', label: '高', icon: '🚀' },
    { value: 'medium', label: '中', icon: '🔥' },
    { value: 'low', label: '低', icon: '⚡' },
    { value: 'off', label: '关', icon: '⭕' },
  ];

  let effortDropdownOpen = $state(false);

  // ==================== 折叠状态 ====================
  let collapsedMessages = $state<Record<string, boolean>>({});
  let collapsedToolCalls = $state<Record<string, boolean>>({});
  let expandedReasoning = $state<Record<string, boolean>>({});

  function toggleMsg(id: string) {
    collapsedMessages[id] = !collapsedMessages[id];
  }

  function toggleToolCall(id: string) {
    collapsedToolCalls[id] = !collapsedToolCalls[id];
  }

  function toggleReasoning(id: string) {
    expandedReasoning[id] = !expandedReasoning[id];
  }

  function handleGlobalClick(e: MouseEvent) {
    if (effortDropdownOpen) {
      const target = e.target as HTMLElement;
      if (!target.closest('.effort-control')) {
        effortDropdownOpen = false;
      }
    }
  }

  $effect(() => {
    if (effortDropdownOpen) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chat-page">
  <!-- ==================== 头部 ==================== -->
  <header class="chat-header">
    <h2 class="chat-title">{session?.title || '新对话'}</h2>
    <div class="chat-header-actions">
      {#if showThinkingControl}
        <div class="effort-control">
          <Button
            variant={reasoningEffort !== 'off' ? 'primary' : 'secondary'}
            size="sm"
            onclick={() => (effortDropdownOpen = !effortDropdownOpen)}
          >
            think{reasoningEffort !== 'off' ? reasoningEffort : 'off'}
          </Button>
          {#if effortDropdownOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              class="effort-dropdown"
              role="listbox"
              onclick={(e) => e.stopPropagation()}
            >
              {#each reasoningEfforts as eff}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <button
                  class="effort-option"
                  class:active={reasoningEffort === eff.value}
                  onclick={() => {
                    handleReasoningEffortChange(eff.value);
                    effortDropdownOpen = false;
                  }}
                  role="option"
                  aria-selected={reasoningEffort === eff.value}
                >
                  {eff.icon} {eff.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <Button variant="secondary" size="sm" onclick={handleNewChat}>
        + 新对话
      </Button>
    </div>
  </header>

  <!-- ==================== 消息列表 ==================== -->
  <div
    class="chat-messages"
    bind:this={messagesContainer}
    id="message-list"
  >
    {#if messages.length === 0}
      <div class="chat-empty-wrapper">
        <EmptyState icon="💬" title="开始新对话" description="支持 Markdown 渲染与思考过程显示" />
      </div>
    {:else}
      {#each messages as msg (msg.id)}
        {@const displayContent = getMessageDisplayContent(msg)}
        {@const displayReasoning = getMessageDisplayReasoning(msg)}
        {@const isUser = msg.role === 'user'}
        {@const isTool = msg.role === 'tool'}
        {@const isAssistant = msg.role === 'assistant' || (!isUser && !isTool)}
        {@const hasReasoning = !!displayReasoning}
        {@const hasContent = displayContent.trim().length > 0}
        {@const hasToolCalls = isAssistant && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0}

        <!-- =========================== -->
        <!-- Tool 消息：折叠式结果卡片     -->
        <!-- =========================== -->
        {#if isTool}
          {@const raw = extractText(msg.content)}
          {@const isJson = raw.startsWith('{') || raw.startsWith('[')}
          {@const mdSource = isJson ? '```json\n' + raw + '\n```' : raw}
          {@const rendered = renderMarkdown(mdSource)}
          {@const toolCallLabel = msg.toolCallId ? '🔗 ' + msg.toolCallId : '🔧 Tool result'}
          <div
            class="message-tool-card"
            data-message-id={msg.id}
            data-tool-call-id={msg.toolCallId || ''}
          >
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tool-card-header" onclick={toggleMsg(msg.id)}>
              <span class="tool-result-label">{toolCallLabel}</span>
              <span
                class="tool-result-toggle"
                class:collapsed={collapsedMessages[msg.id]}
              >▼</span>
            </div>
            {#if !collapsedMessages[msg.id]}
              <div class="tool-card-body">
                <div class="message-content markdown-body">{@html rendered}</div>
              </div>
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <button
              class="msg-delete-btn"
              title="删除结果"
              onclick={(e) => { e.stopPropagation(); confirmDelete(msg.id); }}
            >×</button>
          </div>

        {:else}
          <!-- ============================ -->
          <!-- User / Assistant 消息气泡    -->
          <!-- ============================ -->
          <div
            class="message-bubble"
            class:message-user={isUser}
            class:message-assistant={isAssistant}
            data-message-id={msg.id}
          >
            <div class="message-body">
              <!-- 思考过程（Assistant 专属） -->
              {#if hasReasoning}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="reasoning-section" class:reasoning-expanded={expandedReasoning[msg.id]}>
                  <div
                    class="reasoning-header"
                    onclick={() => toggleReasoning(msg.id)}
                  >
                    <span>💭 思考过程</span>
                    <span class="reasoning-toggle">▼</span>
                  </div>
                  <div class="reasoning-content">
                    <pre>{displayReasoning}</pre>
                  </div>
                </div>
              {/if}

              <!-- 工具调用卡片（Assistant 专属） -->
              {#if hasToolCalls}
                <div class="tool-calls-container">
                  {#each msg.toolCalls as tc (tc.id)}
                    {@const tcId = tc.id || ''}
                    {@const tcName = tc.toolName || 'unknown'}
                    {@const tcArgs = tc.arguments || {}}
                    {@const argsStr = JSON.stringify(tcArgs, null, 2)}
                    <div class="tool-call-card" data-tool-call-id={tcId}>
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="tool-call-header"
                        onclick={() => toggleToolCall(tcId)}
                      >
                        <span class="tool-card-icon">🔧</span>
                        <span class="tool-card-name">{tcName}</span>
                        <span class="tool-card-args-summary"
                          >({argsStr.slice(0, 60)}{argsStr.length > 60 ? '...' : ''})</span
                        >
                      </div>
                      {#if !collapsedToolCalls[tcId]}
                        <div class="tool-call-body">
                          <pre>{argsStr}</pre>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- 消息内容 -->
              {#if hasContent}
                <div class="message-content markdown-body">{@html renderMarkdown(displayContent)}</div>
              {:else if hasReasoning && isAssistant}
                <div class="message-content reasoning-only-hint">
                  仅有思考过程，请展开上方查看
                </div>
              {/if}
            </div>

            <!-- 删除按钮 -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <button
              class="msg-delete-btn"
              title="删除消息"
              onclick={(e) => { e.stopPropagation(); confirmDelete(msg.id); }}
            >×</button>
          </div>
        {/if}
      {/each}
    {/if}

    <!-- 流式加载指示器 -->
    {#if isStreaming}
      <div class="streaming-indicator">
        <span class="streaming-dot"></span>
        <span class="streaming-dot"></span>
        <span class="streaming-dot"></span>
      </div>
    {/if}
  </div>

  <!-- ==================== 输入区域 ==================== -->
  <footer class="chat-input-area">
    <!-- 工具面板 -->
    {#if toolPanelVisible}
      <div class="tool-panel" id="tool-panel">
        <div class="tool-panel-title">可用工具</div>
        {#if allTools.length === 0}
          <div class="tool-panel-empty">暂无可用工具</div>
        {:else}
          {#each allTools as tool (tool.definition?.name)}
            {@const def = tool.definition}
            {#if def}
              <div class="tool-panel-item">
                <div class="tool-panel-info">
                  <span class="tool-panel-name">{def.name}</span>
                  <span class="tool-panel-desc">{def.description || ''}</span>
                </div>
                <Button
                  variant={tool.enabled ? 'ghost' : 'secondary'}
                  size="sm"
                  onclick={() => toggleTool(tool)}
                >
                  {tool.enabled ? '已启用' : '已禁用'}
                </Button>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    {/if}

    <div class="chat-input-row">
      <Button
        variant="secondary"
        size="md"
        onclick={() => {
          toolPanelVisible = !toolPanelVisible;
          if (toolPanelVisible) refreshTools();
        }}
      >
        🔧 工具
      </Button>

      <textarea
        class="chat-textarea"
        bind:value={inputText}
        placeholder="输入消息 (Ctrl+Enter 发送)"
        rows="1"
        disabled={isStreaming}
        oninput={(e) => {
          const el = e.target as HTMLTextAreaElement;
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 150) + 'px';
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
      ></textarea>

      {#if isStreaming}
        <Button variant="danger" size="md" onclick={handleStop}>
          ⏹ 停止
        </Button>
      {:else}
        <Button variant="primary" size="md" onclick={handleSend} disabled={!inputText.trim()}>
          发送
        </Button>
      {/if}
    </div>
  </footer>

  <!-- ==================== 删除确认弹窗 ==================== -->
  {#if deleteTargetId}
    <Dialog
      title="删除消息"
      message="确定要删除这条消息吗？"
      confirmText="删除"
      type="danger"
      onconfirm={handleDeleteMessage}
      oncancel={() => (deleteTargetId = null)}
    />
  {/if}
</div>

<style>
  /* ==================== 页面布局 ==================== */
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ==================== 头部 ==================== */
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border-light, #e9ecef);
    flex-shrink: 0;
    min-height: 48px;
  }

  .chat-title {
    font-size: var(--text-md, 14px);
    font-weight: 600;
    color: var(--color-text, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 12px;
  }

  .chat-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* ==================== 思考强度控制 ==================== */
  .effort-control {
    position: relative;
  }

  .effort-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border-medium, #dee2e6);
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1));
    z-index: 100;
    min-width: 120px;
    overflow: hidden;
  }

  .effort-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    color: var(--color-text, #1a1a2e);
    text-align: left;
    transition: background var(--transition-fast, 150ms);
  }

  .effort-option:hover {
    background: var(--color-surface-hover, #f5f6f8);
  }

  .effort-option.active {
    background: var(--color-primary-light, #e8f2fd);
    color: var(--color-primary, #378add);
    font-weight: 600;
  }

  /* ==================== 消息列表区域 ==================== */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-behavior: smooth;
  }

  .chat-empty-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ==================== 用户消息气泡 ==================== */
  .message-bubble {
    position: relative;
    display: flex;
    max-width: 85%;
    animation: msgFadeIn 200ms ease;
  }

  .message-bubble.message-user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message-bubble.message-assistant {
    align-self: flex-start;
  }

  .message-body {
    padding: 10px 14px;
    border-radius: var(--radius-lg, 12px);
    min-width: 80px;
    width: 100%;
  }

  .message-user .message-body {
    background: var(--color-primary, #378add);
    color: var(--color-text-on-primary, #fff);
    border-bottom-right-radius: 4px;
  }

  .message-assistant .message-body {
    background: var(--color-surface, #f5f6f8);
    color: var(--color-text, #1a1a2e);
    border: 1px solid var(--color-border-light, #e9ecef);
    border-bottom-left-radius: 4px;
  }

  .msg-delete-btn {
    position: absolute;
    top: 4px;
    right: -24px;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--color-text-tertiary, #adb5bd);
    font-size: 14px;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 150ms, color 150ms;
    padding: 0;
    line-height: 1;
  }

  .message-user .msg-delete-btn {
    left: -24px;
    right: auto;
  }

  .message-bubble:hover .msg-delete-btn {
    opacity: 1;
  }

  .msg-delete-btn:hover {
    color: var(--color-error, #e74c3c);
    background: var(--color-surface-hover, #f0f0f0);
  }

  @keyframes msgFadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ==================== 消息内容 ==================== */
  .message-content {
    font-size: var(--text-sm, 13px);
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  .reasoning-only-hint {
    color: var(--color-text-tertiary, #adb5bd);
    font-style: italic;
    font-size: var(--text-xs, 12px);
  }

  /* Markdown 内容样式 */
  .message-content :global(p) {
    margin: 0 0 4px;
  }

  .message-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .message-content :global(pre) {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 6px;
    padding: 10px;
    overflow-x: auto;
    font-size: var(--text-xs, 12px);
    line-height: 1.5;
    margin: 6px 0;
  }

  .message-content :global(code) {
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: var(--text-xs, 12px);
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .message-content :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .message-content :global(ul),
  .message-content :global(ol) {
    margin: 4px 0;
    padding-left: 20px;
  }

  .message-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 6px 0;
    font-size: var(--text-xs, 12px);
  }

  .message-content :global(th),
  .message-content :global(td) {
    border: 1px solid var(--color-border-light, #e9ecef);
    padding: 4px 8px;
    text-align: left;
  }

  .message-content :global(th) {
    background: var(--color-surface-hover, #f0f0f0);
    font-weight: 600;
  }

  /* ==================== 思考过程 ==================== */
  .reasoning-section {
    margin-bottom: 8px;
    border: 1px solid var(--color-border-light, #e9ecef);
    border-radius: var(--radius-md, 6px);
    overflow: hidden;
  }

  .reasoning-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--color-surface-hover, #f0f0f0);
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-secondary, #6b7280);
    user-select: none;
  }

  .reasoning-toggle {
    transition: transform var(--transition-fast, 150ms);
    font-size: 10px;
  }

  .reasoning-expanded .reasoning-toggle {
    transform: rotate(180deg);
  }

  .reasoning-content {
    display: none;
    padding: 8px 10px;
    font-size: var(--text-xs, 12px);
    line-height: 1.5;
    color: var(--color-text-secondary, #6b7280);
    background: var(--color-surface, #fafafa);
    max-height: 200px;
    overflow-y: auto;
  }

  .reasoning-expanded .reasoning-content {
    display: block;
  }

  .reasoning-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }

  /* ==================== 工具调用卡片 ==================== */
  .tool-calls-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .tool-call-card {
    border: 1px solid var(--color-border-light, #e9ecef);
    border-left: 3px solid var(--color-primary, #378add);
    border-radius: var(--radius-md, 6px);
    overflow: hidden;
    background: var(--color-surface, #fafafa);
  }

  .tool-call-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    user-select: none;
  }

  .tool-call-header:hover {
    background: var(--color-surface-hover, #f0f0f0);
  }

  .tool-card-icon {
    flex-shrink: 0;
  }

  .tool-card-name {
    font-weight: 600;
    color: var(--color-primary, #378add);
  }

  .tool-card-args-summary {
    color: var(--color-text-tertiary, #adb5bd);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .tool-call-body {
    padding: 6px 8px;
    border-top: 1px solid var(--color-border-light, #e9ecef);
  }

  .tool-call-body pre {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    overflow-x: auto;
    max-height: 150px;
    background: rgba(0, 0, 0, 0.03);
    padding: 6px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ==================== Tool 消息卡片 ==================== */
  .message-tool-card {
    position: relative;
    align-self: flex-start;
    max-width: 85%;
    border: 1px solid var(--color-border-light, #e9ecef);
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
    background: var(--color-surface, #fafafa);
    animation: msgFadeIn 200ms ease;
  }

  .tool-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-secondary, #6b7280);
  }

  .tool-card-header:hover {
    background: var(--color-surface-hover, #f0f0f0);
  }

  .tool-result-label {
    font-weight: 500;
  }

  .tool-result-toggle {
    transition: transform var(--transition-fast, 150ms);
    font-size: 10px;
  }

  .tool-result-toggle.collapsed {
    transform: rotate(-90deg);
  }

  .tool-card-body {
    padding: 6px 10px 10px;
    border-top: 1px solid var(--color-border-light, #e9ecef);
  }

  .tool-card-body .message-content :global(pre) {
    max-height: 200px;
    overflow-y: auto;
    margin: 0;
  }

  /* ==================== 流式加载指示器 ==================== */
  .streaming-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 14px;
    align-self: flex-start;
    background: var(--color-surface, #f5f6f8);
    border-radius: var(--radius-lg, 12px);
    border-bottom-left-radius: 4px;
    border: 1px solid var(--color-border-light, #e9ecef);
  }

  .streaming-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-tertiary, #adb5bd);
    animation: dotPulse 1.4s infinite ease-in-out both;
  }

  .streaming-dot:nth-child(1) { animation-delay: -0.32s; }
  .streaming-dot:nth-child(2) { animation-delay: -0.16s; }
  .streaming-dot:nth-child(3) { animation-delay: 0s; }

  @keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  /* ==================== 输入区域 ==================== */
  .chat-input-area {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border-light, #e9ecef);
    background: var(--color-surface, #fff);
  }

  .chat-input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
  }

  .chat-textarea {
    flex: 1;
    border: 1px solid var(--color-border-medium, #dee2e6);
    border-radius: var(--radius-md, 6px);
    padding: 8px 10px;
    font-size: var(--text-sm, 13px);
    font-family: var(--font-sans, inherit);
    line-height: 1.5;
    resize: none;
    overflow-y: hidden;
    box-sizing: border-box;
    min-height: 36px;
    max-height: 150px;
    transition: border-color var(--transition-fast, 150ms);
    background: var(--color-surface, #fff);
    color: var(--color-text, #1a1a2e);
  }

  .chat-textarea:focus {
    outline: none;
    border-color: var(--color-primary, #378add);
    box-shadow: 0 0 0 2px rgba(55, 138, 221, 0.15);
  }

  .chat-textarea:disabled {
    background: var(--color-surface-hover, #f5f6f8);
    cursor: not-allowed;
  }

  /* ==================== 工具面板 ==================== */
  .tool-panel {
    border-bottom: 1px solid var(--color-border-light, #e9ecef);
    max-height: 200px;
    overflow-y: auto;
    padding: 8px 12px;
    background: var(--color-surface-hover, #fafafa);
  }

  .tool-panel-title {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tool-panel-empty {
    font-size: var(--text-xs, 12px);
    color: var(--color-text-tertiary, #adb5bd);
    text-align: center;
    padding: 12px 0;
  }

  .tool-panel-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border-light, #e9ecef);
  }

  .tool-panel-item:last-child {
    border-bottom: none;
  }

  .tool-panel-info {
    flex: 1;
    min-width: 0;
    margin-right: 8px;
  }

  .tool-panel-name {
    display: block;
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    color: var(--color-text, #1a1a2e);
    font-family: monospace;
  }

  .tool-panel-desc {
    display: block;
    font-size: 11px;
    color: var(--color-text-tertiary, #adb5bd);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
