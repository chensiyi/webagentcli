/**
 * Chat Components - 聊天业务组件库
 *
 * 渲染职责：
 * - user / assistant / system / tool 四种 role 的消息气泡
 * - assistant 消息中携带 toolCalls 时，渲染 ToolCallCard 列表
 * - tool 消息渲染为 ToolResultCard（紧凑折叠）
 */

/** HTML 安全转义（防止 XSS） */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, String.fromCharCode(38)+'amp;')
    .replace(/</g, String.fromCharCode(60)+'lt;')
    .replace(/>/g, String.fromCharCode(62)+'gt;')
    .replace(/"/g, String.fromCharCode(34)+'quot;')
    .replace(/'/g, String.fromCharCode(39)+'#039;');
}

window.ChatComponents = {

  // ==================== ToolCallCard（AI 发起的工具调用） ====================

  ToolCallCard(toolCall) {
    const { create } = window.DOM;
    const isToolCallObj = toolCall instanceof window.ToolCall;
    const tcId = isToolCallObj ? toolCall.id : (toolCall.id || '');
    const tcName = isToolCallObj ? toolCall.toolName : (toolCall.toolName || 'unknown');
    const tcArgs = isToolCallObj ? (toolCall.arguments || {}) : (toolCall.arguments || {});

    const argsStr = JSON.stringify(tcArgs, null, 2);

    // 查找对应的 ToolResult（同 message 的 tool 消息）
    const resultEl = create('div', {
      className: 'tool-result-body',
      attrs: { 'data-tool-call-id': tcId, 'data-tool-name': tcName },
      style: { display: 'none' }
    });

    const header = create('div', { className: 'tool-card-header' }, [
      create('span', { className: 'tool-card-icon', text: '🔧' }),
      create('span', { className: 'tool-card-name', text: tcName }),
      create('span', { className: 'tool-card-args', text: `(${argsStr.slice(0, 60)}${argsStr.length > 60 ? '…' : ''})` })
    ]);

    const argsBody = create('div', {
      className: 'tool-args-body',
      style: { display: 'none' }
    }, [
      create('pre', { text: argsStr, style: { margin: '8px 0', fontSize: '12px', lineHeight: '1.5', overflow: 'auto', maxHeight: '200px', background: 'var(--color-bg, #f8f8f8)', padding: '8px', borderRadius: '4px' } })
    ]);

    // 可折叠
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const isHidden = argsBody.style.display === 'none';
      argsBody.style.display = isHidden ? 'block' : 'none';
    });

    return create('div', { className: 'tool-card', attrs: { 'data-tool-call-id': tcId } }, [
      header,
      argsBody,
      resultEl
    ]);
  },

  // ==================== ToolResultCard（工具执行结果） ====================

  ToolResultCard(toolResult) {
    const { create } = window.DOM;
    const status = toolResult.status;
    const statusIcon = { success: '✅', failed: '❌', cancelled: '⚠️' }[status] || '⋯';
    const duration = toolResult.duration ? ` · ${toolResult.duration}ms` : '';

    const outputText = typeof toolResult.output === 'string'
      ? toolResult.output.slice(0, 200)
      : JSON.stringify(toolResult.output, null, 2)?.slice(0, 200);

    return create('div', { 
      className: `tool-card-result tool-result-${status}`,
      attrs: { 'data-tool-call-id': toolResult.toolCallId }
    }, [
      create('div', { className: 'tool-result-header' }, [
        create('span', { text: `${statusIcon} ${status}` }),
        create('span', { text: duration, className: 'tool-result-duration' })
      ]),
      toolResult.error ? create('div', { className: 'tool-result-error', text: toolResult.error }) : null,
      outputText ? create('div', { className: 'tool-result-output', text: outputText }) : null
    ].filter(Boolean));
  },

  // ==================== 消息气泡组件 ====================

  MessageBubble(msg, options = {}) {
    const { onDelete } = options;
    const { create } = window.DOM;
    const isUser = msg.role === 'user';
    const isTool = msg.role === 'tool';
    const bodyChildren = [];

    // ---- tool 角色：复用 assistant 的 markdown 渲染 ----
    if (isTool) {
      // tool 消息内容统一交给 marked.parse 渲染（与 assistant 路径一致）：
      //   - JSON 串被 ```...``` 包裹后会被 marked 渲染为原生 <pre><code> 代码块
      //   - 不再 escapeHtml，不再 500 字符截断，不再手动包 <pre class="tool-result-pre">
      const raw = msg.content || '';
      const isJson = raw.startsWith('{') || raw.startsWith('[');
      const mdSource = isJson ? '```json\n' + raw + '\n```' : raw;
      const rendered = typeof marked !== 'undefined'
        ? marked.parse(mdSource)
        : mdSource;

      const resultHeader = create('div', { className: 'tool-result-header' }, [
        create('span', {
          className: 'tool-result-label',
          text: msg.toolCallId ? `🔗 ${msg.toolCallId}` : '🔧 Tool result'
        }),
        create('span', {
          className: 'tool-result-toggle',
          text: '▼'
        })
      ]);

      const resultBody = create('div', { className: 'tool-result-body' }, [
        create('div', {
          className: 'message-content',
          attrs: { 'data-full-content': raw },
          html: rendered
        })
      ]);

      resultHeader.style.cursor = 'pointer';
      resultHeader.addEventListener('click', () => {
        const hidden = resultBody.style.display === 'none';
        resultBody.style.display = hidden ? 'block' : 'none';
        const toggle = resultHeader.querySelector('.tool-result-toggle');
        if (toggle) {
          toggle.style.transform = hidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });

      bodyChildren.push(resultHeader, resultBody);

      return create('div', {
        className: 'message-bubble message-bubble--left message-tool',
        attrs: { 'data-message-id': msg.id, 'data-tool-call-id': msg.toolCallId || '' }
      }, [
        create('div', { className: 'message-body' }, bodyChildren),
        onDelete ? window.UI.Button({
          className: 'message-delete-btn',
          title: '删除结果',
          text: '×',
          onClick: (e) => { e.stopPropagation(); onDelete(msg.id); }
        }) : null
      ].filter(Boolean));
    }

    // ---- assistant / user / system：处理思考过程 ----
    if (!isUser) {
      const hasReasoning = msg.reasoning_content && msg.reasoning_content.trim();
      
      const reasoningContent = create('div', {
        className: 'reasoning-content',
        text: msg.reasoning_content || '',
        style: { display: 'none' }
      });
      
      const reasoningHeader = create('div', { className: 'reasoning-header' }, [
        create('span', { text: '💭 思考过程' }),
        create('span', { className: 'reasoning-toggle', text: '▼' })
      ]);
      
      const reasoningContainer = create('div', { 
        className: 'message-reasoning',
        style: { display: hasReasoning ? 'block' : 'none' }
      }, [reasoningHeader, reasoningContent]);
      
      reasoningHeader.addEventListener('click', () => {
        const isHidden = reasoningContent.style.display === 'none';
        reasoningContent.style.display = isHidden ? 'block' : 'none';
        reasoningHeader.querySelector('.reasoning-toggle').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
      
      bodyChildren.push(reasoningContainer);

      // ---- assistant 消息：渲染 toolCalls 列表 ----
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        const toolCards = create('div', { className: 'tool-calls-container' });
        msg.toolCalls.forEach(tc => {
          toolCards.appendChild(window.ChatComponents.ToolCallCard(tc));
        });
        bodyChildren.push(toolCards);
      }
    }
    
    // 消息内容：Markdown 渲染
    bodyChildren.push(create('div', { 
      className: 'message-content',
      attrs: { 'data-full-content': msg.content || '' },
      html: typeof marked !== 'undefined' ? marked.parse(msg.content || '') : (msg.content || '')
    }));
    
    const bubble = create('div', {
      className: `message-bubble message-${msg.role}`,
      attrs: { 'data-message-id': msg.id }
    }, [
      create('div', { className: 'message-body' }, bodyChildren),
      window.UI.Button({
        className: 'message-delete-btn',
        title: '删除消息',
        text: '×',
        onClick: async (e) => {
          e.stopPropagation();
          if (onDelete) onDelete(msg.id);
        }
      })
    ]);

    return bubble;
  },

  /**
   * 思考强度控制组件
   */
  ThinkingControl(session, options = {}) {
    const { onUpdate } = options;
    const { create } = window.DOM;
    
    const efforts = [
      { value: 'high', label: '高', icon: '🚀' },
      { value: 'medium', label: '中', icon: '🔥' },
      { value: 'low', label: '低', icon: '⚡' },
      { value: 'off', label: '关', icon: '⭕' }
    ];

    const container = create('div', { 
      className: 'reasoning-control',
      style: { position: 'relative' } 
    });

    const effortSelector = create('div', {
      className: 'reasoning-effort-selector',
      style: { display: 'none' }
    });

    const btn = window.UI.Button({
      className: `btn-small ${session.reasoningEffort !== 'off' ? 'btn-primary' : 'btn-secondary'}`,
      text: 'think' + session.reasoningEffort || 'off',
      onClick: (e) => {
        e.stopPropagation();
        const isHidden = effortSelector.style.display === 'none';
        effortSelector.style.display = isHidden ? 'block' : 'none';
        if (!isHidden) {
          // 点击开启时，绑定一次性点击外部关闭
          const closeSelector = () => {
            effortSelector.style.display = 'none';
            document.removeEventListener('click', closeSelector);
          };
          setTimeout(() => document.addEventListener('click', closeSelector), 0);
        }
      }
    });

    // 局部渲染更新方法
    const updateUI = (newEffort) => {
      btn.className = `btn btn-small ${newEffort !== 'off' ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = 'think' + newEffort || 'off';
      
      // 更新选项激活状态
      Array.from(effortSelector.children).forEach((opt, idx) => {
        const eff = efforts[idx];
        opt.className = `effort-option ${newEffort === eff.value ? 'active' : ''}`;
      });
    };

    efforts.forEach(eff => {
      const opt = create('div', {
        className: `effort-option ${session.reasoningEffort === eff.value ? 'active' : ''}`,
        text: `${eff.icon} ${eff.label}`,
        onClick: (e) => {
          e.stopPropagation();
          if (onUpdate) onUpdate(eff.value);
          updateUI(eff.value);
          effortSelector.style.display = 'none';
        }
      });
      effortSelector.appendChild(opt);
    });

    // 滚轮切换逻辑
    btn.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentEffort = session.reasoningEffort || 'medium';
      const currentIndex = efforts.findIndex(eff => eff.value === currentEffort);
      let newIndex;
      
      if (e.deltaY < 0) {
        newIndex = Math.max(0, currentIndex - 1);
      } else {
        newIndex = Math.min(efforts.length - 1, currentIndex + 1);
      }
      
      if (newIndex !== currentIndex) {
        const newEffort = efforts[newIndex].value;
        if (onUpdate) onUpdate(newEffort);
        updateUI(newEffort);
        session.reasoningEffort = newEffort; // 同步内存对象
      }
    }, { passive: false });

    container.appendChild(btn);
    container.appendChild(effortSelector);
    return container;
  }
};
