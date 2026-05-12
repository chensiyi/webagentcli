/**
 * ChatMessageList - 聊天消息列表组件（React 风格）
 * 
 * 这是一个纯函数组件，接收状态并渲染 UI
 */

function ChatMessageList({ messages, isLoading, isThinking }) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  // 清空容器
  container.innerHTML = '';
  
  // 渲染每条消息
  messages.forEach((message, index) => {
    const messageEl = createMessageElement(message, index);
    container.appendChild(messageEl);
  });
  
  // 如果正在思考，显示指示器
  if (isThinking) {
    const thinkingEl = createThinkingIndicator();
    container.appendChild(thinkingEl);
  }
}

/**
 * 创建消息元素
 */
function createMessageElement(message, index) {
  const div = document.createElement('div');
  div.className = `message message-${message.role}`;
  div.dataset.messageIndex = index;
  
  // 头像
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = message.role === 'user' ? '👤' : '🤖';
  
  // 内容区域
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // 根据角色和内容类型渲染
  if (message.role === 'assistant') {
    // 助手消息可能包含思考过程、工具调用等
    if (message.metadata?.thinkingProcess) {
      const thinkingEl = document.createElement('div');
      thinkingEl.className = 'thinking-process';
      thinkingEl.innerHTML = `<details><summary>💭 思考过程</summary>${escapeHtml(message.metadata.thinkingProcess)}</details>`;
      content.appendChild(thinkingEl);
    }
    
    // 文本内容
    if (message.content) {
      const textEl = document.createElement('div');
      textEl.className = 'message-text';
      textEl.innerHTML = renderMarkdown(message.content);
      content.appendChild(textEl);
    }
    
    // 工具调用
    if (message.hasToolIntentions && message.hasToolIntentions()) {
      const toolsEl = document.createElement('div');
      toolsEl.className = 'tool-calls';
      message.toolIntentions.forEach(intention => {
        const toolEl = createToolCallElement(intention);
        toolsEl.appendChild(toolEl);
      });
      content.appendChild(toolsEl);
    }
  } else {
    // 用户消息
    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    
    if (message.isMultimodal && message.isMultimodal()) {
      // 多模态消息
      message.getMediaContents().forEach(mc => {
        if (mc.isText()) {
          textEl.innerHTML += escapeHtml(mc.text);
        } else if (mc.isImage()) {
          const img = document.createElement('img');
          img.src = mc.getSource();
          img.alt = mc.filename || '图片';
          img.className = 'message-image';
          textEl.appendChild(img);
        }
      });
    } else {
      textEl.textContent = message.content;
    }
    
    content.appendChild(textEl);
  }
  
  // 操作按钮（删除、编辑）
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  actions.innerHTML = `
    <button onclick="deleteMessage(${index})" title="删除">🗑️</button>
    ${message.role === 'user' ? `<button onclick="editMessage(${index})" title="编辑">✏️</button>` : ''}
  `;
  
  // 组装
  div.appendChild(avatar);
  div.appendChild(content);
  div.appendChild(actions);
  
  return div;
}

/**
 * 创建工具调用元素
 */
function createToolCallElement(intention) {
  const div = document.createElement('div');
  div.className = `tool-call tool-call-${intention.status}`;
  
  const statusIcon = {
    pending: '⏳',
    executing: '🔄',
    completed: '✅',
    failed: '❌'
  }[intention.status] || '❓';
  
  div.innerHTML = `
    <span class="tool-icon">${statusIcon}</span>
    <span class="tool-name">${escapeHtml(intention.toolName)}</span>
    <span class="tool-params">${escapeHtml(JSON.stringify(intention.parameters))}</span>
  `;
  
  return div;
}

/**
 * 创建思考指示器
 */
function createThinkingIndicator() {
  const div = document.createElement('div');
  div.className = 'thinking-indicator';
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  return div;
}

/**
 * 渲染 Markdown
 */
function renderMarkdown(text) {
  // 简单的 Markdown 渲染（实际项目中应使用 marked.js 等库）
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 导出
if (typeof window !== 'undefined') {
  window.ChatMessageList = ChatMessageList;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatMessageList;
}
