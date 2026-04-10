// ==================== 工具函数模块 ====================

const Utils = (function() {
    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 格式化代码块
     */
    function formatCodeBlock(code, language) {
        const escapedCode = escapeHtml(code.trim());
        return `
            <div class="code-block">
                <div class="code-language">${language || 'text'}</div>
                <pre>${escapedCode}</pre>
            </div>
        `;
    }

    /**
     * 生成唯一 ID
     */
    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 防抖函数
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
     * 节流函数
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * 深拷贝对象
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * 检查是否为空值
     */
    function isEmpty(value) {
        return value === null || value === undefined || value === '';
    }

    /**
     * 格式化时间
     */
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return date.toLocaleDateString();
    }

    /**
     * 截断文本
     */
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * 复制到剪贴板
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('复制失败:', error);
            return false;
        }
    }

    /**
     * 下载文件
     */
    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 读取本地文件
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    return {
        escapeHtml,
        formatCodeBlock,
        generateId,
        debounce,
        throttle,
        deepClone,
        isEmpty,
        formatTime,
        truncateText,
        copyToClipboard,
        downloadFile,
        readFileAsText
    };
})();
