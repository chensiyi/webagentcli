/**
 * Kernel - 统一导出入口
 * 
 * 使用方式：
 *   // Node.js
 *   const { Kernel, IPC, KernelLog, ... } = require('./kernel');
 *   
 *   // Browser (Script)
 *   <script src="kernel/index.js"></script>
 *   const { Kernel, IPC, ... } = window.Kernel;
 * 
 *   // Browser (ES Module)
 *   import { Kernel, IPC } from './kernel/index.js';
 */

(function(global) {
  'use strict';

  // ==================== 内核核心 ====================
  if (typeof require === 'function') {
    // Node.js 环境
    global.Kernel = require('./Kernel.js');
    global.IPC = require('./IPC.js').IPC;
    global.IPCChannel = require('./IPC.js').IPCChannel;
    global.KernelLog = require('./KernelLog.js');
    global.ToolRegistry = require('./ToolRegistry.js');
    global.CapabilityManager = require('./CapabilityManager.js').CapabilityManager;
    global.CapabilityError = require('./CapabilityManager.js').CapabilityError;
    global.Bootloader = require('./Bootloader.js');
    global.KernelEvents = require('./Events.js').KernelEvents;
    global.KernelMessageFormats = require('./Events.js').KernelMessageFormats;
  } else {
    // 浏览器环境 - 从 window 读取（按 sidepanel.html 加载顺序已注入）
    // 这些类由各自的 .js 文件通过 window.X = X 暴露
  }

  // 内核版本
  global.KERNEL_VERSION = '0.4.0';
  global.KERNEL_CODENAME = 'Microkernel';

  // 导出命名空间
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      Kernel: global.Kernel,
      IPC: global.IPC,
      IPCChannel: global.IPCChannel,
      KernelLog: global.KernelLog,
      ToolRegistry: global.ToolRegistry,
      CapabilityManager: global.CapabilityManager,
      CapabilityError: global.CapabilityError,
      Bootloader: global.Bootloader,
      KernelEvents: global.KernelEvents,
      KernelMessageFormats: global.KernelMessageFormats,
      VERSION: global.KERNEL_VERSION,
      CODENAME: global.KERNEL_CODENAME
    };
  }

})(typeof window !== 'undefined' ? window : global);