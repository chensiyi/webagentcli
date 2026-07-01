/**
 * Kernel - ES Module 统一入口
 *
 * 所有内核模块通过 import/export 组织，可在任何 ES module 环境运行。
 * Vite 会将此入口打包为 Chrome 扩展兼容的 IIFE。
 */

// ==================== 内核核心 ====================
import { KernelLog } from './KernelLog.js';
import { IPC } from './IPC.js';
import { KernelEvents } from './Events.js';
import { ToolRegistry } from './ToolRegistry.js';
import { CapabilityManager, CapabilityError } from './CapabilityManager.js';
import { Kernel } from './Kernel.js';
import { Bootloader } from './Bootloader.js';
export { KernelLog, IPC, KernelEvents, ToolRegistry, CapabilityManager, CapabilityError, Kernel, Bootloader };

// ==================== 数据模型 ====================
import { BaseModel } from './models/BaseModel.js';
import { ToolDefinition } from './models/ToolDefinition.js';
import { ToolCall } from './models/ToolCall.js';
import { ToolResult } from './models/ToolResult.js';
import { TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ThinkingConfig, MediaContent, MessageStructure, MessagesRequest } from './models/MessageContent.js';
import { Message, Role } from './models/Message.js';
import { Session } from './models/Session.js';
import { Settings } from './models/Settings.js';
import { Model } from './models/Model.js';
import { UserScript } from './models/Scripts.js';
import { Process } from './models/Process.js';
export { BaseModel, ToolDefinition, ToolCall, ToolResult, TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ThinkingConfig, MediaContent, MessageStructure, MessagesRequest, Message, Role, Session, Settings, Model, UserScript, Process };

// ==================== 服务接口 ====================
import { IStorageManager } from './services/IStorageManager.js';
import { ISettings } from './services/ISettings.js';
import { IProviderAPIService } from './services/IProviderAPIService.js';
import { IScriptsManager } from './services/IScriptsManager.js';
import { ISessionManager } from './services/ISessionManager.js';
import { IToolService } from './services/IToolService.js';
export { IStorageManager, ISettings, IProviderAPIService, IScriptsManager, ISessionManager, IToolService };

// ==================== Provider 实现 ====================
import OpenAIService from './services/ProviderAPIServices/OpenAIService.js';
import OpenRouterService from './services/ProviderAPIServices/OpenRouterService.js';
import LMStudioService from './services/ProviderAPIServices/LMStudioService.js';
export { OpenAIService, OpenRouterService, LMStudioService };

// ==================== 服务实现 ====================
import { SessionManager } from './services/SessionManager.js';
import { SettingsManager } from './services/SettingsManager.js';
import { ScriptsManager } from './services/ScriptsManager.js';
import { ProcessManager } from './services/ProcessManager.js';
import { ProviderFactory } from './services/ProviderFactory.js';
export { SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory };

// ==================== 内核程序 ====================
import { ChatProgram } from './programs/ChatProgram.js';
export { ChatProgram };

// ==================== 版本信息 ====================
// __VERSION__ 由 vite.config.ts 从 package.json 注入（唯一版本源）
declare const __VERSION__: string;
export const VERSION = __VERSION__;
export const CODENAME = 'Microkernel-Esm';

// ==================== 运行时：Shell 壳层桥接（将核心接口挂到 window） ====================
// 说明：此块是 Kernel 与 Shell(JS) 的边界桥接，仅在此入口处执行，不属于内核内部依赖。
// Shell 壳层尚未迁移到 TS，需通过 window.X 访问 Kernel 类。Shell 迁移完成后可移除。
const _sidepanelShim = [
  ['IStorageManager', IStorageManager],
  ['ISettings', ISettings],
  ['IProviderAPIService', IProviderAPIService],
  ['IScriptsManager', IScriptsManager],
  ['ISessionManager', ISessionManager],
  ['IToolService', IToolService],
  ['OpenAIService', OpenAIService],
  ['OpenRouterService', OpenRouterService],
  ['LMStudioService', LMStudioService],
  ['KernelLog', KernelLog],
  ['IPC', IPC],
  ['ToolRegistry', ToolRegistry],
  ['CapabilityManager', CapabilityManager],
  ['Kernel', Kernel],
  ['Bootloader', Bootloader],
  ['ChatProgram', ChatProgram],
  ['ProviderFactory', ProviderFactory],
  ['SettingsManager', SettingsManager],
  ['SessionManager', SessionManager],
  ['ScriptsManager', ScriptsManager],
  ['ProcessManager', ProcessManager],
];
for (const [name, value] of _sidepanelShim) {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    if (w[name] === undefined) w[name] = value;
  }
}