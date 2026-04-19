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
const VERSION = process.env.VERSION || '5.1.0';
const BUILD_DATE = new Date().toISOString().split('T')[0];
// 发布模式：通过环境变量 RELEASE=true 启用，或手动设置
const IS_RELEASE = process.env.RELEASE === 'true' || process.argv.includes('--release');

// UserScript 头部模板
const USERSCRIPT_HEADER = `// ==UserScript==
// @name         Web AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      ${VERSION}
// @description  基于ai模型的Web AI 助手,支持 JS 执行
// @author       chensiyi1994
// @match        *://*/*
// @match        file:///*
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

// 模块加载顺序配置（按依赖关系排序）- v5.2 新架构
const modules = [
    // ==================== Core Layer (核心层) ====================
    'core/utils.js',                    // 工具函数
    'core/EventManager.js',             // 事件总线
    'core/ErrorTracker.js',             // 错误追踪器
    'core/StorageManager.js',           // 存储管理（提升为核心）
    
    // ==================== Agent Layer (Agent 层) ====================
    // API 客户端
    'agent/api/BaseAPIClient.js',       // API 基础客户端
    'agent/api/OpenRouterClient.js',    // OpenRouter 客户端
    'agent/api/LMStudioClient.js',      // LM Studio 客户端
    'agent/api/OllamaClient.js',        // Ollama 客户端
    'agent/api/APIRouter.js',           // API 路由和故障转移
    'agent/api/index.js',               // API 客户端工厂
    
    // 供应商和模型管理
    'agent/providers/ProviderManager.js',   // 供应商管理
    'agent/models/ModelManager.js',         // 模型管理
    
    // AI Agent 核心
    'agent/AIAgent/CodeExecutor.js',    // 代码执行器
    'agent/AIAgent/index.js',           // AI Agent 核心
    
    // ==================== Web Layer (Web 集成层) ====================
    'web/PageAnalyzer.js',              // 页面分析器
    'web/WebAgentClient.js',            // Web Agent 客户端（业务编排器）
    
    // React UI
    'vendor/react.production.min.js',   // React 运行时
    'vendor/react-dom.production.min.js', // ReactDOM
    'ui/hooks/useSettings.js',          // Settings Hook
    'ui/hooks/useAgent.js',             // Agent Hook
    'ui/components/MessageItem.jsx',    // Message Item 组件
    'ui/components/ChatWindow.jsx',     // Chat Window 组件
    'ui/components/SettingsDialog.jsx', // Settings Dialog 组件
    'ui/components/CodeConfirmDialog.jsx', // P0: Code Confirm Dialog 组件
    'ui/index.jsx',                     // React 根组件
    
    // ==================== Main Entry (程序入口) ====================
    'main.js'                           // 主入口，最后加载
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
