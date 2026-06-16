/**
 * build.js — Kernel 构建脚本
 *
 * 将 kernel/ 下的所有源文件按依赖顺序合并为单个 bundle 文件。
 * 源码编写时不需要考虑运行环境（不写 window.XXX / module.exports），
 * 构建时自动处理命名空间注册。
 *
 * 用法：node build.js
 * 输出：dist/kernel.bundle.js
 */

const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================

/**
 * 按依赖顺序列出所有要打包的文件
 * 规则：被依赖的文件必须在前面
 */
const KERNEL_FILES = [
  // 内核核心
  'kernel/KernelLog.js',
  'kernel/IPC.js',
  'kernel/Events.js',
  'kernel/ToolRegistry.js',
  'kernel/CapabilityManager.js',
  'kernel/Kernel.js',
  'kernel/Bootloader.js',

  // 数据模型（BaseModel 在前，其余按依赖顺序）
  'kernel/models/BaseModel.js',
  'kernel/models/ToolDefinition.js',
  'kernel/models/ToolCall.js',
  'kernel/models/ToolResult.js',
  'kernel/models/MessageContent.js',
  'kernel/models/Message.js',
  'kernel/models/Session.js',
  'kernel/models/Settings.js',
  'kernel/models/Model.js',
  'kernel/models/Scripts.js',
  'kernel/models/Program.js',
  'kernel/models/Process.js',

  // 服务接口（在实现之前）
  'kernel/services/IStorageManager.js',
  'kernel/services/IAppSettings.js',
  'kernel/services/IModelManager.js',
  'kernel/services/IProviderAPIService.js',
  'kernel/services/IScriptsManager.js',
  'kernel/services/ISessionManager.js',
  'kernel/services/IToolService.js',

  // Provider 实现
  'kernel/services/ProviderAPIServices/OpenAIService.js',
  'kernel/services/ProviderAPIServices/OpenRouterService.js',
  'kernel/services/ProviderAPIServices/LMStudioService.js',

  // 服务实现
  'kernel/services/SessionManager.js',
  'kernel/services/SettingsManager.js',
  'kernel/services/ScriptsManager.js',
  'kernel/services/ModelManager.js',
  'kernel/services/ProcessManager.js',
  'kernel/services/ServiceCenter.js',

  // 内核程序（加载顺序依赖内核模块）
  'kernel/programs/ChatProgram.js',
];

/**
 * 每个源文件导出的全局变量名
 * 格式：{ 文件路径（不含 .js 后缀）: [变量名1, 变量名2, ...] }
 *
 * 构建时会在每个文件内容后自动添加：
 *   root.ClassName = ClassName;
 *
 * 如果一个文件导出多个变量（如 IPC.js 导出 IPC + IPCChannel），
 * 则列出所有变量名。
 */
const EXPORTS = {
  'kernel/KernelLog':         ['KernelLog'],
  'kernel/IPC':               ['IPC', 'IPCChannel'],
  'kernel/Events':            ['KernelEvents', 'KernelMessageFormats', 'EventValidator'],
  'kernel/ToolRegistry':      ['ToolRegistry'],
  'kernel/CapabilityManager': ['CapabilityManager', 'CapabilityError'],
  'kernel/Kernel':            ['Kernel'],
  'kernel/Bootloader':        ['Bootloader'],

  'kernel/models/BaseModel':        ['BaseModel'],
  'kernel/models/ToolDefinition':   ['ToolDefinition'],
  'kernel/models/ToolCall':         ['ToolCall'],
  'kernel/models/ToolResult':       ['ToolResult'],
  'kernel/models/MessageContent':   ['MessageContent'],
  'kernel/models/Message':          ['Message', 'Role'],
  'kernel/models/Session':          ['Session'],
  'kernel/models/Settings':         ['Settings'],
  'kernel/models/Model':            ['Model'],
  'kernel/models/Scripts':          ['ScriptsModel'],
  'kernel/models/Program':          ['Program'],
  'kernel/models/Process':          ['Process'],

  'kernel/services/IStorageManager':         ['IStorageManager'],
  'kernel/services/IAppSettings':            ['IAppSettings'],
  'kernel/services/IModelManager':           ['IModelManager'],
  'kernel/services/IProviderAPIService':     ['IProviderAPIService'],
  'kernel/services/IScriptsManager':         ['IScriptsManager'],
  'kernel/services/ISessionManager':         ['ISessionManager'],
  'kernel/services/IToolService':            ['IToolService'],

  'kernel/services/ProviderAPIServices/OpenAIService':      ['OpenAIService'],
  'kernel/services/ProviderAPIServices/OpenRouterService':  ['OpenRouterService'],
  'kernel/services/ProviderAPIServices/LMStudioService':    ['LMStudioService'],

  'kernel/services/SessionManager':    ['SessionManager'],
  'kernel/services/SettingsManager':   ['SettingsManager'],
  'kernel/services/ScriptsManager':    ['ScriptsManager'],
  'kernel/services/ModelManager':      ['ModelManager'],
  'kernel/services/ProcessManager':    ['ProcessManager'],
  'kernel/services/ServiceCenter':     ['ServiceCenter'],

  'kernel/programs/ChatProgram':       ['ChatProgram'],
};

