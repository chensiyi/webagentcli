/**
 * ChatController - 聊天控制器（适配层）
 * 
 * 职责：
 * 1. 作为 UI 层和 Chat 实例之间的适配层
 * 2. 接收 Chat 实例并委托所有操作
 * 3. 不持有状态，不管理会话生命周期
 * 
 * 设计原则：
 * - 无状态：所有状态在 Chat 实例中
 * - 被动接收：由调用方提供 Chat 对象
 * - 单一职责：只负责转发调用，不管理资源
 */

class ChatController {
  constructor() {
    this.eventBus = window.EventBus;
    console.log('[ChatController] Initialized');
  }
  
  /**
   * 发送消息
   * @param {Chat} chat - Chat 实例（由调用方提供）
   * @param {Object} params - 发送参数
   * @param {string} params.content - 消息内容
   * @param {boolean} [params.reasoningEnabled] - 是否启用 reasoning
   * @param {string} [params.reasoningEffort] - reasoning 强度
   * @returns {Promise<Object>} 结果
   */
  async sendMessage(chat, params) {
    if (!chat) {
      throw new Error('Chat instance is required');
    }
    return await chat.sendMessage(params);
  }
  
  /**
   * 停止生成
   * @param {Chat} chat - Chat 实例
   */
  stopGeneration(chat) {
    if (!chat) {
      console.warn('[ChatController] No chat to stop');
      return;
    }
    chat.stopGeneration();
  }
  
  /**
   * 清空当前会话
   * @param {Chat} chat - Chat 实例
   */
  clearSession(chat) {
    if (!chat) {
      console.warn('[ChatController] No chat to clear');
      return;
    }
    chat.clearMessages();
  }
  
  /**
   * 删除指定消息
   * @param {Chat} chat - Chat 实例
   * @param {string} messageId - 消息 ID
   * @returns {boolean}
   */
  deleteMessage(chat, messageId) {
    if (!chat) {
      return false;
    }
    return chat.deleteMessage(messageId);
  }
  
  /**
   * 检查是否有活跃活动
   * @param {Chat} chat - Chat 实例
   * @returns {boolean}
   */
  hasActiveActivities(chat) {
    if (!chat) {
      return false;
    }
    return chat.hasActiveActivities();
  }
  
  /**
   * 获取队列状态
   * @param {Chat} chat - Chat 实例
   * @returns {Object}
   */
  getQueueStatus(chat) {
    if (!chat) {
      return {
        isStreaming: false,
        messageQueueLength: 0,
        taskQueueLength: 0,
        hasActive: false
      };
    }
    return chat.getQueueStatus();
  }
}

// 导出单例
window.ChatController = new ChatController();
