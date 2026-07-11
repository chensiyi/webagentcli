<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { waitKernelReady } from 'sidepanel/utils/kernel-ready.js';
  import { KernelEvents, KernelChannels } from 'kernel/Events.js';
  import type { KernelAPIContract } from 'sidepanel/api-contract.js';
  import { getShellCache } from 'sidepanel/cache/shell-cache.js';
  import { extractText, renderMarkdown, extractMediaBlocks } from 'sidepanel/utils/text.js';
  import { autoScrollToBottom } from 'sidepanel/utils/dom.js';
  import { useToast } from 'sidepanel/components/overlays/toast-store.svelte';
  import { Log } from 'kernel/services/Log.js';
  import Button from 'sidepanel/components/atoms/Button.svelte';
  import Dialog from 'sidepanel/components/overlays/Dialog.svelte';
  import EmptyState from 'sidepanel/components/layout/EmptyState.svelte';

  // Sub-components
  import EffortControl from './chat/EffortControl.svelte';
  import MessageBubble from './chat/MessageBubble.svelte';
  import StreamingIndicator from './chat/StreamingIndicator.svelte';
  import ToolMessageCard from './chat/ToolMessageCard.svelte';
  import ToolPanel from './chat/ToolPanel.svelte';

  // 通过 IPC 通道与 Kernel 通信，不直接访问 kernel 模块
  const ipc: any = getContext('ipc');
  const sessionChannel = ipc?.getOrCreateChannel?.(KernelChannels.SESSION) || ipc;
  const toolChannel = ipc?.getOrCreateChannel?.(KernelChannels.TOOL) || ipc;
  const navigate = getContext('navigate');
  const api = getContext('api') as KernelAPIContract;
  const cache = getShellCache(api);
  const toast = useToast();

  // ==================== 响应式状态 ====================
  let messages = $state<any[]>([]);
  let session = $state<any>(null);
  let isStreaming = $state(false);
  let inputText = $state('');

  // ---- 附件（图片/音频/视频/文件）待发送队列 ----
  let pendingAttachments = $state<any[]>([]);
  let fileInputEl: HTMLInputElement | null = $state(null);
  let isDragging = $state(false);

  // ---- 当前模型能力（驱动上传按钮联动，避免给不支持多模态的模型发送媒体）----
  // known=false 表示设置里没有模态信息，此时一律放行，避免误伤本支持多模态的模型。
  let modelCaps = $state<{ known: boolean; image: boolean; audio: boolean; video: boolean }>({
    known: false, image: true, audio: true, video: true,
  });
  const canAttachMedia = $derived(!modelCaps.known || modelCaps.image || modelCaps.audio || modelCaps.video);
  const attachTitle = $derived(
    !canAttachMedia ? '当前模型不支持图片/音频/视频输入' : '添加附件',
  );

  function mediaKindFromMime(mime: string): 'image' | 'audio' | 'video' | 'file' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  }

  /** 给 Promise 加一个超时兜底，避免任何异常下附件芯片永远停在"处理中"。 */
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s），请检查网络或资源服务器`)), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /** 从设置读取当前选中模型的输入模态，驱动上传按钮的能力联动。
   *  未知（无模态信息）时一律放行，避免误伤本支持多模态的模型。 */
  function refreshModelCaps() {
    cache.getSettings().then((raw: any) => {
      const models: any[] = raw?.models || [];
      const modelId: string = raw?.model;
      if (!modelId) { modelCaps = { known: false, image: true, audio: true, video: true }; return; }
      const model = models.find((m: any) => m && (m.id === modelId || m.name === modelId));
      if (!model) { modelCaps = { known: false, image: true, audio: true, video: true }; return; }
      const mods: string[] = model.input_modalities || [];
      if (!mods.length) { modelCaps = { known: false, image: true, audio: true, video: true }; return; }
      const lower = mods.map((x) => String(x).toLowerCase());
      modelCaps = {
        known: true,
        image: lower.includes('image'),
        audio: lower.includes('audio'),
        video: lower.includes('video'),
      };
    }).catch(() => { modelCaps = { known: false, image: true, audio: true, video: true }; });
  }

  /** 该媒体类型是否被当前模型支持（未知能力时放行）。 */
  function kindSupported(kind: string): boolean {
    if (!modelCaps.known) return true;
    if (kind === 'image') return modelCaps.image;
    if (kind === 'audio') return modelCaps.audio;
    if (kind === 'video') return modelCaps.video;
    return true; // 文件类（pdf/文本）按内容处理，默认放行
  }

  /** 按 id 局部更新某个附件（Svelte 5 关键：必须用新对象替换 + 重赋值数组，
   *  直接改原始对象不会触发代理的 set 通知，UI 不刷新 —— 这正是之前芯片永远卡在⏳的根因）。 */
  function patchAttachment(id: string, patch: Record<string, any>) {
    pendingAttachments = pendingAttachments.map((a) => (a.id === id ? { ...a, ...patch } : a));
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files || []);
    if (!list.length) return;
    for (const file of list) {
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const kind = mediaKindFromMime(file.type || '');
      // 能力已知且不支持该类型时直接拦截（粘贴/拖拽/选择均生效），避免塞进待发送队列
      if (modelCaps.known && !kindSupported(kind)) {
        toast.error(`当前模型不支持 ${kind} 类型输入，已忽略该文件`);
        continue;
      }
      const att = {
        id,
        file,
        kind,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: '',
        mediaId: null,
        error: false,
        uploading: true,
      };
      pendingAttachments = [...pendingAttachments, att];
      Log.info('ChatPage', 'addFiles: start upload', { filename: att.filename, mimeType: att.mimeType });
      try {
        const dataUrl = await readFileAsDataUrl(file);
        // 用 patchAttachment 更新：确保 Svelte 代理收到变更通知（缩略图即时显示）
        patchAttachment(id, { dataUrl });
        Log.info('ChatPage', 'addFiles: dataUrl read, calling api.media.put');
        const res = await withTimeout(
          api.media.put({ dataUrl, mimeType: att.mimeType, filename: att.filename }),
          30000,
          '附件上传',
        );
        Log.info('ChatPage', 'addFiles: api.media.put resolved', { res });
        patchAttachment(id, { mediaId: res?.id, uploading: false });
        Log.info('ChatPage', 'addFiles: done', { mediaId: res?.id });
      } catch (e) {
        Log.error('ChatPage', 'upload attachment failed', e);
        patchAttachment(id, { uploading: false, error: true });
        toast.error('附件上传失败：' + (file.name || ''));
      }
    }
  }

  function removeAttachment(id: string) {
    pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
  }

  async function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      await addFiles(files);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  let toolPanelVisible = $state(false);
  let allTools = $state<any[]>([]);

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
    // 仅缓存全局工具列表（含各工具 global enabled）。会话级开关走 session.toolEnabled，
    // 由 ToolPanel 合并全局与会话两层显示，不在此处合成。
    if (data?.tools) {
      allTools = [...data.tools];
    }
  }

  // ==================== 消息刷新 ====================

  /** 失效当前会话缓存并强制重拉（切会话 / 错误恢复等需要最新全量时调用）。 */
  function refreshMessages() {
    cache.invalidateSession();
    cache.getCurrentSession(true).then(applyCurrentSession).catch((e) => Log.error('ChatPage', 'load session failed', e));
  }

  function refreshTools(force = false) {
    // 页面（重）加载入口传 force=true：全量获取并把结果写回缓存；页内再次打开工具面板不传 force，用缓存（必要时 invalidate 重拉）。
    // cache.getTools() 已透传 facade 形态 { tools }，与 applyToolList 契约天然对齐，直接消费。
    cache.getTools(force).then(applyToolList).catch((e) => Log.error('ChatPage', 'load tools failed', e));
  }

  // ==================== 业务逻辑 ====================

  function handleSend() {
    const text = inputText.trim();
    const attachments = pendingAttachments.filter((a) => a.mediaId && !a.error);
    if (!text && attachments.length === 0) return;

    // 发送前再校验一次模型能力：拦截不支持的媒体类型（粘贴/拖拽被 addFiles 拦过，此处为兜底）
    const blocked = attachments.filter((a) => !kindSupported(a.kind));
    if (blocked.length) {
      toast.error(`当前模型不支持 ${blocked.map((b: any) => b.kind).join('、')} 类型输入，请移除后再发送`);
      return;
    }

    // 组装 content：文本块 + 媒体块（mediaId 引用，发送时由内核经 mediaStore 解析）
    const blocks: any[] = [];
    if (text) blocks.push({ type: 'text', text });
    for (const a of attachments) {
      blocks.push({
        type: 'media',
        kind: a.kind,
        mediaId: a.mediaId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      });
    }

    inputText = '';
    pendingAttachments = [];
    const content = blocks.length === 1 && blocks[0].type === 'text' ? text : blocks;
    api.session.send({
      content,
      reasoningEffort: session?.reasoningEffort || reasoningEffort,
    }).catch((e) => toast.error('发送失败：' + ((e as Error)?.message || String(e))));
  }

  function handleStop() {
    api.session.stop().catch((e) => {
      Log.error('ChatPage', 'stop failed', e);
      toast.error('停止生成失败：' + ((e as Error)?.message || String(e)));
    });
  }

  function handleNewChat() {
    api.session.create()
      .then((data) => { applyCurrentSession(data); streamingMap = {}; })
      .catch((e) => {
        Log.error('ChatPage', 'new chat failed', e);
        toast.error('新建对话失败：' + ((e as Error)?.message || String(e)));
      });
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
    api.session.deleteMessage({ messageId: id, sessionId: sid })
      .catch((e) => {
        Log.error('ChatPage', 'delete message failed', e);
        toast.error('删除消息失败：' + ((e as Error)?.message || String(e)));
      });
    deleteTargetId = null;
  }

  function handleReasoningEffortChange(val: string) {
    reasoningEffort = val; // 乐观即时反馈
    if (session) {
      api.session.update({ sessionId: session.id, data: { reasoningEffort: val } })
        .then((view: any) => {
          if (view) {
            // 根据写操作返回的结果差量更新缓存与 UI（零额外 RPC）
            cache.patchCurrentSession({ session: view.session, reasoningEffort: view.reasoningEffort });
            session = view.session;
            reasoningEffort = view.reasoningEffort;
          }
        })
        .catch((e) => {
          Log.error('ChatPage', 'update session failed', e);
          toast.error('更新思考强度失败：' + ((e as Error)?.message || String(e)));
        });
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
      session.title = newTitle; // 乐观即时反馈
      api.session.update({ sessionId: session.id, data: { title: newTitle } })
        .then((view: any) => {
          if (view) {
            // 根据写操作返回的结果差量更新缓存与 UI（零额外 RPC）
            cache.patchCurrentSession({ session: view.session });
            session = view.session;
          }
        })
        .catch((e) => {
          Log.error('ChatPage', 'update title failed', e);
          toast.error('更新标题失败：' + ((e as Error)?.message || String(e)));
        });
    }
  }

  function cancelEditTitle() {
    isEditingTitle = false;
  }

  /**
   * 会话级工具开关（与全局 tool.toggle 不是同一渠道）。
   * 仅修改本会话的 toolEnabled 覆盖表，不动全局——全局是天花板，全局已禁用无法在此开启。
   * 写穿透：乐观更新本地 session 视图 → api.session.update 写主库 → 用返回权威视图刷新缓存与本地状态。
   */
  async function toggleSessionTool(tool: any) {
    const sid = session?.id;
    if (!sid || !tool?.name) return;
    // 全局已禁用：会话层天花板之下，无法开启
    if (!tool.enabled) {
      toast.warning(`工具「${tool.name}」已被全局禁用，无法在本会话启用`);
      return;
    }
    const base: Record<string, boolean> = (session?.toolEnabled as Record<string, boolean>) || {};
    const effective = base[tool.name] !== false; // 全局开，故只看本会话是否显式 false
    const next = !effective;
    const newMap: Record<string, boolean> = { ...base, [tool.name]: next };
    // 乐观即时反馈：直接刷新本地会话视图，ToolPanel 依赖 session.toolEnabled 重渲染
    session = { ...session, toolEnabled: newMap };
    api.session.update({ sessionId: sid, data: { toolEnabled: newMap } })
      .then((view: any) => {
        if (view?.session) {
          // 写穿透：用返回权威视图更新缓存与本地状态（零额外 RPC）
          cache.patchCurrentSession({ session: view.session });
          session = view.session;
        }
      })
      .catch((e) => {
        Log.error('ChatPage', 'toggle session tool failed', e);
        toast.error('切换会话工具失败：' + ((e as Error)?.message || String(e)));
      });
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
    if (!sessionChannel) return;

    if (sessionChannel) {
      cleanups.push(
        // 流式生命周期
        sessionChannel.on(KernelEvents.SESSION.STREAM_START, () => {
          isStreaming = true;
        }),

        sessionChannel.on(KernelEvents.SESSION.STREAM_COMPLETE, (data: any) => {
          isStreaming = false;
          if (data?.messageId) {
            const newMap = { ...streamingMap };
            delete newMap[data.messageId];
            streamingMap = newMap;
          }
          cache.invalidateSession();
          if (messagesContainer) autoScrollToBottom(messagesContainer, true);
        }),

        sessionChannel.on(KernelEvents.SESSION.STREAM_STOP, () => {
          isStreaming = false;
          cache.invalidateSession();
        }),

        sessionChannel.on(KernelEvents.SESSION.STREAM_ERROR, (data: any) => {
          isStreaming = false;
          toast.error(data?.message || '发送失败');
          refreshMessages();
        }),

        // 媒体解析失败等非致命警告（如图发了但模型读不到），合并提示不打断流式
        sessionChannel.on(KernelEvents.SESSION.WARNING, (data: any) => {
          const warnings: string[] = data?.warnings || [];
          if (warnings.length) toast.warning(warnings.join('；'));
        }),

        // 消息新增：根据事件携带的结果差量 upsert 进列表（零 RPC），结果立即显示
        sessionChannel.on(KernelEvents.SESSION.MESSAGE_ADDED, (data: any) => {
          if (data?.message) {
            const msg = data.message;
            const idx = messages.findIndex((m: any) => m.id === msg.id);
            if (idx >= 0) {
              messages = [...messages.slice(0, idx), { ...msg }, ...messages.slice(idx + 1)];
            } else {
              messages = [...messages, { ...msg }];
            }
          }
          // 标脏缓存，保持与内核最终一致（不触发重拉，UI 已用本地列表刷新）
          cache.invalidateSession();
        }),

        sessionChannel.on(KernelEvents.SESSION.MESSAGE_DELETED, () => {
          refreshMessages();
        }),

        sessionChannel.on(KernelEvents.SESSION.CURRENT_SESSION_CHANGED, () => {
          streamingMap = {};
          isEditingTitle = false;
          refreshMessages();
        }),

        // 会话更新（标题等）：根据事件携带的结果差量 patch 元数据，零 RPC，不碰流式累积的 messages
        sessionChannel.on(KernelEvents.SESSION.SESSION_UPDATED, (data: any) => {
          const idx = data?.session;
          if (idx && session && idx.id === session.id) {
            const merged = { ...session, ...idx };
            cache.patchCurrentSession({ session: merged });
            session = merged;
            // 若会话被清空（如 clearMessages），同步清空本地消息列表
            if (typeof idx.messageCount === 'number' && idx.messageCount === 0 && messages.length > 0) {
              messages = [];
            }
          }
        }),

        // 流式分片追加
        sessionChannel.on(KernelEvents.SESSION.STREAM_CHUNK_APPEND, (data: any) => {
          const { messageId, content, reasoning_content } = data;
          if (!messageId) return;

          const entry = streamingMap[messageId] || { content: '', reasoning: '' };
          if (content) entry.content += content;
          if (reasoning_content) entry.reasoning += reasoning_content;
          streamingMap = { ...streamingMap, [messageId]: entry };
        }),

        // 消息更新（全文替换）
        sessionChannel.on(KernelEvents.SESSION.MESSAGE_UPDATED, (data: any) => {
          if (!data?.message) return;
          const idx = messages.findIndex((m) => m.id === data.message.id);
          if (idx >= 0) {
            messages = [...messages.slice(0, idx), { ...data.message }, ...messages.slice(idx + 1)];
          }
        }),

        // 工具事件
        sessionChannel.on(KernelEvents.TOOL.EXECUTING, (data: any) => {
          toolExecuting = true;
          toolExecutingName = data?.toolName || '工具';
        }),

        sessionChannel.on(KernelEvents.TOOL.COMPLETED, (data: any) => {
          toolExecuting = false;
          toolExecutingName = '';
        })
      );
    }

    // 模型能力联动：订阅「单例缓存自身的 settings 变更」，而非直接耦合 SettingsPage 的 IPC 消息。
    // 缓存写穿透（saveSettings）广播全局最新值、差量合并（patchSettings）后都会通知，
    // 这里只消费权威缓存（refreshModelCaps 读 cache.getSettings 即最新值，零回源 RPC）。
    cleanups.push(cache.subscribe('settings', () => refreshModelCaps()));

    // 键盘导航
    document.addEventListener('keydown', handleKeydown);

    // 内核就绪后再请求当前会话和工具列表（等待 bootComplete 消息，时序门控）
    waitKernelReady(ipc).then(() => {
      refreshMessages();
      refreshTools(true); // 页面（重）加载：强制全量获取并刷新缓存
      refreshModelCaps(); // 读取当前模型能力，联动上传按钮
    });
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
        {@const mediaBlocks = extractMediaBlocks(msg.content)}

        {#if isTool}
          <ToolMessageCard {msg} collapsed={collapsedMessages[msg.id] || false} {toggleMsg} {confirmDelete} {findToolNameByCallId} />
        {:else}
          <MessageBubble
            {msg} {isUser} {isAssistant} {displayContent} {displayReasoning}
            {hasReasoning} {hasContent} {hasToolCalls} {mediaBlocks}
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
  <footer class="chat-input-area" class:chat-input-dragging={isDragging}
    ondragover={handleDragOver} ondrop={handleDrop} ondragleave={handleDragLeave}>
    {#if toolPanelVisible}
      <ToolPanel {allTools} sessionToolEnabled={session?.toolEnabled || null} toggleTool={toggleSessionTool} />
    {/if}

    <!-- 附件预览区 -->
    {#if pendingAttachments.length > 0}
      <div class="attachment-tray">
        {#each pendingAttachments as att (att.id)}
          <div class="attachment-chip" class:att-error={att.error}>
            {#if att.kind === 'image' && att.dataUrl}
              <img class="att-thumb" src={att.dataUrl} alt={att.filename} />
            {:else}
              <span class="att-icon">
                {att.kind === 'audio' ? '🎵' : att.kind === 'video' ? '🎬' : '📄'}
              </span>
            {/if}
            <span class="att-name" title={att.filename}>{att.filename}</span>
            {#if att.uploading}
              <span class="att-state">⏳</span>
            {:else if att.error}
              <span class="att-state att-fail">⚠</span>
            {:else}
              <span class="att-state att-ready" title="已就绪，可发送">✓</span>
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="att-remove" onclick={() => removeAttachment(att.id)} title="移除">×</span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="chat-input-row">
      <Button variant="secondary" size="md" onclick={() => { toolPanelVisible = !toolPanelVisible; if (toolPanelVisible) refreshTools(); }}>
        🔧 工具
      </Button>

      <button class="attach-btn" title={attachTitle} disabled={isStreaming || !canAttachMedia}
        onclick={() => fileInputEl?.click()}>
        📎
      </button>
      <input
        bind:this={fileInputEl}
        type="file"
        multiple
        accept="image/*,audio/*,video/*,application/pdf,.txt,.md,.json,.csv,.log"
        style="display:none"
        onchange={(e) => {
          const el = e.target as HTMLInputElement;
          if (el.files?.length) addFiles(el.files);
          el.value = '';
        }}
      />

      <textarea
        class="chat-textarea"
        bind:value={inputText}
        placeholder="输入消息 (Ctrl+Enter 发送)，可粘贴/拖拽图片与文件"
        rows="1" disabled={isStreaming}
        onpaste={handlePaste}
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
        <Button variant="primary" size="md" onclick={handleSend}
          disabled={!inputText.trim() && pendingAttachments.filter((a: any) => a.mediaId && !a.error).length === 0}>
          发送
        </Button>
      {/if}
    </div>
  </footer>

  <Dialog open={deleteTargetId !== null} title="删除消息" confirmLabel="删除" danger={true}
    onconfirm={handleDeleteMessage} onclose={() => (deleteTargetId = null)}>
    确定要删除这条消息吗？
  </Dialog>
</div>