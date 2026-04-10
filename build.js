#!/usr/bin/env node

/**
 * 构建脚本 - 将所有模块合并为最终的 user.js 文件
 */

const fs = require('fs');
const path = require('path');

// 配置
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'agent.user.js');
const VERSION = process.env.VERSION || '2.0.0';

// UserScript 头部模板
const USERSCRIPT_HEADER = `// ==UserScript==
// @name         OpenRouter Free AI Agent
// @namespace    https://github.com/chensiyi1994
// @version      ${VERSION}
// @description  基于 OpenRouter 免费模型的浏览器 AI 助手,支持 JS 执行,完全免费
// @author       chensiyi1994
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      openrouter.ai
// @run-at       document-end
// ==/UserScript==

`;

// 确保输出目录存在
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

console.log('🔨 开始构建 OpenRouter AI Agent...');
console.log(`📦 版本: ${VERSION}`);

// 读取所有源文件
const modules = [
    'config.js',
    'models.js',
    'ui.js',
    'api.js', 
    'chat.js',
    'settings.js',
    'storage.js',
    'utils.js',
    'main.js'
];

let combinedCode = USERSCRIPT_HEADER;

modules.forEach(module => {
    const modulePath = path.join(SRC_DIR, module);
    if (fs.existsSync(modulePath)) {
        const content = fs.readFileSync(modulePath, 'utf-8');
        combinedCode += `\n// ==================== ${module} ====================\n\n`;
        combinedCode += content + '\n';
        console.log(`✅ 已添加: ${module}`);
    } else {
        console.warn(`⚠️  未找到: ${module}`);
    }
});

// 写入输出文件
fs.writeFileSync(OUTPUT_FILE, combinedCode, 'utf-8');

const stats = fs.statSync(OUTPUT_FILE);
const sizeKB = (stats.size / 1024).toFixed(1);

console.log(`\n✨ 构建完成!`);
console.log(`📄 输出文件: ${OUTPUT_FILE}`);
console.log(`📊 文件大小: ${sizeKB} KB`);
console.log(`\n💡 提示: 将 dist/agent.user.js 安装到 Tampermonkey 即可使用`);
