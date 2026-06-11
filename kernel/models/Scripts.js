/**
 * Scripts Model - 用户脚本数据模型
 * 管理用户脚本的存储和解析
 */

class ScriptsModel {
  /**
   * @param {IStorage} [storage] - 存储适配器（可选，必须实现 IStorage 接口）
   */
  constructor(storage = null) {
    this.storageKey = 'user_scripts';
    this.storage = storage;
  }

  /**
   * 设置存储适配器（运行时注入）
   * @param {IStorage} storage
   */
  setStorage(storage) {
    this.storage = storage;
  }

  /**
   * 解析 Tampermonkey 脚本元数据
   * @param {string} code - 脚本代码
   * @returns {Object} 元数据
   */
  parseMetadata(code) {
    const metadata = {
      name: '',
      namespace: '',
      version: '',
      description: '',
      author: '',
      match: [],
      grant: []
    };

    // 提取 ==UserScript== 块
    const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!match) {
      throw new Error('无效的 UserScript 格式，缺少 ==UserScript== 标记');
    }

    const block = match[1];
    
    // 解析各个字段
    const nameMatch = block.match(/@name\s+(.+)/);
    if (nameMatch) metadata.name = nameMatch[1].trim();

    const namespaceMatch = block.match(/@namespace\s+(.+)/);
    if (namespaceMatch) metadata.namespace = namespaceMatch[1].trim();

    const versionMatch = block.match(/@version\s+(.+)/);
    if (versionMatch) metadata.version = versionMatch[1].trim();

    const descMatch = block.match(/@description\s+(.+)/);
    if (descMatch) metadata.description = descMatch[1].trim();

    const authorMatch = block.match(/@author\s+(.+)/);
    if (authorMatch) metadata.author = authorMatch[1].trim();

    // 解析多个 match 规则
    const matchRules = [];
    const matchRegex = /@match\s+(.+)/g;
    let m;
    while ((m = matchRegex.exec(block)) !== null) {
      matchRules.push(m[1].trim());
    }
    metadata.match = matchRules;

    // 解析 grant 权限
    const grantPermissions = [];
    const grantRegex = /@grant\s+(.+)/g;
    let g;
    while ((g = grantRegex.exec(block)) !== null) {
      grantPermissions.push(g[1].trim());
    }
    metadata.grant = grantPermissions;

    // 如果没有名称，尝试从文件名提取
    if (!metadata.name) {
      metadata.name = '未命名脚本';
    }

    return metadata;
  }

  /**
   * 生成唯一 ID
   * @returns {string}
   */
  generateId() {
    return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取所有脚本
   * @returns {Promise<Array>} 脚本列表
   */
  async getAll() {
    if (!this.storage || typeof this.storage.get !== 'function') {
      console.warn('[ScriptsModel] No storage adapter provided');
      return [];
    }
    
    try {
      const result = await this.storage.get(this.storageKey);
      return result || [];
    } catch (error) {
      console.error('[ScriptsModel] Failed to get scripts:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取脚本
   * @param {string} id - 脚本 ID
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const scripts = await this.getAll();
    return scripts.find(s => s.id === id) || null;
  }

  /**
   * 保存脚本列表
   * @param {Array} scripts - 脚本列表
   * @returns {Promise<void>}
   */
  async save(scripts) {
    if (!this.storage || typeof this.storage.set !== 'function') {
      console.warn('[ScriptsModel] No storage adapter provided, save skipped');
      return;
    }
    
    try {
      await this.storage.set(this.storageKey, scripts);
    } catch (error) {
      console.error('[ScriptsModel] Failed to save scripts:', error);
      throw error;
    }
  }

  /**
   * 安装脚本
   * @param {string} code - 脚本代码
   * @returns {Promise<Object>} 安装的脚本信息
   */
  async install(code) {
    const metadata = this.parseMetadata(code);
    const id = this.generateId();
    
    const script = {
      id,
      name: metadata.name,
      namespace: metadata.namespace,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      match: metadata.match,
      grant: metadata.grant,
      enabled: true,
      code,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const scripts = await this.getAll();
    scripts.push(script);
    await this.save(scripts);

    return script;
  }

  /**
   * 更新脚本代码
   * @param {string} id - 脚本 ID
   * @param {string} code - 新代码
   * @returns {Promise<Object>} 更新后的脚本
   */
  async updateCode(id, code) {
    const scripts = await this.getAll();
    const index = scripts.findIndex(s => s.id === id);
    
    if (index === -1) {
      throw new Error('脚本不存在');
    }

    const metadata = this.parseMetadata(code);
    scripts[index] = {
      ...scripts[index],
      name: metadata.name,
      namespace: metadata.namespace,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      match: metadata.match,
      grant: metadata.grant,
      code,
      updatedAt: Date.now()
    };

    await this.save(scripts);
    return scripts[index];
  }

  /**
   * 切换脚本启用状态
   * @param {string} id - 脚本 ID
   * @param {boolean} enabled - 启用状态
   * @returns {Promise<Object>} 更新后的脚本
   */
  async toggle(id, enabled) {
    const scripts = await this.getAll();
    const index = scripts.findIndex(s => s.id === id);
    
    if (index === -1) {
      throw new Error('脚本不存在');
    }

    scripts[index].enabled = enabled;
    scripts[index].updatedAt = Date.now();

    await this.save(scripts);
    return scripts[index];
  }

  /**
   * 删除脚本
   * @param {string} id - 脚本 ID
   * @returns {Promise<void>}
   */
  async remove(id) {
    const scripts = await this.getAll();
    const filtered = scripts.filter(s => s.id !== id);
    await this.save(filtered);
  }
}

// 导出类，不再创建全局单例
if (typeof window !== 'undefined') {
  window.ScriptsModel = ScriptsModel;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScriptsModel;
}
