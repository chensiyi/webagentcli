// ==================== 开发服务器（支持热重载）====================
// 使用方法: node dev-server.js
// 功能: 监控文件变化 → 自动构建 → 通知浏览器刷新

const WebSocket = require('ws');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8765;
const SRC_DIR = path.join(__dirname, 'src');
const BUILD_CMD = 'node build.js';

console.log('🚀 开发服务器启动中...');
console.log(`📂 监控目录: ${SRC_DIR}`);
console.log(`🔌 WebSocket 端口: ${PORT}`);
console.log('');

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ port: PORT });

let clients = new Set();

wss.on('connection', (ws) => {
    console.log('✅ 浏览器已连接');
    clients.add(ws);

    ws.on('close', () => {
        console.log('❌ 浏览器断开连接');
        clients.delete(ws);
    });
});

/**
 * 通知所有连接的浏览器刷新
 */
function notifyReload() {
    const message = JSON.stringify({ type: 'reload', timestamp: Date.now() });
    
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`🔄 已通知 ${clients.size} 个客户端刷新`);
}

/**
 * 执行构建命令
 */
function build() {
    return new Promise((resolve, reject) => {
        console.log('🔨 开始构建...');
        
        exec(BUILD_CMD, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ 构建失败:', error.message);
                reject(error);
                return;
            }
            
            if (stderr) {
                console.error('⚠️  构建警告:', stderr);
            }
            
            console.log(stdout);
            resolve();
        });
    });
}

/**
 * 防抖函数：避免短时间内多次触发
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 文件变化处理
 */
const handleFileChange = debounce(async (filePath) => {
    console.log(`\n📝 检测到变化: ${path.relative(__dirname, filePath)}`);
    
    try {
        // 等待一小段时间，确保文件写入完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 执行构建
        await build();
        
        // 通知浏览器刷新
        notifyReload();
        
        console.log('✨ 完成！\n');
    } catch (error) {
        console.error('💥 处理失败:', error);
    }
}, 1000); // 1秒防抖

// 监控文件变化
const watcher = chokidar.watch(SRC_DIR, {
    ignored: /(^|[\/\\])\../, // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
    }
});

watcher
    .on('add', (filePath) => handleFileChange(filePath))
    .on('change', (filePath) => handleFileChange(filePath))
    .on('unlink', (filePath) => handleFileChange(filePath));

console.log('👀 正在监控文件变化...\n');
console.log('💡 提示:');
console.log('   1. 在 Tampermonkey 中安装 dist/agent.user.js');
console.log('   2. 编辑 src/ 目录下的文件');
console.log('   3. 保存后会自动构建并刷新浏览器\n');

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n👋 开发服务器已停止');
    watcher.close();
    wss.close();
    process.exit(0);
});
