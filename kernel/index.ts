/**
 * Kernel — ES Module 统一入口
 *
 * 所有内核模块通过 import/export 组织，可在任何 ES module 环境运行。
 */

// ==================== 内核核心 ====================
import { IPC } from './IPC.js';
import { KernelEvents } from './Events.js';
import { ToolsManager } from './ToolsManager.js';
import { CapabilityManager, CapabilityError } from './CapabilityManager.js';
import { Kernel } from './Kernel.js';
import { Bootloader } from './Bootloader.js';
export { IPC, KernelEvents, ToolsManager, CapabilityManager, CapabilityError, Kernel, Bootloader };

// ==================== 数据模型 ====================
import { BaseModel } from './models/BaseModel.js';
import { Tool, ToolCall, ToolResult } from './models/Tool.js';
import { TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ThinkingConfig, MediaContent, MessageStructure, MessagesRequest } from './models/MessageContent.js';
import { Message, Role } from './models/Message.js';
import { Session } from './models/Session.js';
import { Settings } from './models/Settings.js';
import { Model } from './models/Model.js';
import { UserScript } from './models/Scripts.js';
import { Process } from './models/Process.js';
export { BaseModel, Tool, ToolCall, ToolResult, TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, MediaContent, MessageStructure, Message, Role, Session, Settings, Model, Process };
export type { UserScript, ThinkingConfig, MessagesRequest };

// ==================== 服务接口 ====================
import { IStorageManager } from './services/IStorageManager.js';
import { BaseSettings } from './services/ISettings.js';
import { BaseProviderAPIService } from './services/IProviderAPIService.js';
import { BaseScriptsManager } from './services/IScriptsManager.js';
import { BaseSessionManager } from './services/ISessionManager.js';
export { IStorageManager, BaseSettings, BaseProviderAPIService, BaseScriptsManager, BaseSessionManager };

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
import { ConsoleLogger } from './services/ConsoleLogger.js';
import { Log } from './services/Log.js';
export { SessionManager, SettingsManager, ScriptsManager, ProcessManager, ProviderFactory, ConsoleLogger, Log };

// ==================== 内核程序 ====================
import { ChatProgram } from './programs/ChatProgram.js';
export { ChatProgram };

// ==================== 版本信息 ====================
// __VERSION__ 由 vite.config.ts 从 package.json 注入（唯一版本源）
declare const __VERSION__: string;
export const VERSION = __VERSION__;
export const CODENAME = 'Microkernel-Esm';