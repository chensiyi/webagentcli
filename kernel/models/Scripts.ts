/**
 * UserScript — 用户脚本数据原型
 *
 * 纯数据模型。脚本集合的增删改由 ScriptsManager 统一管理。
 */
import { BaseModel } from './BaseModel';

export interface UserScript extends BaseModel {
  code: string;
  enabled: boolean;
  name?: string;
  namespace?: string;
  version?: string;
  description?: string;
  author?: string;
  match?: string[];
  grant?: string[];
}
