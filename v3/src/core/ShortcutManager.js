// ==================== 快捷键管理器 ====================
// 统一管理全局快捷键，支持注册、注销和条件触发

const ShortcutManager = (function() {
    'use strict';
    
    // 快捷键注册表：key -> {callback, description, enabled}
    const shortcutRegistry = new Map();
    
    // 全局键盘事件处理器引用
    let globalKeyHandler = null;
    
    /**
     * 初始化快捷键系统
     */
    function init() {
        console.log('⌨️ 初始化快捷键系统');
        
        // 创建全局键盘事件处理器
        globalKeyHandler = handleGlobalKeyDown;
        
        // 绑定到 document
        document.addEventListener('keydown', globalKeyHandler);
        
        console.log('✅ 快捷键系统已启动');
    }
    
    /**
     * 销毁快捷键系统
     */
    function destroy() {
        if (globalKeyHandler) {
            document.removeEventListener('keydown', globalKeyHandler);
            globalKeyHandler = null;
        }
        shortcutRegistry.clear();
        console.log('🗑️ 快捷键系统已销毁');
    }
    
    /**
     * 注册快捷键
     * @param {string} keyCombo - 快捷键组合，如 'Ctrl+Enter', 'Escape', 'Ctrl+ArrowUp'
     * @param {Function} callback - 回调函数
     * @param {string} description - 描述（用于显示）
     * @param {Object} options - 选项
     * @param {boolean} options.enabled - 是否启用（默认 true）
     * @param {boolean} options.preventDefault - 是否阻止默认行为（默认 true）
     * @param {boolean} options.stopPropagation - 是否停止传播（默认 false）
     */
    function register(keyCombo, callback, description = '', options = {}) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        
        shortcutRegistry.set(normalizedKey, {
            callback,
            description,
            enabled: options.enabled !== false,
            preventDefault: options.preventDefault !== false,
            stopPropagation: options.stopPropagation === true
        });
        
        console.log(`⌨️ 注册快捷键: ${normalizedKey} - ${description}`);
    }
    
    /**
     * 注销快捷键
     * @param {string} keyCombo - 快捷键组合
     */
    function unregister(keyCombo) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        const removed = shortcutRegistry.delete(normalizedKey);
        
        if (removed) {
            console.log(`🗑️ 注销快捷键: ${normalizedKey}`);
        }
        
        return removed;
    }
    
    /**
     * 检查快捷键是否已注册
     * @param {string} keyCombo - 快捷键组合
     * @returns {boolean}
     */
    function isRegistered(keyCombo) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        return shortcutRegistry.has(normalizedKey);
    }
    
    /**
     * 启用/禁用快捷键
     * @param {string} keyCombo - 快捷键组合
     * @param {boolean} enabled - 是否启用
     */
    function setEnabled(keyCombo, enabled) {
        const normalizedKey = normalizeKeyCombo(keyCombo);
        const shortcut = shortcutRegistry.get(normalizedKey);
        
        if (shortcut) {
            shortcut.enabled = enabled;
            console.log(`⚙️ 快捷键 ${normalizedKey} ${enabled ? '已启用' : '已禁用'}`);
        }
    }
    
    /**
     * 获取所有已注册的快捷键
     * @returns {Array} 快捷键列表
     */
    function getAllShortcuts() {
        const shortcuts = [];
        shortcutRegistry.forEach((value, key) => {
            shortcuts.push({
                keyCombo: key,
                description: value.description,
                enabled: value.enabled
            });
        });
        return shortcuts;
    }
    
    /**
     * 标准化快捷键组合字符串
     * @param {string} keyCombo - 原始快捷键组合
     * @returns {string} 标准化后的组合
     */
    function normalizeKeyCombo(keyCombo) {
        // 转换为小写，去除空格
        return keyCombo.toLowerCase().replace(/\s+/g, '');
    }
    
    /**
     * 解析按键事件为快捷键组合字符串
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {string} 快捷键组合字符串
     */
    function parseKeyEvent(e) {
        const parts = [];
        
        // 添加修饰键
        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');
        
        // 添加主键
        const key = e.key.toLowerCase();
        
        // 特殊键名映射
        const specialKeys = {
            'arrowup': 'arrowup',
            'arrowdown': 'arrowdown',
            'arrowleft': 'arrowleft',
            'arrowright': 'arrowright',
            'escape': 'escape',
            'enter': 'enter',
            ' ': 'space',
            'tab': 'tab',
            'backspace': 'backspace',
            'delete': 'delete'
        };
        
        const mainKey = specialKeys[key] || key;
        parts.push(mainKey);
        
        return parts.join('+');
    }
    
    /**
     * 全局键盘事件处理器
     * @param {KeyboardEvent} e - 键盘事件
     */
    function handleGlobalKeyDown(e) {
        const keyCombo = parseKeyEvent(e);
        const shortcut = shortcutRegistry.get(keyCombo);
        
        if (!shortcut || !shortcut.enabled) {
            return;
        }
        
        // 执行回调
        try {
            const shouldPreventDefault = shortcut.callback(e) !== false;
            
            // 根据配置决定是否阻止默认行为
            if (shouldPreventDefault && shortcut.preventDefault) {
                e.preventDefault();
            }
            
            // 根据配置决定是否停止传播
            if (shortcut.stopPropagation) {
                e.stopPropagation();
            }
            
            console.log(`⌨️ 触发快捷键: ${keyCombo}`);
        } catch (error) {
            console.error(`❌ 快捷键 ${keyCombo} 执行失败:`, error);
        }
    }
    
    // 导出公共接口
    return {
        init,
        destroy,
        register,
        unregister,
        isRegistered,
        setEnabled,
        getAllShortcuts
    };
})();
