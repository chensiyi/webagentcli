/**
 * ToolIntention - 工具调用意图模型（协议无关）
 * 
 * 表示 AI 希望执行某个工具的意图，不包含任何 API 标准相关的字段。
 */

class ToolIntention {
  /**
   * @param {Object} params
   * @param {string} params.id - 唯一标识
   * @param {string} params.toolName - 工具名称
   * @param {Object} params.parameters - 工具参数
   * @param {'pending'|'executing'|'completed'|'failed'} [params.status] - 执行状态
   * @param {*} [params.result] - 执行结果
   * @param {string} [params.error] - 错误信息
   */
  constructor({
    id,
    toolName,
    parameters = {},
    status = 'pending',
    result = null,
    error = null
  }) {
    if (!id) throw new Error('ToolIntention id is required');
    if (!toolName) throw new Error('ToolIntention toolName is required');

    this.id = id;
    this.toolName = toolName;
    this.parameters = parameters;
    this.status = status;
    this.result = result;
    this.error = error;
    this.createdAt = Date.now();
    this.completedAt = null;
  }

  /**
   * 标记为执行中
   */
  markAsExecuting() {
    this.status = 'executing';
  }

  /**
   * 标记为完成
   */
  markAsCompleted(result) {
    this.status = 'completed';
    this.result = result;
    this.completedAt = Date.now();
  }

  /**
   * 标记为失败
   */
  markAsFailed(error) {
    this.status = 'failed';
    this.error = typeof error === 'string' ? error : error.message;
    this.completedAt = Date.now();
  }

  /**
   * 判断是否已完成
   */
  isCompleted() {
    return this.status === 'completed';
  }

  /**
   * 判断是否已失败
   */
  isFailed() {
    return this.status === 'failed';
  }

  /**
   * 判断是否正在执行
   */
  isExecuting() {
    return this.status === 'executing';
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      id: this.id,
      toolName: this.toolName,
      parameters: this.parameters,
      status: this.status,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      completedAt: this.completedAt
    };
  }

  /**
   * 从普通对象创建实例
   */
  static fromJSON(obj) {
    return new ToolIntention(obj);
  }
}

// 导出（同时支持 ES Module 和全局变量）
if (typeof window !== 'undefined') {
  window.ToolIntention = ToolIntention;
}
export { ToolIntention };
