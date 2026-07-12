/**
 * UserScript — 用户脚本数据原型
 *
 * 纯数据模型。脚本集合的增删改由 ScriptsManager 统一管理。
 */
import { BaseModel } from './BaseModel';

/**
 * 脚本声明的工具参数（@tool.param.<name> <type> [desc]）
 */
export interface ScriptToolParam {
  name: string;
  type: string;
  description?: string;
  /** @tool.enum.<name> a|b|c 提供的枚举约束 */
  enum?: string[];
}

/**
 * 脚本经 @tool 声明为 AI 工具时的元信息。
 * 由 ScriptsManager.parseMetadata 解析，落盘到 UserScript.toolMeta。
 */
export interface ScriptToolMeta {
  /** @tool 标识存在则为 true */
  isTool: boolean;
  /** @tool.name，缺省时由脚本 @name slug 化推导 */
  name?: string;
  /** @tool.description，缺省时用脚本 @description */
  description?: string;
  /** @tool.danger 标识存在则危险工具需确认 */
  danger?: boolean;
  /** 参数列表（@tool.param.*） */
  params: ScriptToolParam[];
}

export interface UserScript extends BaseModel {
  code: string;
  enabled: boolean;
  name?: string;
  namespace?: string;
  version?: string;
  description?: string;
  author?: string;
  /** @match 匹配规则（URL 模式），注册到 chrome.userScripts.matches */
  match?: string[];
  /** @include 包含规则（glob），注册到 chrome.userScripts.includeGlobs */
  include?: string[];
  /** @exclude 排除规则（URL 模式），注册到 chrome.userScripts.excludeMatches */
  exclude?: string[];
  grant?: string[];
  /** @run-at 原始值（如 'document-end'），注册时由 syncRegisteredScripts 经 RUN_AT_MAP 转为 chrome runAt */
  runAt?: string;
  icon?: string;
  /** @require 外部库 URL 列表（安装时已内联拉取，仅作溯源/重装用） */
  require?: string[];
  /** @require 拉取并拼接后的库代码，注册时由 wrapWithGM 前置到用户代码前 */
  requireCode?: string;
  /** @resource name→url 列表（安装时已拉取内容存于 resources） */
  resource?: { name: string; url: string }[];
  /** @resource name→已拉取文本内容，供 GM_getResourceText / GM_getResourceURL 读取 */
  resources?: Record<string, string>;
  /** @tool 声明解析结果（null 表示非工具脚本），用于 P2 自动注册为 AI 工具 */
  toolMeta?: ScriptToolMeta | null;
}
