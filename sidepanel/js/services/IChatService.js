/**
 * Chat Service 接口规范
 * 
 * 定义所有聊天服务必须实现的标准接口
 * 这是业务逻辑框架的核心抽象层
 */

/**
 * IChatService 接口定义
 * 
 * 所有具体的聊天服务实现都必须遵循此接口
 */
const IChatService = {
  /**
   * 配置服务
   * @param {Object} config - 配置对象（不同服务需要的配置项不同）
   */
  configure(config) {
    throw new Error('Method not implemented');
  },
  
  /**
   * 发送聊天请求（非流式）
   * @param {Object} params - 请求参数
   * @param {Array} params.messages - 消息数组
   * @param {string} [params.model] - 模型名称
   * @param {number} [params.temperature] - 温度参数
   * @param {number} [params.maxTokens] - 最大 token 数
   * @returns {Promise<Object>} 响应数据
   */
  async chat(params) {
    throw new Error('Method not implemented');
  },
  
  /**
   * 发送流式聊天请求
   * @param {Object} params - 请求参数
   * @param {Function} onChunk - 数据块回调
   * @param {Function} onComplete - 完成回调
   * @returns {Promise<void>}
   */
  async chatStream(params, onChunk, onComplete) {
    throw new Error('Method not implemented');
  },

  /**
   * 处理流式更新中的推理内容（UI 交互逻辑）
   * @param {Object} data - 包含 messageId, reasoning_content 等
   */
  handleStreamReasoning(data) {
    // console.log('[IChatService] Stream reasoning:', data.messageId, data.reasoning_content);
    if (window.ChatEventHandler) {
      window.ChatEventHandler._handleStreamReasoning(data);
    }
  },
  
  /**
   * 取消正在进行的请求
   * @returns {void}
   */
  cancel() {
    throw new Error('Method not implemented');
  },

  /**
   * 删除消息（标准交互操作）
   * @param {string} messageId - 消息 ID
   * @returns {Promise<void>}
   */
  async deleteMessage(messageId) {
    throw new Error('Method not implemented');
  },

  /**
   * 确认并删除消息（标准交互操作）
   * @param {string} messageId - 消息 ID
   * @param {Function} onConfirm - 确认后的回调
   * @returns {void}
   */
  confirmDeleteMessage(messageId, onConfirm) {
    // 默认实现：使用 Toast 进行确认
    if (window.Toast && window.Toast.confirm) {
      window.Toast.confirm({
        message: '确定要删除这条消息吗？',
        title: '删除确认',
        onConfirm: () => {
          console.log('[IChatService] Delete confirmed for:', messageId);
          if (typeof onConfirm === 'function') onConfirm();
        }
      });
    } else if (confirm('确定要删除这条消息吗？')) {
      onConfirm();
    }
  },

  /**
   * 处理流式请求开始（UI 交互逻辑）
   * @param {Object} data - 包含 messageId 等信息
   */
  handleStreamStart(data) {
    console.log('[IChatService] Stream started:', data.messageId);
    console.log('[IChatService] window.ChatEventHandler exists:', !!window.ChatEventHandler);
    console.log('[IChatService] _handleStreamStart method exists:', !!window.ChatEventHandler?._handleStreamStart);
    // 默认实现：触发 UI 状态变更
    if (window.ChatEventHandler) {
      window.ChatEventHandler._handleStreamStart(data);
    }
  },

  /**
   * 处理流式更新（UI 交互逻辑）
   * @param {Object} data - 包含 messageId, content 等
   */
  handleStreamUpdate(data) {
    // console.log('[IChatService] Stream update:', data.messageId, data.content);
    if (window.ChatEventHandler) {
      window.ChatEventHandler._handleStreamUpdate(data);
    }
  },

  /**
   * 处理流式完成（UI 交互逻辑）
   * @param {Object} data - 包含 message, duration 等
   */
  handleStreamComplete(data) {
    console.log('[IChatService] Stream completed');
    if (window.ChatEventHandler) {
      window.ChatEventHandler._handleStreamComplete(data);
    }
  },

  /**
   * 处理流式错误（UI 交互逻辑）
   * @param {Object} data - 包含 error, message 等
   */
  handleStreamError(data) {
    console.error('[IChatService] Stream error:', data.error);
    if (window.ChatEventHandler) {
      window.ChatEventHandler._handleStreamError(data);
    }
  }
};

// 导出到全局
window.IChatService = IChatService;