// ==================== 构建逻辑 ====================

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'kernel.bundle.js');

/**
 * 清理源文件：移除导出代码和 window. 前缀
 */
function cleanSource(content, filePath) {
  let cleaned = content;
  
  // 0. 先去除 \r（Windows 换行符），避免影响后面的正则
  cleaned = cleaned.replace(/\r/g, '');

  // 1. 移除直接赋值的 window.X = X 和 window.X.Y.Z = X（如 window.webagent.programs.ChatProgram = ChatProgram）
  // 必须在 window. 前缀剥离之前执行
  cleaned = cleaned.replace(/^\s*window\.[\w.]+\s*=\s*\w+\s*;?\s*$/gm, '');

  // 2. 移除 window.webagent = window.webagent || {} 和 window.webagent.X = window.webagent.X || {}
  // 必须在 window. 前缀剥离之前执行
  cleaned = cleaned.replace(/^\s*window\.webagent(?:\.[\w.]+)?\s*=\s*window\.webagent(?:\.[\w.]+)?\s*\|\|\s*\{\}\s*;?\s*$/gm, '');

  // 3. 处理 window.X = { ... } 多行对象赋值（如 MessageContent.js）
  // 必须在 window. 前缀剥离之前执行
  cleaned = cleaned.replace(
    /if\s*\(typeof\s+window\s*!==\s*'undefined'\)\s*\{\s*window\.(\w+)\s*=\s*\{([\s\S]*?)\}\s*;\s*\}/gm,
    'const $1 = {\n$2\n};'
  );

  // 4. 移除 if (typeof window !== 'undefined') { window.X = X; } 包装块
  cleaned = cleaned.replace(/if\s*\(typeof\s+window\s*!==\s*'undefined'\)\s*\{\s*window\.(\w+)\s*=\s*(\w+)\s*;\s*\}/gm, '');
  // 移除剩余的 if (typeof window !== 'undefined') { ... } 空块
  cleaned = cleaned.replace(
    /if\s*\(typeof\s+window\s*!==\s*'undefined'\)\s*\{[\s\S]*?\}\s*$/gm,
    ''
  );

  // 5. 替换代码中的 window.ClassName → ClassName（extends / instanceof / 构造函数调用等）
  // 保留 window.dispatchEvent, window.location 等浏览器内置 API
  const browserAPIs = ['dispatchEvent', 'location', 'CustomEvent', 'document', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'console'];
  cleaned = cleaned.replace(/window\.(\w+)/g, (match, name) => {
    if (browserAPIs.includes(name)) return match;
    return name;
  });

  // 4. 移除 module.exports 块
  cleaned = cleaned.replace(
    /if\s*\(typeof\s+module\s*!==\s*'undefined'\s*&&\s*module\.exports\)\s*\{[\s\S]*?\}\s*$/gm,
    ''
  );

  // 5. 移除旧的统一导出 IIFE（如果有）
  cleaned = cleaned.replace(
    /\(function\s*\(root\)\s*\{[\s\S]*?\}\)\(typeof\s+window[\s\S]*?\);\s*$/m,
    ''
  );

  // 6. 移除 `window.webagent = window.webagent || {}` 初始化代码
  cleaned = cleaned.replace(
    /window\.webagent\s*=\s*window\.webagent\s*\|\|\s*\{\}\s*;?\s*$/gm,
    ''
  );

  // 7. 移除 `window.webagent.programs.ChatProgram = ChatProgram` 赋值
  cleaned = cleaned.replace(
    /window\.webagent\.\w+\s*=\s*\w+[\s\S]*?\s*$/gm,
    ''
  );

  // 8. 移除末尾多余的空行
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

  return cleaned.trim();
}

/**
 * 检测文件中引用了哪些全局变量（用于调试）
 */
