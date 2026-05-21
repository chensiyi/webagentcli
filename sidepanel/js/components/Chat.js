/**
 * Chat Components - 聊天业务组件库
 */

window.ChatComponents = {
  /**
   * 消息气泡组件
   */
  MessageBubble(msg, options = {}) {
    const { onDelete } = options;
    const { create } = window.DOM;
    const isUser = msg.role === 'user';
    const bodyChildren = [];
    
    // AI 消息：处理思考过程
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
      text: session.reasoningEffort !== 'off' ? 'think💡' : 'think',
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
      btn.textContent = newEffort !== 'off' ? 'think💡' : 'think';
      
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
