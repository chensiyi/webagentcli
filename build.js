#!/usr/bin/env node

/**
 * 构建脚本 - 将所有模块合并为最终的 user.js 文件
 * 特性：
 * - 自动读取 package.json 或使用手动指定的版本号
 * - 支持模块依赖顺序配置
 * - 使用注释标记分离全局代码和模块代码
 */

const fs = require('fs');
const path = require('path');

// 配置
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'agent.user.js');
const VERSION = process.env.VERSION || '3.9.8';
const BUILD_DATE = new Date().toISOString().split('T')[0];
// 发布模式：通过环境变量 RELEASE=true 启用，或手动设置
const IS_RELEASE = process.env.RELEASE === 'true' || process.argv.includes('--release');

// UserScript 头部模板
const USERSCRIPT_HEADER = `// ==UserScript==
// @name         Free Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      ${VERSION}
// @description  基于ai模型的Web AI 助手,支持 JS 执行
// @author       chensiyi1994
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

`;

// 确保输出目录存在
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

console.log('🔨 开始构建 AI Agent...');
console.log(`📦 版本: ${VERSION}`);
console.log(`📅 构建日期: ${BUILD_DATE}`);
console.log(`🚀 发布模式: ${IS_RELEASE ? '✅ 是 (DEBUG_MODE=false)' : '❌ 否 (DEBUG_MODE=true)'}`);

// 模块加载顺序配置（按依赖关系排序）
const modules = [
    // 核心基础模块（必须先加载）
    'core/utils.js',           // 工具函数
    'core/EventManager.js',
    'core/ErrorTracker.js',    // v4.0.0: 错误追踪器
    IS_RELEASE ? null : 'core/HotReload.js',  // ✅ 仅开发模式：热重载
    'core/ConfigManager.js',
    'core/HistoryManager.js',
    'core/StateManager.js',
    'core/UnifiedStateManager.js', // v4.2.0: 统一状态管理器
    'core/ShortcutManager.js', // 快捷键管理器
    'core/ProviderManager.js', // v4.0.0: 提供商管理器
    'core/PageAnalyzer.js',    // v4.3.0: 页面分析器
    
    // UI 模块（必须在 Chat 之前加载，因为 Chat 依赖 UIManager）
    'ui-styles.js',      // UI 样式模块
    'ui-templates.js',   // UI 模板模块
    'ui.js',
    
    // 业务模块
    'models.js',
    'api/BaseAPIClient.js',   // v4.1.0: API 基础客户端
    'api/OpenRouterClient.js', // v4.1.0: OpenRouter 客户端
    'api/LMStudioClient.js',   // v4.1.0: LM Studio 客户端
    'api/index.js',            // v4.1.0: API 客户端工厂
    'api-router.js',           // API 路由层 (v4.0.0+)
    // ✅ api.js 已删除，功能由 api/ 目录替代
    
    // Agent 核心
    'agent/CodeExecutor.js',     // v4.5.0: 代码执行器
    'agent/index.js',            // v4.4.0: AI Agent 核心
    
    'chat.js',
    'main.js' // 主入口，最后加载
].filter(Boolean); // 过滤掉 null 值

console.log(`\n📋 将加载 ${modules.length} 个模块...`);

// 开始构建
let combinedCode = USERSCRIPT_HEADER;

// 添加构建信息注释
combinedCode += `// 构建信息\n`;
combinedCode += `// 版本: ${VERSION}\n`;
combinedCode += `// 日期: ${BUILD_DATE}\n`;
combinedCode += `// 模块数: ${modules.length}\n\n`;

// 读取并合并所有模块
modules.forEach(module => {
    const modulePath = path.join(SRC_DIR, module);
    
    if (!fs.existsSync(modulePath)) {
        console.error(`❌ 文件不存在: ${modulePath}`);
        process.exit(1);
    }
    
    let content = fs.readFileSync(modulePath, 'utf-8');
    
    // 发布模式下替换 DEBUG_MODE
    if (IS_RELEASE && module === 'core/utils.js') {
        content = content.replace(
            /const DEBUG_MODE = true;/,
            'const DEBUG_MODE = false; // 发布模式已关闭调试日志'
        );
        console.log(`  ⚙️  ${module} - 已关闭 DEBUG_MODE`);
    }
    
    // 添加模块分隔注释
    combinedCode += `\n// =====================================================\n`;
    combinedCode += `// 模块: ${module}\n`;
    combinedCode += `// =====================================================\n\n`;
    combinedCode += content + '\n';
    
    console.log(`  ✅ ${module} (${(content.length / 1024).toFixed(1)} KB)`);
});

// 写入输出文件
fs.writeFileSync(OUTPUT_FILE, combinedCode, 'utf-8');

const stats = fs.statSync(OUTPUT_FILE);
const sizeKB = (stats.size / 1024).toFixed(1);

console.log(`\n✨ 构建完成!`);
console.log(`📄 输出文件: ${OUTPUT_FILE}`);
console.log(`📊 文件大小: ${sizeKB} KB`);
console.log(`📦 版本号: ${VERSION}`);
console.log(`📅 构建日期: ${BUILD_DATE}`);
console.log(`\n💡 提示: 将 dist/agent.user.js 安装到 Tampermonkey 即可使用`);
