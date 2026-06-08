/**
 * ManageUserScriptsTool - 用户脚本管理工具（供 LLM 调用）
 *
 * 暴露给 AI 的原子能力，用于编辑"用户脚本"页签下的脚本库：
 *   - list    ：列出所有已安装的脚本（id、name、version、enabled、match 等元数据）
 *   - read    ：根据 id 读取指定脚本的完整代码
 *   - write   ：新建或更新一个脚本（同时刷新元数据）
 *   - run     ：在当前活动 tab 中执行指定脚本的代码并返回结果
 *   - enable  ：启用指定脚本（写入存储的 enabled=true）
 *   - disable ：禁用指定脚本（写入存储的 enabled=false）
 *
 * 设计要点：
 *   1. 复用 ScriptsModel 的解析与持久化能力（Tampermonkey 头部解析）
 *   2. write 语义：
 *        - 未提供 id  → 新建脚本（生成 id）
 *        - 提供 id     → 原地更新该脚本
 *        - 已提供 enabled 时，可一并切换启用状态
 *   3. run 通过 chrome.scripting.executeScript 注入到 MAIN 世界，与 RunUserScriptTool
 *      使用相同通道；context.tabId 由调用方传入（ChatController 注入）
 *   4. 错误以 throw 形式抛出，由 IToolService.invoke 统一包装为 ToolResult
 */
