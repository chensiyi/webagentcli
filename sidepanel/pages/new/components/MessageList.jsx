/** @jsx h */
import { h } from 'preact';
import { MessageItem } from './MessageItem.jsx';

/**
 * MessageList - 消息列表组件
 */
export function MessageList({ messages, isLoading, isThinking, error, onDeleteMessage }) {
  return h('div', { className: 'message-list' },
    messages.map((message, index) => 
      h(MessageItem, {
        key: message.id || index,
        message,
        index,
        onDelete: () => onDeleteMessage && onDeleteMessage(index)
      })
    ),
    
    // 加载指示器
    isLoading && h('div', { className: 'loading-indicator' },
      h('div', { className: 'spinner' }, '🔄'),
      h('span', null, '正在生成...')
    ),
    
    // 思考指示器
    isThinking && h('div', { className: 'thinking-indicator' },
      h('div', { className: 'dots' },
        h('span', { className: 'dot' }),
        h('span', { className: 'dot' }),
        h('span', { className: 'dot' })
      ),
      h('span', null, 'AI 正在思考...')
    ),
    
    // 错误信息
    error && h('div', { className: 'error-message' },
      h('div', { className: 'error-icon' }, '❌'),
      h('span', null, error)
    )
  );
}
