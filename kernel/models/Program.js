/**
 * Program - 程序定义
 *
 * 类似操作系统中的"可执行文件"，是一个可复用的 AI 工作单元定义。
 *
 * 职责：
 * - 声明所需权限（capabilities）
 * - 定义系统提示（instructions）
 * - 声明可用工具集
 * - 定义资源限制（maxTokens, timeout）
 *
 * 设计原则：
 * - Program 是不可变的定义（创建后不修改运行参数）
 * - 一个 Program 可以被 spawn 多个 Process
 * - Program 不持有运行时状态
 */

class Program {
  /**
   * @param {Object} options
   * @param {string} options.name - 程序名称（唯一标识）
   * @param {string} [options.description] - 描述
   * @param {string[]} [options.capabilities] - 所需权限列表
   * @param {string} [options.instructions] - 系统提示
   * @param {number} [options.maxTokens] - 输入 token 预算
   * @param {number} [options.timeout] - 超时（ms）
   * @param {Object} [options.config] - 附加配置
   */
  constructor({
    name,
    description = '',
    capabilities = [],
    instructions = '',
    maxTokens = 4096,
    timeout = 120000,
    config = {}
  } = {}) {
    if (!name) {
      throw new Error('[Program] name is required');
    }

    /** @type {string} */
    this.id = `prog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    /** @type {string} */
    this.name = name;
    /** @type {string} */
    this.description = description;
    /** @type {string[]} */
    this.capabilities = [...capabilities];
    /** @type {string} */
    this.instructions = instructions;
    /** @type {number} */
    this.maxTokens = maxTokens;
    /** @type {number} */
    this.timeout = timeout;
    /** @type {Object} */
    this.config = config;

    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 检查程序是否需要指定权限
   * @param {string} capability
   * @returns {boolean}
   */
  requiresCapability(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * 序列化为 JSON（用于持久化）
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      instructions: this.instructions,
      maxTokens: this.maxTokens,
      timeout: this.timeout,
      config: this.config,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * 从 JSON 反序列化
   * @param {Object} json
   * @returns {Program}
   */
  static fromJSON(json) {
    return new Program(json);
  }
}

// ==================== 预定义程序 ====================

/**
 * 默认聊天程序 — 基础对话，无特殊权限
 */
Program.CHAT_DEFAULT = new Program({
  name: 'chat_default',
  description: '默认聊天程序，基础对话能力',
  capabilities: [],
  instructions: '',
  timeout: 120000
});

/**
 * 工具执行程序 — 允许调用所有工具
 */
Program.TOOL_EXECUTOR = new Program({
  name: 'tool_executor',
  description: '工具执行程序，可调用所有已注册工具',
  capabilities: ['tool'],
  instructions: '你是一个有工具调用能力的助手。根据用户需求使用合适的工具完成任务。',
  timeout: 300000
});

/**
 * 脚本管理程序 — 脚本安装与管理
 */
Program.SCRIPT_MANAGER = new Program({
  name: 'script_manager',
  description: '脚本管理程序，可安装和管理用户脚本',
  capabilities: ['tool', 'user_script'],
  instructions: '你是用户脚本管理助手。帮助用户安装、启用、禁用和管理 Tampermonkey 脚本。',
  timeout: 60000
});

// 导出
if (typeof window !== 'undefined') {
  window.Program = Program;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Program;
}