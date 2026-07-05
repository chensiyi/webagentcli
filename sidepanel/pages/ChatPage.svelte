<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { KernelEvents } from '../../kernel/Events.js';
  import { extractText, renderMarkdown } from '../utils/text.js';
  import { autoScrollToBottom } from '../utils/dom.js';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import Button from '../components/atoms/Button.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';

  // Sub-components
  import EffortControl from './chat/EffortControl.svelte';
  import MessageBubble from './chat/MessageBubble.svelte';
  import StreamingIndicator from './chat/StreamingIndicator.svelte';
  import ToolMessageCard from './chat/ToolMessageCard.svelte';
  import ToolPanel from './chat/ToolPanel.svelte';

  const kernel: any = getContext('kernel');
  const navigate = getContext('navigate');
  const toast = useToast();

  // ==================== 核心引用 ====================
  const ipc: any = kernel?.getIPC?.();
  const chatChannel = ipc?.getOrCreateChannel?.('chat') || ipc;
  const toolChannel = ipc?.getOrCreateChannel?.('tool') || ipc;
  const sessionManager: any = kernel?.getSessionManager?.();
  const toolsManager: any = kernel?.toolsManager;

  // ==================== 响应式状态 ====================
  let messages = $state<any[]>([]);
  let session = $state<any>(null);
  let isStreaming = $state(false);
  let inputText = $state('');
  let toolPanelVisible = $state(false);
  let allTools = $state<any[]>([]);
  // 工具启用状态用独立 map 追踪（tool 对象是内核普通对象，Svelte 无法深度追踪）
  let toolEnabledMap = $state<Record<string, boolean>>({});

  // 流式内容累积 Map: messageId → { content, reasoning }
  let streamingMap = $state<Record<string, { content: string; reasoning: string }>>({});

  // 工具执行进度
  let toolExecuting = $state(false);
  let toolExecutingName = $state('');

  // 推理强度
  let reasoningEffort = $state('medium');
  let showThinkingControl = $state(false);

  // 删除确认弹窗
  let deleteTargetId = $state<string | null>(null);

  // 标题编辑
  let isEditingTitle = $state(false);
  let editingTitle = $state('');
  let titleInput: HTMLInputElement | undefined;

  // ==================== 工具函数 ====================

  /** 根据 toolCallId 查找对应的工具结果消息 */
  function findToolResult(toolCallId: string): any {
    if (!toolCallId) return null;
    return messages.find((m: any) => m?.role === 'tool' && m?.toolCallId === toolCallId) || null;
  }

  /** 从 toolCallId 查找工具名（从 assistant 消息的 toolCalls 中） */
  function findToolNameByCallId(toolCallId: string): string {
    if (!toolCallId) return '';
    for (const m of messages) {
      if (m?.role === 'assistant' && Array.isArray(m.toolCalls)) {
        const tc = m.toolCalls.find((t: any) => t?.id === toolCallId);
        if (tc) return tc.toolName || tc.name || '';
      }
    }
    return '';
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
    const oldMessages = messages;
    // 浅拷贝消息对象，确保 Svelte 5 响应式系统能检测到属性变化
    // （session 中的消息对象引用不变，仅展开数组 Svelte 不重新计算 {@const} 派生值，
    //  导致流式结束后新增的 toolCalls 不被渲染——只显示空气泡）
    messages = s?.messages ? s.messages.filter(m => m != null).map(m => ({ ...m })) : [];
    showThinkingControl = checkModelSupportsThinking();
    // 无会话时从设置读取默认思考强度，而非硬编码 'medium'
    const settingsDefault = kernel?.getSettingsManager?.()?.getSettings?.()?.reasoningEffort || 'medium';
    reasoningEffort = s?.reasoningEffort || settingsDefault;

    // 新消息的思考过程默认折叠
    if (messages.length > oldMessages.length) {
      const newMsg = messages[messages.length - 1];
      if (newMsg && newMsg.reasoning_content) {
        expandedReasoning[newMsg.id] = false; // 默认折叠
      }
    }
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

  async function handleDeleteMessage() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    const sid = session?.id;
    if (!sid) {
      deleteTargetId = null;
      toast.error('会话不存在');
      return;
    }
    try {
      const ok = await sessionManager?.deleteMessage?.(id, sid);
      if (ok) {
        toast.success('已删除');
      } else {
        toast.error('未找到该消息');
        deleteTargetId = null;
        return;
      }
    } catch (err) {
      deleteTargetId = null;
      toast.error('删除失败: ' + String(err));
      return;
    }
    // 删除成功后再关闭弹窗并更新 UI
    deleteTargetId = null;
    refreshMessages();
  }

  function handleReasoningEffortChange(val: string) {
    reasoningEffort = val;
    if (session) {
      sessionManager?.updateSession?.(session.id, (s: any) => (s.reasoningEffort = val));
    }
  }

  // ==================== 标题编辑 ====================
  function startEditTitle() {
    if (!session) return;
    editingTitle = session.title || '新对话';
    isEditingTitle = true;
    // 下一帧 focus + 选中全部
    requestAnimationFrame(() => {
      titleInput?.focus();
      titleInput?.select();
    });
  }

  function saveEditTitle() {
    if (!session || !isEditingTitle) return;
    const newTitle = editingTitle.trim() || '新对话';
    isEditingTitle = false;
    if (session.title !== newTitle) {
      sessionManager?.updateSession?.(session.id, { title: newTitle });
      session.title = newTitle; // 即时更新 UI
    }
  }

  function cancelEditTitle() {
    isEditingTitle = false;
  }

  function toggleTool(tool: any) {
    if (tool.enabled) {
      tool.disable?.();
    } else {
      tool.enable?.();
    }
    // 更新响应式 map（tool 对象是内核普通对象，Svelte 无法深度追踪 tool.enabled）
    const name = tool.definition?.name;
    if (name) {
      toolEnabledMap = { ...toolEnabledMap, [name]: tool.enabled };
    }
    // 同时刷新工具列表（保持 allTools 最新）
    refreshTools();
  }

  function refreshTools() {
    const tools = toolsManager?.getAll?.() || [];
    allTools = [...tools];
    // 同步更新 enabled map
    const map: Record<string, boolean> = {};
    for (const t of tools) {
      if (t.definition?.name) map[t.definition.name] = t.enabled;
    }
    toolEnabledMap = map;
  }

  // ==================== 自动滚动 ====================
  let messagesContainer: HTMLDivElement | undefined;
  let prevMessageCount = 0;

  $effect(() => {
    const count = messages.length;
    if (count !== prevMessageCount) {
      prevMessageCount = count;
      if (messagesContainer) autoScrollToBottom(messagesContainer, count > prevMessageCount);
    }
  });

  $effect(() => {
    if (isStreaming && messagesContainer) {
      autoScrollToBottom(messagesContainer, true);
    }
  });

  // ==================== 事件监听器引用（用于 onDestroy 清理） ====================
  // 存储 unsubscribe 函数引用，避免重复注册
  let cleanups: (() => void)[] = [];

  // ==================== IPC 事件监听 ====================
  onMount(() => {
    if (!chatChannel) return;

    // 页面切换后重建：查询 ChatProgram 当前是否正在流式处理中
    const chatProgram = (kernel as any)?.chatProgram;
    if (chatProgram && typeof chatProgram.getQueueStatus === 'function') {
      const status = chatProgram.getQueueStatus();
      isStreaming = status.hasActive === true;
      // 如果流式处理中，工具执行状态可能持续，但 UI 无法精确恢复，先重置
      toolExecuting = false;
      toolExecutingName = '';
    }

    if (chatChannel) {
      cleanups.push(
        // 流式生命周期
        chatChannel.on(KernelEvents.CHAT.STREAM_START, () => {
          isStreaming = true;
        }),

        chatChannel.on(KernelEvents.CHAT.STREAM_COMPLETE, (data: any) => {
          isStreaming = false;
          // 清除该消息的流式覆盖
          if (data?.messageId) {
            const newMap = { ...streamingMap };
            delete newMap[data.messageId];
            streamingMap = newMap;
          }
          refreshMessages();
          if (messagesContainer) autoScrollToBottom(messagesContainer, true);
        }),

        chatChannel.on(KernelEvents.CHAT.STREAM_STOP, () => {
          isStreaming = false;
          refreshMessages();
        }),

        chatChannel.on(KernelEvents.CHAT.STREAM_ERROR, (data: any) => {
          isStreaming = false;
          toast.error(data?.message || '发送失败');
          refreshMessages();
        }),

        // 消息变更 → 全量刷新
        chatChannel.on(KernelEvents.CHAT.MESSAGE_ADDED, () => {
          refreshMessages();
        }),

        chatChannel.on(KernelEvents.CHAT.MESSAGE_DELETED, () => {
          refreshMessages();
        }),

        chatChannel.on(KernelEvents.CHAT.CURRENT_SESSION_CHANGED, () => {
          streamingMap = {};
          isEditingTitle = false;
          refreshMessages();
        }),

        // 会话更新（标题等）
        chatChannel.on(KernelEvents.CHAT.SESSION_UPDATED, () => {
          refreshMessages();
        }),

        // 流式分片追加
        chatChannel.on(KernelEvents.CHAT.STREAM_CHUNK_APPEND, (data: any) => {
          const { messageId, content, reasoning_content } = data;
          if (!messageId) return;

          const entry = streamingMap[messageId] || { content: '', reasoning: '' };
          if (content) entry.content += content;
          if (reasoning_content) entry.reasoning += reasoning_content;
          streamingMap = { ...streamingMap, [messageId]: entry };
        }),

        // 消息更新（全文替换）— 创建新对象确保 Svelte 5 响应式追踪
        chatChannel.on(KernelEvents.CHAT.MESSAGE_UPDATED, (data: any) => {
          if (!data?.message) return;
          const idx = messages.findIndex((m) => m.id === data.message.id);
          if (idx >= 0) {
            messages = [...messages.slice(0, idx), { ...data.message }, ...messages.slice(idx + 1)];
          }
        }),

        // 工具事件（ToolExecutor 通过 chatChannel 发出 TOOL.* 事件，因此也在此频道监听）
        chatChannel.on(KernelEvents.TOOL.EXECUTING, (data: any) => {
          toolExecuting = true;
          toolExecutingName = data?.toolName || '工具';
        }),

        chatChannel.on(KernelEvents.TOOL.COMPLETED, (data: any) => {
          toolExecuting = false;
          toolExecutingName = '';
        }),
      );
    }

    // 键盘导航
    document.addEventListener('keydown', handleKeydown);

    // 初始化
    refreshMessages();
    refreshTools();
  });

  // ==================== 键盘导航：Ctrl+↑/↓ 在用户消息间跳转 ====================
  function scrollToUserMessage(direction: -1 | 1) {
    const list = document.getElementById('message-list');
    if (!list) return;
    const userMessages = Array.from(list.querySelectorAll('.message-bubble.message-user')) as HTMLElement[];
    if (userMessages.length === 0) return;

    const listRect = list.getBoundingClientRect();
    const targetTop = listRect.top + 10;
    let currentIndex = -1;
    for (let i = 0; i < userMessages.length; i++) {
      const rect = userMessages[i].getBoundingClientRect();
      if (rect.top >= targetTop - 50) { currentIndex = i; break; }
    }
    let nextIndex: number;
    if (direction === -1) {
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === -1 ? 0 : (currentIndex >= userMessages.length - 1 ? userMessages.length - 1 : currentIndex + 1);
    }
    userMessages[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      scrollToUserMessage(e.key === 'ArrowUp' ? -1 : 1);
    }
  }

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
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

  // ==================== 折叠状态 ====================
  // 思考过程默认折叠
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chat-page">
  <!-- ==================== 头部 ==================== -->
  <header class="chat-header">
    {#if isEditingTitle}
      <input
        class="chat-title-input"
        bind:this={titleInput}
        bind:value={editingTitle}
        onkeydown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); saveEditTitle(); }
          if (e.key === 'Escape') { e.preventDefault(); cancelEditTitle(); }
        }}
        onblur={saveEditTitle}
      />
    {:else}
      <h2 class="chat-title" title="点击编辑标题" onclick={startEditTitle}>{session?.title || '新对话'}</h2>
    {/if}
    <div class="chat-header-actions">
      {#if showThinkingControl}
        <EffortControl
          {reasoningEffort}
          onchange={handleReasoningEffortChange}
        />
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

        {#if isTool}
          <ToolMessageCard
            {msg}
            collapsed={collapsedMessages[msg.id] || false}
            {toggleMsg}
            {confirmDelete}
            {findToolNameByCallId}
          />
        {:else}
          <MessageBubble
            {msg}
            {isUser}
            {isAssistant}
            {displayContent}
            {displayReasoning}
            {hasReasoning}
            {hasContent}
            {hasToolCalls}
            {expandedReasoning}
            {collapsedToolCalls}
            {toggleReasoning}
            {toggleToolCall}
            {confirmDelete}
            {findToolResult}
            {findToolNameByCallId}
            {messages}
          />
        {/if}
      {/each}
    {/if}

    <!-- 流式加载指示器 -->
    {#if isStreaming}
      <StreamingIndicator
        {toolExecuting}
        {toolExecutingName}
      />
    {/if}
  </div>

  <!-- ==================== 输入区域 ==================== -->
  <footer class="chat-input-area">
    <!-- 工具面板 -->
    {#if toolPanelVisible}
      <ToolPanel
        {allTools}
        {toolEnabledMap}
        {toggleTool}
      />
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
  <Dialog
    open={deleteTargetId !== null}
    title="删除消息"
    confirmLabel="删除"
    danger={true}
    onconfirm={handleDeleteMessage}
    onclose={() => (deleteTargetId = null)}
  >
    确定要删除这条消息吗？
  </Dialog>
</div>
