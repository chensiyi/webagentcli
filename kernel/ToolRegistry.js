/**
 * ToolRegistry - 系统调用注册表
 * 
 * 职责：
 * - 系统调用（工具）的注册、查询、生命周期管理
 * - 标准化工具契约（ToolDefinition）
 * - 按权限查询工具
 * - 执行审计
 * 
 * 设计原则：
 * - 每个工具是一个"系统调用"，通过名称标识
 * - 工具与能力（capability）绑定，供 CapabilityManager 检查
 * - 零外部依赖
 */

class ToolRegistry {
  constructor(options = {}) {
    this._tools = new Map();      // name → IToolService 实例
    this._invocationHistory = [];
    this._maxHistory = options.maxHistory || 500;
    this._beforeInvoke = options.beforeInvoke || null; // middleware
    this._afterInvoke = options.afterInvoke || null;   // middleware
  }

  /**
   * 注册工具
   * @param {IToolService} tool - 工具实例（必须包含 definition 和 invoke 方法）
   * @throws {Error} 如果工具名已存在
   */
  register(tool) {
    if (!tool || !tool.definition || !tool.definition.name) {
      throw new Error('[ToolRegistry] Invalid tool: must have a definition with name');
    }
    const name = tool.definition.name;
    if (this._tools.has(name)) {
      throw new Error(`[ToolRegistry] Tool "${name}" already registered`);
    }
    this._tools.set(name, tool);
    return this;
  }

  /**
   * 批量注册工具（忽略重复注册错误）
   * @param {IToolService[]} tools
   */
  registerAll(tools) {
    tools.forEach(tool => {
      try {
        this.register(tool);
      } catch (e) {
        console.warn(`[ToolRegistry] Failed to register tool "${tool.definition?.name}":`, e.message);
      }
    });
    return this;
  }

  /**
   * 注销工具
   * @param {string} name
   */
  unregister(name) {
    this._tools.delete(name);
    return this;
  }

  /**
   * 获取指定工具
   * @param {string} name
   * @returns {IToolService|null}
   */
  get(name) {
    return this._tools.get(name) || null;
  }

  /**
   * 获取所有已注册的工具
   * @returns {IToolService[]}
   */
  getAll() {
    return Array.from(this._tools.values());
  }

  /**
   * 获取所有已启用的工具
   * @returns {IToolService[]}
   */
  getEnabled() {
    return Array.from(this._tools.values()).filter(t => t.enabled !== false);
  }

  /**
   * 获取已禁用（enabled === false）的工具
   * @returns {IToolService[]}
   */
  getDisabled() {
    return Array.from(this._tools.values()).filter(t => t.enabled === false);
  }

  /**
   * 启用工具
   * @param {string} name
   */
  enable(name) {
    const tool = this._tools.get(name);
    if (tool) {
      tool.enabled = true;
    }
  }

  /**
   * 禁用工具
   * @param {string} name
   */
  disable(name) {
    const tool = this._tools.get(name);
    if (tool) {
      tool.enabled = false;
    }
  }

  /**
   * 检查工具是否已注册
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._tools.has(name);
  }

  /**
   * 获取已启用工具的数量
   * @returns {number}
   */
  getEnabledCount() {
    return this.getEnabled().length;
  }

  /**
   * 获取工具总数
   * @returns {number}
   */
  getTotalCount() {
    return this._tools.size;
  }

  /**
   * 获取工具定义列表（用于传给 LLM 的 tools 参数）
   * @param {string} [format='openai'] - 输出格式
   * @returns {Array}
   */
  getDefinitionsForLLM(format = 'openai') {
    const enabledTools = this.getEnabled();
    if (format === 'openai') {
      return enabledTools
        .filter(t => t.definition && typeof t.definition.toOpenAIFunction === 'function')
        .map(t => t.definition.toOpenAIFunction());
    }
    return enabledTools.map(t => t.definition);
  }

