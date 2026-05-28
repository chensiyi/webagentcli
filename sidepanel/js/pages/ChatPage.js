/**
 * ChatPage - 聊天主页面
 * 职责：
 * 1. 负责聊天界面的完整渲染
 * 2. 响应 ChatController 的状态变更（updateUIState）
 * 3. 处理用户输入与会话切换的 UI 逻辑
 */

window.Pages = window.Pages || {};

window.Pages.chat = function(container, serviceCenter) {
  const { create, clear } = window.DOM;
  const eventBus = serviceCenter.getEventBus();
  const sessionManager = serviceCenter.getSessionManager();
  const chatController = serviceCenter.getChatController();

  // ==================== 状态管理 ====================
  
  /**
   * 更新 UI 状态（由 EventHandler 调用）
   * 响应 ChatController 的状态机
   */
  window.Pages.chat.updateUIState = function(data) {
    const { state, hasActive } = data;
    console.log('[ChatPage] updateUIState:', state);

    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const input = document.getElementById('message-input');
    const statusText = document.getElementById('chat-status-text');

    // 1. 按钮状态原子切换
    if (sendBtn) sendBtn.style.display = hasActive ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = hasActive ? 'inline-block' : 'none';
    
    // 2. 输入框锁定策略：仅在 WAITING (等待首字节) 时锁定
    // 生成中 (THINKING/GENERATING) 允许输入，提升交互效率
    if (input) {
      const shouldDisable = (state === window.Events.CHAT.STATE.WAITING);
      if (input.disabled !== shouldDisable) {
        input.disabled = shouldDisable;
        if (!shouldDisable) input.focus();
      }
    }

    // 3. 状态指示文本更新
    if (statusText) {
      const statusMap = {
        [window.Events.CHAT.STATE.WAITING]: '⏳ 等待响应...',
        [window.Events.CHAT.STATE.THINKING]: '💭 思考中...',
        [window.Events.CHAT.STATE.GENERATING]: '✍️ 正在生成...',
        [window.Events.CHAT.STATE.FAILED]: '❌ 请求失败',
        [window.Events.CHAT.STATE.STOPPED]: '🛑 已停止'
      };
      const text = statusMap[state] || '';
      statusText.textContent = text;
      statusText.style.display = text ? 'block' : 'none';
      
      // 异常状态短暂停留后消失
      if (state === window.Events.CHAT.STATE.FAILED || state === window.Events.CHAT.STATE.STOPPED) {
        setTimeout(() => { if (statusText) statusText.style.display = 'none'; }, 2000);
      }
    }
  };

  // ==================== 事件监听 ====================
  // 消息增删或会话切换时触发全量渲染（为流式分片更新提供底层 DOM 结构）
  eventBus.on(window.Events.CHAT.MESSAGE_ADDED, () => render());
  eventBus.on(window.Events.CHAT.MESSAGE_DELETED, () => render());
  eventBus.on(window.Events.CHAT.CURRENT_SESSION_CHANGED, () => render());

  // ==================== 组件渲染 ====================

  /**
   * 渲染头部：标题 + 思考控制 + 新对话
   */
  const pendingSettings = {
    reasoningEffort: serviceCenter.getSettingsManager().getSettings()?.reasoningEffort || 'medium'
  };

  function renderHeader(session) {
    const actions = [];
    const showThinkingControl = checkModelSupportsThinking();
    const thinkingSession = session || { reasoningEffort: pendingSettings.reasoningEffort };

    // 思考强度控制（新对话状态也显示）
    if (showThinkingControl) {
      actions.push(window.ChatComponents.ThinkingControl(thinkingSession, {
        onUpdate: (val) => {
          if (session) {
            sessionManager.updateSession(session.id, (s) => s.reasoningEffort = val);
          } else {
            pendingSettings.reasoningEffort = val;
          }
        }
      }));
    }

    // 新对话按钮
    actions.push(window.UI.Button({
      className: 'btn-primary btn-small',
      text: '+ 新对话',
      onClick: () => {
        sessionManager.setCurrentSession(null);
        render();
      }
    }));

    return create('div', { className: 'page-header' }, [
      create('h2', { 
        className: 'page-title flex-1',
        text: session ? session.title : '新对话' 
      }),
      create('div', { className: 'flex items-center gap-8' }, actions)
    ]);
  }

  /**
   * 渲染消息列表：气泡流
   */
  function renderMessageList(messages) {
    const list = create('div', { 
      className: 'page-content flex flex-col gap-12', 
      id: 'message-list'
    });
    
    if (messages.length === 0) {
      list.appendChild(window.UI.EmptyState({
        icon: '💬',
        title: '开始新对话',
        desc: '支持 Markdown 渲染与思考过程显示'
      }));
    } else {
      messages.forEach(msg => {
        list.appendChild(window.ChatComponents.MessageBubble(msg, {
          onDelete: async (id) => {
            if (await window.Toast.confirm({ 
              title: '删除消息',
              message: '确定要删除这条消息吗？',
              confirmText: '删除',
              type: 'danger'
            })) {
              chatController.deleteMessage(id);
              window.Toast.success('已删除');
            }
          }
        }));
      });
    }
    return list;
  }

  /**
   * 渲染输入区：状态提示 + 文本框 + 操作按钮
   */
  function renderInputArea() {
    const statusText = create('div', { 
      id: 'chat-status-text', 
      className: 'chat-status-text mb-4',
      style: { display: 'none' }
    });

    const textarea = window.UI.Textarea({
      className: 'flex-1',
      id: 'message-input',
      placeholder: '输入消息 (Ctrl+Enter 发送)',
      rows: 1,
      style: { 
        overflow: 'hidden',
        resize: 'none'
      },
      onInput: (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
      }
    });

    // 绑定快捷键
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSendMessage(textarea.value);
      }
    });

    const sendBtn = window.UI.Button({
      className: 'btn-primary',
      id: 'send-btn',
      text: '发送',
      onClick: () => handleSendMessage(textarea.value)
    });

    const stopBtn = window.UI.Button({
      className: 'btn-error',
      id: 'stop-btn',
      text: '停止',
      style: { display: 'none' },
      onClick: () => chatController.stopGeneration()
    });

    return create('div', { className: 'page-footer flex flex-col' }, [
      statusText,
      create('div', { className: 'flex items-end gap-8' }, [
        textarea,
        sendBtn,
        stopBtn
      ])
    ]);
  }

  // ==================== 业务逻辑 ====================

  async function handleSendMessage(content) {
    if (!content.trim()) return;
    
    // 发送前清空输入框
    const textarea = document.getElementById('message-input');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    // 触发发送事件（由 ChatEventHandler 处理后续逻辑）
    eventBus.emit(window.Events.CHAT.USER_MESSAGE_SENT, {
      content,
      reasoningEffort: sessionManager.getCurrentSession()?.reasoningEffort || pendingSettings.reasoningEffort
    });
  }

  /**
   * 主渲染函数
   */
  function render() {
    if (!container) return;
    clear(container);
    const session = sessionManager.getCurrentSession();
    const messages = session ? session.messages : [];
    
    const page = create('div', { className: 'page chat-page' }, [
      renderHeader(session),
      renderMessageList(messages),
      renderInputArea()
    ]);
    
    container.appendChild(page);
    
    // 自动滚动到底部
    const list = page.querySelector('#message-list');
    if (list) list.scrollTop = list.scrollHeight;

    // 状态自愈：如果 Controller 报告没有活跃活动，但 UI 状态不匹配，强制同步
    const currentStatus = chatController.getQueueStatus();
    window.Pages.chat.updateUIState(currentStatus);
  }

  /**
   * 检查模型是否支持思考能力
   * 通过 ModelManager 检测当前模型的能力
   */
  function checkModelSupportsThinking() {
    try {
      const settings = serviceCenter.getSettingsManager().getSettings();
      if (!settings || !settings.model) return false;
      
      const modelManager = serviceCenter.getModelManager();
      const model = modelManager.getModel(settings.model);
      
      if (model && typeof model.supportsReasoning === 'function') {
        return model.supportsReasoning();
      }
      if (model && model.capabilities) {
        return !!model.capabilities.reasoning;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // 执行初始渲染
  render();
};