class ManageUserScriptsTool extends window.IToolService {
  constructor() {
    super();

    const definition = new window.ToolDefinition({
      name: 'manage_user_scripts',
      description:
        '管理用户脚本。支持六个操作：' +
        'list 列出所有已安装的脚本；read 根据 id 读取脚本完整代码；' +
        'write 新建或更新脚本（未传 id 则新建，传 id 则覆盖更新）；' +
        'run 在当前活动 tab 中执行指定 id 的脚本代码并返回结果；' +
        'enable / disable 切换脚本启用状态。' +
        '仅编辑"用户脚本"页签下由用户安装的 Tampermonkey 风格脚本。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read', 'write', 'run', 'enable', 'disable'],
            description: '要执行的操作类型'
          },
          id: {
            type: 'string',
            description:
              '脚本 ID。read/run/enable/disable 必填；write 可选（缺省时新建，传值时覆盖更新）'
          },
          code: {
            type: 'string',
            description:
              '脚本完整代码（必须包含 ==UserScript== ... ==/UserScript== 块）。write 时必填'
          },
          enabled: {
            type: 'boolean',
            description: 'write 时可选；同时设置脚本启用状态'
          }
        },
        required: ['action']
      },
      requiresApproval: true
    });

    const handler = async (args, context = {}) => {
      const action = args && args.action;
      if (!action) throw new Error('action is required');

      // ScriptsModel 是 chrome.storage 异步接口，封装为单例
      const model = window.ScriptsModel;
      if (!model) throw new Error('ScriptsModel is not available');

      switch (action) {
        case 'list':
          return await this._list(model);

        case 'read':
          return await this._read(model, args.id);

        case 'write':
          return await this._write(model, args);

        case 'run':
          return await this._run(model, args.id, context);

        case 'enable':
          return await this._setEnabled(model, args.id, true);

        case 'disable':
          return await this._setEnabled(model, args.id, false);

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    };

    this.register(definition, handler);
  }

  /**
   * 列出全部脚本
   * @returns {Promise<{count:number, scripts:Array}>}
   */
  async _list(model) {
    const scripts = await model.getAll();
    // 输出元数据列表，避免把整段 code 全部回灌给 LLM（节省 token）
    const summary = (scripts || []).map(s => ({
      id: s.id,
      name: s.name,
      namespace: s.namespace || '',
      version: s.version || '',
      description: s.description || '',
      author: s.author || '',
      match: Array.isArray(s.match) ? s.match : [],
      grant: Array.isArray(s.grant) ? s.grant : [],
      enabled: s.enabled !== false,
      createdAt: s.createdAt || null,
      updatedAt: s.updatedAt || null
    }));
    return { count: summary.length, scripts: summary };
  }

  /**
   * 读取单个脚本的完整代码
   */
  async _read(model, id) {
    if (!id || typeof id !== 'string') {
      throw new Error('read: id is required');
    }
    const script = await model.getById(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    return {
      id: script.id,
      name: script.name,
      version: script.version || '',
      description: script.description || '',
      author: script.author || '',
      match: Array.isArray(script.match) ? script.match : [],
      grant: Array.isArray(script.grant) ? script.grant : [],
      enabled: script.enabled !== false,
      code: script.code || '',
      createdAt: script.createdAt || null,
      updatedAt: script.updatedAt || null
    };
  }

  /**
   * 写入脚本：新建或更新
   */
  async _write(model, args) {
    const code = args && args.code;
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw new Error('write: code is required');
    }

    // 复用 ScriptsModel 的头部解析能力，提前做格式校验（parseMetadata 内部会抛错）
    if (typeof model.parseMetadata !== 'function') {
      throw new Error('ScriptsModel.parseMetadata is not available');
    }
    model.parseMetadata(code);

    const id = args.id;
    let script;

    if (id) {
      // 路径 A：覆盖更新
      const existing = await model.getById(id);
      if (!existing) throw new Error(`write: script not found, id=${id}`);
      script = await model.updateCode(id, code);
      if (typeof args.enabled === 'boolean' && args.enabled !== script.enabled) {
        script = await model.toggle(id, args.enabled);
      }
    } else {
      // 路径 B：新建
      script = await model.install(code);
      if (typeof args.enabled === 'boolean' && args.enabled !== script.enabled) {
        script = await model.toggle(script.id, args.enabled);
      }
    }

    return {
      ok: true,
      action: id ? 'updated' : 'created',
      id: script.id,
      name: script.name,
      version: script.version || '',
      match: Array.isArray(script.match) ? script.match : [],
      enabled: script.enabled !== false
    };
  }

  /**
   * 在目标 tab 中执行指定 id 的脚本代码
   * @param {Object} model - ScriptsModel
   * @param {string} id   - 脚本 ID
   * @param {Object} context - { tabId, ... }  调用上下文，需由调用方注入
   */
  async _run(model, id, context) {
    if (!id || typeof id !== 'string') {
      throw new Error('run: id is required');
    }
    if (!context || !context.tabId) {
      throw new Error('run: tabId is required in context');
    }
    if (!chrome || !chrome.scripting) {
      throw new Error('chrome.scripting API not available (check permissions)');
    }

    const script = await model.getById(id);
    if (!script) throw new Error(`run: script not found, id=${id}`);
    if (script.enabled === false) {
      // 不阻断运行（read 模式同样允许），但提示给调用方
      console.warn(`[ManageUserScriptsTool] Running disabled script: ${id}`);
    }
    const code = script.code || '';
    if (!code.trim()) {
      throw new Error(`run: script ${id} has no code`);
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: context.tabId },
      world: 'MAIN',
      func: (userCode) => {
        try {
          return new Function(userCode)();
        } catch (e) {
          return { _error: e.message, _stack: e.stack };
        }
      },
      args: [code]
    });

    const result = results && results[0] && results[0].result;
    if (result && typeof result === 'object' && result._error) {
      throw new Error(`脚本执行失败: ${result._error}`);
    }
    return {
      ok: true,
      id: script.id,
      name: script.name,
      tabId: context.tabId,
      result: result === undefined ? null : result
    };
  }

  /**
   * 切换脚本启用状态
   * @param {Object} model - ScriptsModel
   * @param {string} id   - 脚本 ID
   * @param {boolean} enabled - 目标状态
   */
  async _setEnabled(model, id, enabled) {
    if (!id || typeof id !== 'string') {
      throw new Error(`${enabled ? 'enable' : 'disable'}: id is required`);
    }
    const existing = await model.getById(id);
    if (!existing) throw new Error(`Script not found: ${id}`);

    // 状态已符合时直接返回，避免无谓写入
    if (existing.enabled === enabled) {
      return {
        ok: true,
        changed: false,
        id,
        name: existing.name,
        enabled
      };
    }
    const updated = await model.toggle(id, enabled);
    return {
      ok: true,
      changed: true,
      id: updated.id,
      name: updated.name,
      enabled: updated.enabled !== false
    };
  }
}

if (typeof window !== 'undefined') {
  window.ManageUserScriptsTool = ManageUserScriptsTool;
}
