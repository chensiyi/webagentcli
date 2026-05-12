/**
 * ToolRegistry - 工具注册表（纯数据管理）
 * 
 * 职责：
 * - 工具注册、启用/禁用
 * - 参数验证
 * - 通过 EventBus 通知状态变化
 */

class ToolRegistry {
  constructor(eventBus) {
    this.eventBus = eventBus;
    
    // 工具注册表：toolId -> tool definition
    this.tools = new Map();
    
    // 启用的工具 ID 集合
    this.enabledTools = new Set();
  }

  /**
   * 注册工具
   * @param {Object} toolDefinition 
   * @param {string} toolDefinition.id - 工具唯一标识
   * @param {string} toolDefinition.name - 工具名称
   * @param {string} toolDefinition.description - 工具描述
   * @param {Object} toolDefinition.parameters - JSON Schema 格式的参数定义
   * @param {Function} toolDefinition.execute - 执行函数
   */
  registerTool(toolDefinition) {
    if (!toolDefinition.id) {
      throw new Error('Tool must have an id');
    }
    
    this.tools.set(toolDefinition.id, {
      ...toolDefinition,
      enabled: false,
      registered_at: Date.now()
    });
    
    this.eventBus.emit('TOOL_REGISTERED', { tool: toolDefinition });
    
    console.log('[ToolRegistry] Registered tool:', toolDefinition.id);
  }

  /**
   * 启用工具
   * @param {string} toolId 
   */
  enableTool(toolId) {
    if (!this.tools.has(toolId)) {
      console.warn('[ToolRegistry] Tool not found:', toolId);
      return false;
    }
    
    const tool = this.tools.get(toolId);
    tool.enabled = true;
    this.enabledTools.add(toolId);
    
    this.eventBus.emit('TOOL_ENABLED', { toolId });
    
    console.log('[ToolRegistry] Enabled tool:', toolId);
    return true;
  }

  /**
   * 禁用工具
   * @param {string} toolId 
   */
  disableTool(toolId) {
    if (!this.tools.has(toolId)) {
      return false;
    }
    
    const tool = this.tools.get(toolId);
    tool.enabled = false;
    this.enabledTools.delete(toolId);
    
    this.eventBus.emit('TOOL_DISABLED', { toolId });
    
    console.log('[ToolRegistry] Disabled tool:', toolId);
    return true;
  }

  /**
   * 获取已启用的工具列表
   * @returns {Array<Object>}
   */
  getEnabledTools() {
    return Array.from(this.enabledTools)
      .map(id => this.tools.get(id))
      .filter(Boolean);
  }

  /**
   * 获取所有工具
   * @returns {Array<Object>}
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否已启用
   * @param {string} toolId 
   * @returns {boolean}
   */
  isToolEnabled(toolId) {
    return this.enabledTools.has(toolId);
  }

  /**
   * 验证工具参数
   * @param {string} toolId 
   * @param {Object} args - 待验证的参数
   * @returns {{valid: boolean, errors: Array}}
   */
  validateArgs(toolId, args) {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { valid: false, errors: ['Tool not found'] };
    }
    
    // TODO: 实现 JSON Schema 验证
    // 目前只做简单检查
    const errors = [];
    
    if (tool.parameters && tool.parameters.required) {
      for (const requiredParam of tool.parameters.required) {
        if (!(requiredParam in args)) {
          errors.push(`Missing required parameter: ${requiredParam}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成 OpenAI 标准格式的工具定义
   * @returns {Array<Object>}
   */
  getOpenAIToolsDefinition() {
    return this.getEnabledTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }));
  }

  /**
   * 根据 ID 查找工具
   * @param {string} toolId 
   * @returns {Object|null}
   */
  getTool(toolId) {
    return this.tools.get(toolId) || null;
  }

  /**
   * 清空所有工具
   */
  clearAll() {
    this.tools.clear();
    this.enabledTools.clear();
    
    this.eventBus.emit('ALL_TOOLS_CLEARED');
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.ToolRegistry = ToolRegistry;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToolRegistry;
}
