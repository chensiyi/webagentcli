/**
 * UserScript — 用户脚本数据原型
 *
 * 纯数据模型。脚本集合的增删改由 ScriptsManager 统一管理。
 */

export interface UserScript {
  id: string;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
