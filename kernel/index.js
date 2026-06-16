/**
 * Kernel - 统一导出入口 & 命名空间
 * 
 * 全局命名空间 webagent，所有内核模块挂载在此。
 *
 * 使用方式：
 *   // Kernel 核心
 *   webagent.Kernel
 *   webagent.IPC
 *   
 *   // 数据模型
 *   webagent.models.Message
 *   webagent.models.Session
 *   
 *   // 服务
 *   webagent.services.SessionManager
 *   webagent.services.SettingsManager
 *   
 *   // 程序
 *   webagent.programs.ChatProgram
 * 
 *   // 浏览器：load kernel/index.js 后自动可用
 *   // Node.js：const webagent = require('./kernel')
 */
(function(global) {
  'use strict';

  // ==================== 创建命名空间 ====================

  global.webagent = global.webagent || {};

  // 子命名空间
  const webagent = global.webagent;
  webagent.models = webagent.models || {};
  webagent.services = webagent.services || {};
  webagent.providers = webagent.providers || {};
  webagent.programs = webagent.programs || {};
  webagent.tools = webagent.tools || {};

  // ==================== 内核核心引用 ====================

  if (typeof require === 'function') {
    // Node.js 环境 - 从模块加载
    webagent.Kernel = require('./Kernel.js');
    webagent.IPC = require('./IPC.js').IPC;
    webagent.IPCChannel = require('./IPC.js').IPCChannel;
    webagent.KernelLog = require('./KernelLog.js');
    webagent.ToolRegistry = require('./ToolRegistry.js');
    webagent.CapabilityManager = require('./CapabilityManager.js').CapabilityManager;
    webagent.CapabilityError = require('./CapabilityManager.js').CapabilityError;
    webagent.Bootloader = require('./Bootloader.js');
    webagent.Events = require('./Events.js').KernelEvents;
    webagent.MessageFormats = require('./Events.js').KernelMessageFormats;
  } else {
    // 浏览器环境 - 从 window 全局引用（由各自的 .js 通过 window.X = X 暴露）
    webagent.Kernel = global.Kernel;
    webagent.IPC = global.IPC;
    webagent.KernelLog = global.KernelLog;
    webagent.ToolRegistry = global.ToolRegistry;
    webagent.CapabilityManager = global.CapabilityManager;
    webagent.Bootloader = global.Bootloader;
    webagent.Events = global.KernelEvents;
  }

  // 内核版本
  webagent.VERSION = '0.4.0';
  webagent.CODENAME = 'Microkernel';

  // ==================== Node.js 导出 ====================

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = webagent;
  }

})(typeof window !== 'undefined' ? window : global);