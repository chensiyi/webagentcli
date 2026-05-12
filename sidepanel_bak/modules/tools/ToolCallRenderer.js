// 工具调用渲染器
// 负责渲染 tool_calls 卡片和 tool 消息

class ToolCallRenderer {
  constructor(create, messageRenderer) {
    this.create = create;
    this.messageRenderer = messageRenderer;
  }

  /**
   * 渲染消息气泡中的 tool_calls 卡片
   * @param {Object} msg - 消息对象
   * @param {number} index - 消息索引
   * @param {Array} messages - 完整消息数组
   * @param {Object} session - 会话对象
   * @param {Function} findToolResults - 查找 tool 结果的函数
   */
  renderToolCalls(msg, index, messages, session, findToolResults) {
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return [];
    }

    const cards = [];
    const toolResults = findToolResults(messages, index);

    msg.tool_calls.forEach((call, idx) => {
      const result = toolResults[idx];
      const card = this.messageRenderer.renderToolCallCard(
        call, 
        idx, 
        result, 
        session.isLoading
      );
      cards.push(card);
    });

    return cards;
  }

  /**
   * 创建工具调用容器
   * @param {Array} cards - 工具调用卡片数组
   * @returns {HTMLElement} 容器元素
   */
  createToolCallsContainer(cards) {
    if (!cards || cards.length === 0) {
      return null;
    }

    const container = this.create('div', {
      className: 'tool-calls-container',
      style: {
        marginBottom: '8px'
      }
    });

    cards.forEach(card => {
      container.appendChild(card);
    });

    return container;
  }

  /**
   * 增量更新 tool_calls 卡片
   * @param {HTMLElement} bubble - 消息气泡元素
   * @param {Object} msg - 消息对象
   * @param {Array} messages - 完整消息数组
   * @param {number} index - 消息索引
   * @param {Object} session - 会话对象
   * @param {Function} findToolResults - 查找 tool 结果的函数
   */
  updateToolCalls(bubble, msg, messages, index, session, findToolResults) {
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return;
    }

    // 查找或创建工具调用容器
    let container = bubble.querySelector('.tool-calls-container');
    if (!container) {
      container = this.create('div', {
        className: 'tool-calls-container',
        style: {
          marginBottom: '8px'
        }
      });
      
      // 插入到内容之前
      const contentDiv = bubble.querySelector('.message-content');
      if (contentDiv && contentDiv.parentNode) {
        contentDiv.parentNode.insertBefore(container, contentDiv);
      } else {
        bubble.appendChild(container);
      }
    }

    // 清空旧卡片
    container.innerHTML = '';

    // 渲染新卡片
    const cards = this.renderToolCalls(msg, index, messages, session, findToolResults);
    cards.forEach(card => {
      container.appendChild(card);
    });
  }

  /**
   * 移除加载动画
   * @param {HTMLElement} bubble - 消息气泡元素
   */
  removeLoadingAnimation(bubble) {
    const loadingContent = bubble.querySelector('.loading-content');
    if (loadingContent) {
      loadingContent.remove();
    }
  }
}

// 导出到全局
window.ToolCallRenderer = ToolCallRenderer;
