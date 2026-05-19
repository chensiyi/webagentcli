/**
 * IChatService - 聊天服务接口基类
 * 
 * 定义所有聊天服务必须实现的标准接口。
 * 
 * 设计原则：
 * 1. 纯业务接口，不涉及 UI 层
 * 2. 支持高度拓展和自制（使用者可实现自己的 Service）
 * 3. 通过回调函数与上层通信，而非直接调用 UI
 * 
 * 使用示例：
 * ```javascript
 * class MyCustomService {
 *   configure(config) { ... }
 *   async chatStream(params, onChunk, onComplete) { ... }
 * }
 * 
 * // 继承基类确保接口完整
 * Object.setPrototypeOf(MyCustomService.prototype, IChatService);
 * ```
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
   * @param {Function} onChunk - 数据块回调 (chunk: { content, reasoning_content })
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
  },
  
  /**
   * 获取模型列表（可选）
   * @returns {Promise<Array>} 模型列表
   */
  async listModels() {
    throw new Error('Method not implemented');
  }
};

// 导出到全局
window.IChatService = IChatService;
