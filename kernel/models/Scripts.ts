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
  /** @run-at 原始值（如 'document-end'），注册时由 syncRegisteredScripts 经 RUN_AT_MAP 转为 chrome runAt */
  runAt?: string;
  icon?: string;
  require?: string[];
  resource?: string[];
}
