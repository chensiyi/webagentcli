/**
 * BaseModel - 核心模型基类
 * 
 * 职责：
 * 1. 定义统一的序列化接口 (toJSON, fromJSON)
 * 2. 提供通用的 ID 生成等基础功能
 * 3. 规范构造函数模式（接收 options 对象）
 */

class BaseModel {
  constructor(options = {}) {
    if (new.target === BaseModel) {
      throw new Error('Cannot instantiate BaseModel directly');
    }
    
    // 所有模型通常都有一个 ID 和时间戳
    this.id = options.id || this.generateId();
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
  }

  /**
   * 生成唯一 ID（子类可覆盖）
   */
  generateId() {
    const prefix = this.constructor.name.toLowerCase();
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新时间戳
   */
  touch() {
    this.updatedAt = Date.now();
  }

  /**
   * 转换为纯 JSON 对象（子类应覆盖以包含特定字段）
   */
  toJSON() {
    return {
      id: this.id,
      ...(this.createdAt && { createdAt: this.createdAt }),
      ...(this.updatedAt && { updatedAt: this.updatedAt })
    };
  }

  /**
   * 从 JSON 对象创建实例（抽象方法，由子类实现）
   */
  static fromJSON(data) {
    throw new Error('static fromJSON() must be implemented by subclass');
  }
}

// 导出到全局
window.BaseModel = BaseModel;
