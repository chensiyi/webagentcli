/**
 * Kernel - ES Module 统一入口
 *
 * 所有内核模块通过 import/export 组织，可在任何 ES module 环境运行。
 * Vite 会将此入口打包为 Chrome 扩展兼容的 IIFE。
 */

// ==================== 内核核心 ====================
export { KernelLog } from './KernelLog.js';
export { IPC, IPCChannel } from './IPC.js';
export { KernelEvents, KernelMessageFormats, EventValidator } from './Events.js';
export { ToolRegistry } from './ToolRegistry.js';
export { CapabilityManager, CapabilityError } from './CapabilityManager.js';
export { Kernel } from './Kernel.js';
export { Bootloader } from './Bootloader.js';

// ==================== 数据模型 ====================
export { BaseModel } from './models/BaseModel.js';
export { ToolDefinition } from './models/ToolDefinition.js';
export { ToolCall } from './models/ToolCall.js';
export { ToolResult } from './models/ToolResult.js';
export { TextBlock, ImageBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ThinkingConfig, MediaContent, MessageStructure, MessagesRequest } from './models/MessageContent.js';
export { Message, Role } from './models/Message.js';
export { Session } from './models/Session.js';
export { Settings } from './models/Settings.js';
export { Model } from './models/Model.js';
export { ScriptsModel } from './models/Scripts.js';
export { Program } from './models/Program.js';
export { Process } from './models/Process.js';

// ==================== 服务接口 ====================
export { IStorageManager } from './services/IStorageManager.js';
export { IAppSettings } from './services/IAppSettings.js';
export { IModelManager } from './services/IModelManager.js';
export { IProviderAPIService } from './services/IProviderAPIService.js';
export { IScriptsManager } from './services/IScriptsManager.js';
export { ISessionManager } from './services/ISessionManager.js';
export { IToolService } from './services/IToolService.js';

// ==================== Provider 实现 ====================
export { default as OpenAIService } from './services/ProviderAPIServices/OpenAIService.js';

// ==================== 服务实现 ====================
export { SessionManager } from './services/SessionManager.js';
export { SettingsManager } from './services/SettingsManager.js';
export { ScriptsManager } from './services/ScriptsManager.js';
export { ModelManager } from './services/ModelManager.js';
export { ProcessManager } from './services/ProcessManager.js';
export { ServiceCenter } from './services/ServiceCenter.js';

// ==================== 内核程序 ====================
export { default as ChatProgram } from './programs/ChatProgram.js';

// ==================== 版本信息 ====================
export const VERSION = '0.5.2';
export const CODENAME = 'Microkernel-Esm';