/** @jsx h */
import { h } from 'preact';

/**
 * MessageItem - 单条消息组件
 */
export function MessageItem({ message, index, onDelete }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  // 渲染消息内容
  const renderContent = () => {
    if (typeof message.content === 'string') {
      return h('div', { 
        className: 'message-text markdown',
        dangerouslySetInnerHTML: { __html: simpleMarkdown(message.content) }
      });
    }
    
    // 多模态内容
    if (Array.isArray(message.content)) {
      return h('div', { className: 'multimodal-content' },
        message.content.map((part, i) => {
          if (part.type === 'text') {
            return h('p', { key: i }, part.text);
          }
          if (part.type === 'image') {
            return h('img', { 
              key: i,
              src: part.dataUrl || part.url,
              alt: part.filename || '图片',
              className: 'message-image'
            });
          }
          return null;
        })
      );
    }
    
    return null;
  };
  
  // 渲染工具调用
  const renderToolCalls = () => {
    if (!message.toolIntentions || message.toolIntentions.length === 0) {
      return null;
    }
    
    return h('div', { className: 'tool-calls' },
      message.toolIntentions.map(intention => 
        h('div', { 
          key: intention.id,
          className: `tool-call tool-call-${intention.status}`
        },
          h('span', { className: 'tool-icon' }, getStatusIcon(intention.status)),
          h('span', { className: 'tool-name' }, intention.toolName),
          h('pre', { className: 'tool-params' }, JSON.stringify(intention.parameters, null, 2))
        )
      )
    );
  };
  
  // 渲染思考过程
  const renderThinking = () => {
    if (!message.metadata?.thinkingProcess) {
      return null;
    }
    
    return h('details', { className: 'thinking-process' },
      h('summary', null, '💭 思考过程'),
      h('div', { className: 'thinking-content' }, message.metadata.thinkingProcess)
    );
  };
  
  return h('div', { 
    className: `message-item message-${message.role}`,
    'data-index': index
  },
    // 头像
    h('div', { className: 'message-avatar' },
      isUser ? '👤' : '🤖'
    ),
    
    // 消息内容区域
    h('div', { className: 'message-body' },
      // 角色标签
      h('div', { className: 'message-role' },
        isUser ? '用户' : 'AI 助手'
      ),
      
      // 思考过程
      renderThinking(),
      
      // 文本/多媒体内容
      renderContent(),
      
      // 工具调用
      renderToolCalls()
    ),
    
    // 操作按钮
    h('div', { className: 'message-actions' },
      h('button', {
        className: 'action-btn delete-btn',
        onClick: onDelete,
        title: '删除消息'
      }, '🗑️')
    )
  );
}

// 获取工具状态图标
function getStatusIcon(status) {
  const icons = {
    pending: '⏳',
    executing: '🔄',
    completed: '✅',
    failed: '❌'
  };
  return icons[status] || '❓';
}

// 简单的 Markdown 渲染
function simpleMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