function findExternalRefs(content) {
  const refs = new Set();
  // 简单检测 extends window.X 和 window.X 引用
  const windowRefs = content.match(/window\.(\w+)/g) || [];
  windowRefs.forEach(ref => refs.add(ref));
  return Array.from(refs);
}

/**
 * 构建 bundle
 */
function build() {
  console.log('🔨 Building kernel.bundle.js...\n');

  // 确保 dist 目录存在
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // IIFE 头部
  let bundle = `/**
 * Web Agent Kernel Bundle
 * 由 build.js 自动生成，请勿手动编辑
 * 源码位于 kernel/ 目录
 */
(function(root) {
  'use strict';

  // 初始化命名空间
  const webagent = root.webagent = root.webagent || {};
  webagent.models = webagent.models || {};
  webagent.services = webagent.services || {};
  webagent.providers = webagent.providers || {};
  webagent.programs = webagent.programs || {};
  webagent.tools = webagent.tools || {};

`;

  let fileCount = 0;
  let totalSize = 0;
  const warnings = [];

  for (const relativePath of KERNEL_FILES) {
    const fullPath = path.join(ROOT_DIR, relativePath);

    if (!fs.existsSync(fullPath)) {
      console.error(`  ✗ File not found: ${relativePath}`);
      continue;
    }

    let content = fs.readFileSync(fullPath, 'utf-8');

    // 检查是否有残留的 window. 引用
    const remainingWindowRefs = findExternalRefs(content);
    if (remainingWindowRefs.length > 0) {
      warnings.push({
        file: relativePath,
        refs: remainingWindowRefs
      });
    }

    // 清理源码
    const cleaned = cleanSource(content, relativePath);

    // 获取导出列表
    const exportKey = relativePath.replace(/\.js$/, '');
    const exports = EXPORTS[exportKey] || [];

    // 添加到 bundle
    bundle += `  // ========== ${relativePath} ==========\n`;
    bundle += cleaned.split('\n').map(line => '  ' + line).join('\n') + '\n';

    // 注册导出到 root 和 webagent 子命名空间
    for (const name of exports) {
      bundle += `  root.${name} = ${name};\n`;
    }

    if (exports.length > 0) {
      bundle += '\n';
    }

    fileCount++;
    totalSize += content.length;
  }

  // ====== 自动生成：从 EXPORTS 驱动 webagent 命名空间映射 ======
  // 根据文件路径前缀决定归属哪个 webagent 子命名空间
  bundle += '\n  // ========== webagent 命名空间快捷引用 ==========\n';

  for (const [filePath, varNames] of Object.entries(EXPORTS)) {
    // 根据路径前缀判断命名空间
    let ns = 'webagent';
    if (filePath.startsWith('kernel/models/'))   ns = 'webagent.models';
    else if (filePath.startsWith('kernel/services/ProviderAPIServices/')) ns = 'webagent.providers';
    else if (filePath.startsWith('kernel/services/')) ns = 'webagent.services';
    else if (filePath.startsWith('kernel/programs/')) ns = 'webagent.programs';

    for (const varName of varNames) {
      bundle += `  ${ns}.${varName} = root.${varName};\n`;
    }
  }

  // 版本
  bundle += '\n  webagent.VERSION = \'0.5.1\';\n';
  bundle += '  webagent.CODENAME = \'Microkernel\';\n';

  // 注册到 globalThis（供 bundle 外部的壳层代码使用，如 extends IStorageManager）
  bundle += '\n  // ========== 注册到 globalThis（供 bundle 外部的壳层代码使用） ==========\n';
  for (const [filePath, varNames] of Object.entries(EXPORTS)) {
    for (const varName of varNames) {
      bundle += `  root.${varName} = ${varName};\n`;
    }
  }

  bundle += `\n})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);\n`;

  // 输出文件
  fs.writeFileSync(OUTPUT_FILE, bundle, 'utf-8');

  // 报告
  console.log(`  ✓ Files merged: ${fileCount}`);
  console.log(`  ✓ Source size:  ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`  ✓ Bundle size:  ${(bundle.length / 1024).toFixed(1)} KB`);
  console.log(`  ✓ Output:       ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

  // 警告：残留的 window. 引用
  if (warnings.length > 0) {
    console.log(`\n  ⚠ ${warnings.length} files have remaining window.* references:`);
    warnings.forEach(w => {
      console.log(`    ${w.file}: ${w.refs.join(', ')}`);
    });
    console.log('  These files need to be cleaned up before bundling.\n');
  } else {
    console.log('\n  ✓ No remaining window.* references in source files.\n');
  }
}

build();