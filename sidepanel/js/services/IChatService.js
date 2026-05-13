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
   * 取消正在进行的请求
   * @returns {void}
   */
  cancel() {
    throw new Error('Method not implemented');
  }
};

// 导出到全局
window.IChatService = IChatService;
