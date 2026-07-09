<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { KernelEvents } from 'kernel/Events.js';
  import type { KernelAPIContract } from '../api-contract.js';
  import { extractText, renderMarkdown } from '../utils/text.js';
  import { autoScrollToBottom } from '../utils/dom.js';
  import { useToast } from '../components/overlays/toast-store.svelte';
  import { Log } from 'kernel/services/Log.js';
  import Button from '../components/atoms/Button.svelte';
  import Dialog from '../components/overlays/Dialog.svelte';
  import EmptyState from '../components/layout/EmptyState.svelte';

  // Sub-components
  import EffortControl from './chat/EffortControl.svelte';
  import MessageBubble from './chat/MessageBubble.svelte';
  import StreamingIndicator from './chat/StreamingIndicator.svelte';
  import ToolMessageCard from './chat/ToolMessageCard.svelte';
  import ToolPanel from './chat/ToolPanel.svelte';

  // 通过 IPC 通道与 Kernel 通信，不直接访问 kernel 模块
  const ipc: any = getContext('ipc');
  const chatChannel = ipc?.getOrCreateChannel?.('chat') || ipc;
  const toolChannel = ipc?.getOrCreateChannel?.('tool') || ipc;
  const navigate = getContext('navigate');
  const api = getContext('api') as KernelAPIContract;
  const toast = useToast();

  // ==================== 响应式状态 ====================
  let messages = $state<any[]>([]);
  let session = $state<any>(null);
  let isStreaming = $state(false);
  let inputText = $state('');
  let toolPanelVisible = $state(false);
  let allTools = $state<any[]>([]);
  let toolEnabledMap = $state<Record<string, boolean>>({});

  // 流式内容累积 Map: messageId → { content, reasoning }
  let streamingMap = $state<Record<string, { content: string; reasoning: string }>>({});

  // 工具执行进度
  let toolExecuting = $state(false);
  let toolExecutingName = $state('');

  // 推理强度
  let reasoningEffort = $state('medium');
  // 思考强度是会话级覆盖 + 全局默认配置，空对话也应展示默认配置供用户发送前预设
  let showThinkingControl = $state(true);

  // 删除确认弹窗
  let deleteTargetId = $state<string | null>(null);

  // 标题编辑
  let isEditingTitle = $state(false);
  let editingTitle = $state('');
  let titleInput: HTMLInputElement | undefined;

  // ==================== 工具函数 ====================

  function findToolResult(toolCallId: string): any {
    if (!toolCallId) return null;
    return messages.find((m: any) => m?.role === 'tool' && m?.toolCallId === toolCallId) || null;
  }

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

  // RPC 响应回调（数据经 rpc.call Promise 回传，不再监听魔法事件名）
  function applyCurrentSession(data: any) {
    if (!data) return;
    session = data.session || null;
    messages = data.messages ? data.messages.filter((m: any) => m != null).map((m: any) => ({ ...m })) : [];
    reasoningEffort = data.reasoningEffort || 'medium';
    showThinkingControl = true;
  }

  function applyToolList(data: any) {
    if (data?.tools) {
      allTools = [...data.tools];
      const map: Record<string, boolean> = {};
      for (const t of data.tools) {
        if (t.name) map[t.name] = t.enabled;
      }
      toolEnabledMap = map;
    }
  }

  // ==================== 消息刷新 ====================

  function refreshMessages() {
    api.session.getCurrent().then(applyCurrentSession).catch((e) => Log.error('ChatPage', 'load session failed', e));
  }

  function refreshTools() {
    api.tools.list().then(applyToolList).catch((e) => Log.error('ChatPage', 'load tools failed', e));
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
    api.session.create()
      .then((data) => { applyCurrentSession(data); streamingMap = {}; })
      .catch((e) => Log.error('ChatPage', 'new chat failed', e));
  }

  function confirmDelete(id: string) {
    deleteTargetId = id;
  }

  function handleDeleteMessage() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    const sid = session?.id;
    if (!sid) {
      deleteTargetId = null;
      toast.error('会话不存在');
      return;
    }
    api.session.deleteMessage({ messageId: id, sessionId: sid }).catch((e) => Log.error('ChatPage', 'delete message failed', e));
    deleteTargetId = null;
  }

  function handleReasoningEffortChange(val: string) {
    reasoningEffort = val;
    if (session) {
      api.session.update({ sessionId: session.id, data: { reasoningEffort: val } })
        .catch((e) => Log.error('ChatPage', 'update session failed', e));
    }
  }

  // ==================== 标题编辑 ====================
  function startEditTitle() {
    if (!session) return;
    editingTitle = session.title || '新对话';
    isEditingTitle = true;
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
      api.session.update({ sessionId: session.id, data: { title: newTitle } })
        .catch((e) => Log.error('ChatPage', 'update title failed', e));
      session.title = newTitle;
    }
  }

  function cancelEditTitle() {
    isEditingTitle = false;
  }

  function toggleTool(tool: any) {
    const name = tool.name;
    if (!name) return;
    api.tools.toggle({ name, enabled: !tool.enabled })
      .catch((e) => Log.error('ChatPage', 'toggle tool failed', e));
    toolEnabledMap = { ...toolEnabledMap, [name]: !tool.enabled };
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

  // ==================== 事件监听器引用 ====================
  let cleanups: (() => void)[] = [];

  // ==================== IPC 事件监听 ====================
  onMount(() => {
    if (!chatChannel) return;

    if (chatChannel) {
      cleanups.push(
        // 流式生命周期
        chatChannel.on(KernelEvents.CHAT.STREAM_START, () => {
          isStreaming = true;
        }),

        chatChannel.on(KernelEvents.CHAT.STREAM_COMPLETE, (data: any) => {
          isStreaming = false;
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

        // 消息更新（全文替换）
        chatChannel.on(KernelEvents.CHAT.MESSAGE_UPDATED, (data: any) => {
          if (!data?.message) return;
          const idx = messages.findIndex((m) => m.id === data.message.id);
          if (idx >= 0) {
            messages = [...messages.slice(0, idx), { ...data.message }, ...messages.slice(idx + 1)];
          }
        }),

        // 工具事件
        chatChannel.on(KernelEvents.TOOL.EXECUTING, (data: any) => {
          toolExecuting = true;
          toolExecutingName = data?.toolName || '工具';
        }),

        chatChannel.on(KernelEvents.TOOL.COMPLETED, (data: any) => {
          toolExecuting = false;
          toolExecutingName = '';
        })
      );
    }

    // 键盘导航
    document.addEventListener('keydown', handleKeydown);

    // 初始化：请求当前会话和工具列表
    refreshMessages();
    refreshTools();
  });

  // ==================== 键盘导航 ====================
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
    // 退订 onMount 中注册的全部 IPC 监听（否则随 {#key activePage} 重挂载叠加幽灵监听器）
    for (const off of cleanups) off();
    cleanups = [];
    document.removeEventListener('keydown', handleKeydown);
  });

  // ==================== 获取消息显示内容 ====================
  function getMessageDisplayContent(msg: any): string {
    const streaming = streamingMap[msg.id];
    if (streaming && streaming.content) return streaming.content;
    return extractText(msg.content);
  }

  function getMessageDisplayReasoning(msg: any): string | null {
    const streaming = streamingMap[msg.id];
    if (streaming && streaming.reasoning) return streaming.reasoning;
    if (msg.reasoning_content) return extractText(msg.reasoning_content);
    return null;
  }

  // ==================== 折叠状态 ====================
  let collapsedMessages = $state<Record<string, boolean>>({});
  let collapsedToolCalls = $state<Record<string, boolean>>({});
  let expandedReasoning = $state<Record<string, boolean>>({});

  function toggleMsg(id: string) { collapsedMessages[id] = !collapsedMessages[id]; }
  function toggleToolCall(id: string) { collapsedToolCalls[id] = !collapsedToolCalls[id]; }
  function toggleReasoning(id: string) { expandedReasoning[id] = !expandedReasoning[id]; }
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
        <EffortControl {reasoningEffort} onchange={handleReasoningEffortChange} />
      {/if}
      <Button variant="secondary" size="sm" onclick={handleNewChat}>
        + 新对话
      </Button>
    </div>
  </header>

  <!-- ==================== 消息列表 ==================== -->
  <div class="chat-messages" bind:this={messagesContainer} id="message-list">
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
          <ToolMessageCard {msg} collapsed={collapsedMessages[msg.id] || false} {toggleMsg} {confirmDelete} {findToolNameByCallId} />
        {:else}
          <MessageBubble
            {msg} {isUser} {isAssistant} {displayContent} {displayReasoning}
            {hasReasoning} {hasContent} {hasToolCalls}
            {expandedReasoning} {collapsedToolCalls}
            {toggleReasoning} {toggleToolCall} {confirmDelete}
            {findToolResult} {findToolNameByCallId} {messages}
          />
        {/if}
      {/each}
    {/if}

    {#if isStreaming}
      <StreamingIndicator {toolExecuting} {toolExecutingName} />
    {/if}
  </div>

  <!-- ==================== 输入区域 ==================== -->
  <footer class="chat-input-area">
    {#if toolPanelVisible}
      <ToolPanel {allTools} {toolEnabledMap} {toggleTool} />
    {/if}

    <div class="chat-input-row">
      <Button variant="secondary" size="md" onclick={() => { toolPanelVisible = !toolPanelVisible; if (toolPanelVisible) refreshTools(); }}>
        🔧 工具
      </Button>

      <textarea
        class="chat-textarea"
        bind:value={inputText}
        placeholder="输入消息 (Ctrl+Enter 发送)"
        rows="1" disabled={isStreaming}
        oninput={(e) => {
          const el = e.target as HTMLTextAreaElement;
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 150) + 'px';
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); }
        }}
      ></textarea>

      {#if isStreaming}
        <Button variant="danger" size="md" onclick={handleStop}>⏹ 停止</Button>
      {:else}
        <Button variant="primary" size="md" onclick={handleSend} disabled={!inputText.trim()}>发送</Button>
      {/if}
    </div>
  </footer>

  <Dialog open={deleteTargetId !== null} title="删除消息" confirmLabel="删除" danger={true}
    onconfirm={handleDeleteMessage} onclose={() => (deleteTargetId = null)}>
    确定要删除这条消息吗？
  </Dialog>
</div>