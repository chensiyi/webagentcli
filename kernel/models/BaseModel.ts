/**
 * BaseModel - 核心模型基类
 * 
 * 职责：
 * 1. 定义统一的序列化接口 (toJSON, fromJSON)
 * 2. 提供通用的 ID 生成等基础功能
 * 3. 规范构造函数模式（接收 options 对象）
 */

export class BaseModel {
  id: string;
  createdAt: number;
  updatedAt: number;

  constructor(options: Record<string, unknown> = {}) {
    if (new.target === BaseModel) throw new Error('Cannot instantiate BaseModel directly');
    this.id = (options.id as string) || this.generateId();
    this.createdAt = (options.createdAt as number) || Date.now();
    this.updatedAt = (options.updatedAt as number) || this.createdAt;
  }

  generateId(): string {
    const prefix = this.constructor.name.toLowerCase();
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  touch(): void { this.updatedAt = Date.now(); }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      ...(this.createdAt && { createdAt: this.createdAt }),
      ...(this.updatedAt && { updatedAt: this.updatedAt })
    };
  }

  static fromJSON(data: Record<string, unknown>): unknown { throw new Error('static fromJSON() must be implemented by subclass'); }
}