  /**
   * 按能力（capability）查询工具
   * @param {string} capability
   * @returns {IToolService[]}
   */
  findByCapability(capability) {
    return this.getEnabled().filter(t => {
      if (!t.definition) return false;
      const caps = t.definition.capabilities || [];
      return caps.includes(capability);
    });
  }

  /**
   * 获取调用历史
   * @param {Object} [filters]
   * @param {string} [filters.toolName] - 按工具名过滤
   * @param {string} [filters.status] - 按状态过滤
   * @param {number} [filters.since] - 起始时间戳
   * @param {number} [filters.limit] - 返回条数上限
   * @returns {Array}
   */
  getInvocationHistory(filters = {}) {
    let result = [...this._invocationHistory];

    if (filters.toolName) {
      result = result.filter(entry => entry.toolName === filters.toolName);
    }
    if (filters.status) {
      result = result.filter(entry => entry.status === filters.status);
    }
    if (filters.since) {
      result = result.filter(entry => entry.timestamp >= filters.since);
    }
    if (filters.limit && result.length > filters.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  /**
   * 记录调用（由外部在 invoke 前后调用）
   * @param {Object} record
   * @param {string} record.toolName
   * @param {string} record.toolCallId
   * @param {string} record.status - 'started' | 'completed' | 'failed'
   * @param {number} [record.duration]
   * @param {*} [record.error]
   */
  recordInvocation(record) {
    this._invocationHistory.push({
      ...record,
      timestamp: Date.now(),
      id: `invoke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    });
    if (this._invocationHistory.length > this._maxHistory) {
      this._invocationHistory.shift();
    }
  }

  /**
   * 设置调用前中间件
   * @param {Function} middleware - (toolCall, context) => boolean | void
   */
  setBeforeInvoke(middleware) {
    this._beforeInvoke = middleware;
  }

  /**
   * 设置调用后中间件
   * @param {Function} middleware - (result, context) => void
   */
  setAfterInvoke(middleware) {
    this._afterInvoke = middleware;
  }

  /**
   * 执行调用前检查（供 ChatController 使用）
   * @param {Object} toolCall
   * @param {Object} context
   * @returns {boolean} true 表示允许执行
   */
  runBeforeInvoke(toolCall, context = {}) {
    if (this._beforeInvoke) {
      try {
        const result = this._beforeInvoke(toolCall, context);
        return result !== false;
      } catch (e) {
        console.error('[ToolRegistry] beforeInvoke error:', e);
        return false;
      }
    }
    return true;
  }

  /**
   * 执行调用后处理（供 ChatController 使用）
   * @param {Object} result
   * @param {Object} context
   */
  runAfterInvoke(result, context = {}) {
    if (this._afterInvoke) {
      try {
        this._afterInvoke(result, context);
      } catch (e) {
        console.error('[ToolRegistry] afterInvoke error:', e);
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const totalInvocations = this._invocationHistory.length;
    const completed = this._invocationHistory.filter(e => e.status === 'completed').length;
    const failed = this._invocationHistory.filter(e => e.status === 'failed').length;

    return {
      totalTools: this._tools.size,
      enabledTools: this.getEnabledCount(),
      disabledTools: this.getDisabled().length,
      totalInvocations,
      completed,
      failed,
      successRate: totalInvocations > 0 ? (completed / totalInvocations * 100).toFixed(1) + '%' : 'N/A'
    };
  }

  /**
   * 清空调用历史
   */
  clearHistory() {
    this._invocationHistory = [];
  }

  /**
   * 清空所有注册
   */
  clear() {
    this._tools.clear();
    this._invocationHistory = [];
  }

  /**
   * 销毁
   */
  destroy() {
    this.clear();
    this._beforeInvoke = null;
    this._afterInvoke = null;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToolRegistry;
}
if (typeof window !== 'undefined') {
  window.ToolRegistry = ToolRegistry;
}
