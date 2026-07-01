/**
 * ChatPage - 聊天主页面
 * 职责：
 * 1. 负责聊天界面的完整渲染
 * 2. 响应 ChatProgram 输出事件（STREAM_START/COMPLETE 等）控制 UI
 * 3. 处理用户输入与会话切换的 UI 逻辑
 */

import { Pages, DOM } from '../utils/dom.js';
import { Events } from '../events.js';
import { UI } from '../components/UI.js';
import { ChatComponents } from '../components/Chat.js';
import { Toast } from '../utils/toast.js';

Pages.chat = function(container, kernel) {
  const { create, clear } = DOM;
  const ipc = kernel.getIPC();
  const chatChannel = ipc?.getOrCreateChannel('chat') || ipc;
  const toolChannel = ipc?.getOrCreateChannel('tool') || ipc;
  const sessionManager = kernel.getSessionManager();

  // ==================== UI 状态控制（真实事件驱动） ====================

  function _showStreamingUI() {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    if (sendBtn) sendBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';
  }

  function _hideStreamingUI() {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const input = document.getElementById('message-input');
    if (sendBtn) sendBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (input) { input.disabled = false; input.focus(); }
  }

  // ==================== 事件监听 ====================
  // 流式生命周期 → 按钮状态
  chatChannel.on(Events.CHAT.STREAM_START, () => _showStreamingUI());
  chatChannel.on(Events.CHAT.STREAM_COMPLETE, () => _hideStreamingUI());
  chatChannel.on(Events.CHAT.STREAM_STOP, () => _hideStreamingUI());
  chatChannel.on(Events.CHAT.STREAM_ERROR, () => _hideStreamingUI());

  // 消息增删或会话切换时触发全量渲染
  chatChannel.on(Events.CHAT.MESSAGE_ADDED, () => render());
  chatChannel.on(Events.CHAT.MESSAGE_DELETED, () => render());
  chatChannel.on(Events.CHAT.CURRENT_SESSION_CHANGED, () => render());

  // ==================== 组件渲染 ====================

  const pendingSettings = {
    reasoningEffort: kernel.getSettingsManager().getSettings()?.reasoningEffort || 'medium'
  };

  function renderHeader(session) {
    const actions = [];
    const showThinkingControl = checkModelSupportsThinking();
    const thinkingSession = session || { reasoningEffort: pendingSettings.reasoningEffort };

    if (showThinkingControl && ChatComponents && ChatComponents.ThinkingControl) {
      actions.push(ChatComponents.ThinkingControl(thinkingSession, {
        onUpdate: (val) => {
          if (session) {
            sessionManager.updateSession(session.id, (s) => s.reasoningEffort = val);
          } else {
            pendingSettings.reasoningEffort = val;
          }
        }
      }));
    }

    actions.push(UI.Button({
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

  function renderMessageList(messages) {
    const list = create('div', { 
      className: 'page-content flex flex-col gap-12', 
      id: 'message-list'
    });
    
    if (messages.length === 0) {
      list.appendChild(UI.EmptyState({
        icon: '💬',
        title: '开始新对话',
        desc: '支持 Markdown 渲染与思考过程显示'
      }));
    } else {
      messages.forEach(msg => {
        list.appendChild(ChatComponents.MessageBubble(msg, {
          onDelete: async (id) => {
            if (await Toast.confirm({ 
              title: '删除消息',
              message: '确定要删除这条消息吗？',
              confirmText: '删除',
              type: 'danger'
            })) {
              chatChannel.emit(Events.CHAT.USER_APPLY_DELETE_MESSAGE, { messageId: id });
              Toast.success('已删除');
            }
          }
        }));
      });
    }
    return list;
  }

  function renderInputArea() {
    const textarea = UI.Textarea({
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

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSendMessage(textarea.value);
      }
    });

    const sendBtn = UI.Button({
      className: 'btn-primary',
      id: 'send-btn',
      text: '发送',
      onClick: () => handleSendMessage(textarea.value)
    });

    const stopBtn = UI.Button({
      className: 'btn-error',
      id: 'stop-btn',
      text: '停止',
      style: { display: 'none' },
      onClick: () => chatChannel.emit(Events.CHAT.USER_APPLY_STOP)
    });

    let toolPanelVisible = false;
    const toolBtn = UI.Button({
      className: 'btn-tool-toggle',
      text: '🔧 工具',
      title: '管理可用工具',
      onClick: () => {
        toolPanelVisible = !toolPanelVisible;
        const panel = document.getElementById('tool-panel');
        if (panel) panel.style.display = toolPanelVisible ? 'block' : 'none';
        toolBtn.className = toolPanelVisible ? 'btn btn-secondary btn-tool-toggle active' : 'btn btn-secondary btn-tool-toggle';
      }
    });

    const toolPanel = create('div', { id: 'tool-panel', className: 'tool-panel', style: { display: 'none' } });
    setTimeout(() => populateToolPanel(toolPanel), 100);

    return create('div', { className: 'page-footer flex flex-col' }, [
      toolPanel,
      create('div', { className: 'flex items-end gap-8' }, [
        toolBtn,
        textarea,
        sendBtn,
        stopBtn
      ])
    ]);
  }

  // ==================== 工具面板 ====================

  function populateToolPanel(panel) {
    if (!panel) return;
    const allTools = kernel.toolRegistry?.getAll();
    
    if (!allTools || allTools.length === 0) {
      panel.appendChild(create('div', { className: 'tool-panel-empty', text: '暂无可用工具' }));
      return;
    }

    panel.innerHTML = '';
    panel.appendChild(create('div', { className: 'tool-panel-title', text: '可用工具' }));

    allTools.forEach(tool => {
      if (!tool.definition) return;
      const toolItem = create('div', { className: 'tool-panel-item' }, [
        create('div', { className: 'tool-panel-info' }, [
          create('span', { className: 'tool-panel-name', text: tool.definition.name }),
          create('span', { className: 'tool-panel-desc', text: tool.definition.description || '' }),
        ]),
        create('button', {
          className: tool.enabled ? 'btn btn-small btn-success tool-toggle-btn' : 'btn btn-small btn-secondary tool-toggle-btn',
          text: tool.enabled ? '已启用' : '已禁用',
          title: tool.enabled ? '点击禁用' : '点击启用',
          onClick: () => {
            if (tool.enabled) {
              tool.disable();
            } else {
              tool.enable();
            }
            toolBtnText.textContent = tool.enabled ? '已启用' : '已禁用';
            toolBtnText.className = tool.enabled ? 'btn btn-small btn-success tool-toggle-btn' : 'btn btn-small btn-secondary tool-toggle-btn';
          }
        })
      ]);
      
      const toolBtnText = toolItem.querySelector('.tool-toggle-btn');
      panel.appendChild(toolItem);
    });

    const progressArea = create('div', { id: 'tool-progress-area', className: 'tool-progress-area' });
    panel.appendChild(progressArea);

    toolChannel.on(Events.TOOL.EXECUTING, (data) => {
      appendToolProgress(progressArea, 'executing', data);
    });
    toolChannel.on(Events.TOOL.COMPLETED, (data) => {
      appendToolProgress(progressArea, 'completed', data);
    });
  }

  function appendToolProgress(area, type, data) {
    if (!area) return;
    const icon = type === 'executing' ? '⏳' : (data.status === 'success' ? '✅' : '❌');
    const text = type === 'executing' 
      ? `正在执行: ${data.toolName}`
      : `${data.toolName} ${data.status} (${data.duration || 0}ms)`;
    const entry = create('div', { className: 'tool-progress-entry' }, [
      create('span', { text: icon }),
      create('span', { text, className: 'tool-progress-text' })
    ]);
    area.appendChild(entry);
    area.scrollTop = area.scrollHeight;
    while (area.children.length > 50) {
      area.removeChild(area.firstChild);
    }
  }

  // ==================== 业务逻辑 ====================

  function handleSendMessage(content) {
    if (!content.trim()) return;
    
    const textarea = document.getElementById('message-input');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    // ★ 发射 USER_APPLY_SEND → ChatEventHandler 鉴权转译 → ChatProgram.CMD.SEND
    chatChannel.emit(Events.CHAT.USER_APPLY_SEND, {
      content,
      reasoningEffort: sessionManager.getCurrentSession()?.reasoningEffort || pendingSettings.reasoningEffort
    });
  }

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
    
    const list = page.querySelector('#message-list');
    if (list) list.scrollTop = list.scrollHeight;

    // 默认显示发送按钮（STREAM_START 会切换到停止按钮）
    _hideStreamingUI();
  }

  function checkModelSupportsThinking() {
    try {
      const settings = kernel.getSettingsManager().getSettings();
      const result = !!(settings && settings.model);
      kernel.log?.debug('CHAT', `checkModelSupportsThinking: ${result}, model: ${settings?.model}`);
      return result;
    } catch (e) {
      kernel.log?.warn('CHAT', `checkModelSupportsThinking error: ${e?.message}`);
      return false;
    }
  }

  render();
};