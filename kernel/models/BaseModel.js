/**
 * BaseModel - 核心模型基类
 * 
 * 职责：
 * 1. 定义统一的序列化接口 (toJSON, fromJSON)
 * 2. 提供通用的 ID 生成等基础功能
 * 3. 规范构造函数模式（接收 options 对象）
 */

export class BaseModel {
  constructor(options = {}) {
    if (new.target === BaseModel) throw new Error('Cannot instantiate BaseModel directly');
    this.id = options.id || this.generateId();
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
  }

  generateId() {
    const prefix = this.constructor.name.toLowerCase();
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  touch() { this.updatedAt = Date.now(); }

  toJSON() {
    return {
      id: this.id,
      ...(this.createdAt && { createdAt: this.createdAt }),
      ...(this.updatedAt && { updatedAt: this.updatedAt })
    };
  }

  static fromJSON(data) { throw new Error('static fromJSON() must be implemented by subclass'); }
}

export default BaseModel;