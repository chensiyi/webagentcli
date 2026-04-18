// ==================== 开发模式：热重载助手 ====================
// 仅在开发环境中使用
// 使用方法: 启动 dev-server.js，然后在 Tampermonkey 中启用此模块

(function() {
    'use strict';

    const WS_URL = 'ws://localhost:8765';
    let ws = null;
    let reconnectTimer = null;

    /**
     * 连接 WebSocket 服务器
     */
    function connect() {
        try {
            ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                console.log('[HotReload] ✅ 已连接到开发服务器');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'reload') {
                    console.log('[HotReload] 🔄 检测到脚本更新，3秒后刷新...');
                    
                    // 保存当前滚动位置
                    sessionStorage.setItem('scrollPosition', window.scrollY);
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }
            };

            ws.onclose = () => {
                console.log('[HotReload] ❌ 连接断开，5秒后重连...');
                reconnectTimer = setTimeout(connect, 5000);
            };

            ws.onerror = (error) => {
                console.error('[HotReload] 连接错误:', error);
            };

        } catch (e) {
            console.error('[HotReload] 初始化失败:', e);
        }
    }

    /**
     * 断开连接
     */
    function disconnect() {
        if (ws) {
            ws.close();
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }
    }

    // 仅在开发模式下启用
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
        console.log('[HotReload] 🚀 热重载已启用');
        connect();

        // 页面卸载时清理
        window.addEventListener('beforeunload', disconnect);
    }

})();
