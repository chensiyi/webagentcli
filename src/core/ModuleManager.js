// ==================== 模块管理器 (核心) ====================
// 负责模块的初始化、注册、依赖管理和通信

const ModuleManager = (function() {
    'use strict';
    
    // 模块注册表
    const modules = {};
    
    // 模块状态
    const moduleStates = {};
    
    // 事件中心
    const eventCenter = {
        listeners: {},
        
        // 注册事件监听器
        on(eventName, callback) {
            if (!this.listeners[eventName]) {
                this.listeners[eventName] = [];
            }
            this.listeners[eventName].push(callback);
        },
        
        // 触发事件
        emit(eventName, data) {
            const listeners = this.listeners[eventName];
            if (listeners) {
                listeners.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in event listener for ${eventName}:`, error);
                    }
                });
            }
        },
        
        // 移除事件监听器
        off(eventName, callback) {
            const listeners = this.listeners[eventName];
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }
    };
    
    /**
     * 注册模块
     * @param {string} name - 模块名称
     * @param {Object} module - 模块对象
     */
    function registerModule(name, module) {
        modules[name] = module;
        moduleStates[name] = 'registered';
        console.log(`📦 模块已注册: ${name}`);
    }
    
    /**
     * 初始化所有模块
     */
    async function initAll() {
        const moduleNames = Object.keys(modules);
        
        for (const name of moduleNames) {
            if (modules[name].init && typeof modules[name].init === 'function') {
                try {
                    await modules[name].init();
                    moduleStates[name] = 'initialized';
                    console.log(`✅ 模块已初始化: ${name}`);
                } catch (error) {
                    console.error(`❌ 模块初始化失败: ${name}`, error);
                    moduleStates[name] = 'error';
                }
            }
        }
    }
    
    /**
     * 获取模块实例
     * @param {string} name - 模块名称
     * @returns {Object} 模块实例
     */
    function getModule(name) {
        if (!modules[name]) {
            throw new Error(`Module ${name} not found`);
        }
        return modules[name];
    }
    
    /**
     * 获取模块状态
     * @param {string} name - 模块名称
     * @returns {string} 模块状态
     */
    function getModuleState(name) {
        return moduleStates[name] || 'unknown';
    }
    
    /**
     * 获取事件中心
     * @returns {Object} 事件中心
     */
    function getEventCenter() {
        return eventCenter;
    }
    
    /**
     * 模块间调用（依赖注入方式）
     * @param {string} moduleName - 目标模块名
     * @param {string} methodName - 方法名
     * @param {...any} args - 参数
     */
    function callModule(moduleName, methodName, ...args) {
        const module = getModule(moduleName);
        if (!module[methodName]) {
            throw new Error(`Method ${methodName} not found in module ${moduleName}`);
        }
        return module[methodName](...args);
    }
    
    /**
     * 创建模块代理（用于模块间调用）
     * @param {string} moduleName - 模块名称
     * @returns {Object} 模块代理
     */
    function createModuleProxy(moduleName) {
        return new Proxy({}, {
            get(target, methodName) {
                return function(...args) {
                    return callModule(moduleName, methodName, ...args);
                };
            }
        });
    }
    
    // 导出公共接口
    return {
        registerModule,
        initAll,
        getModule,
        getModuleState,
        getEventCenter,
        callModule,
        createModuleProxy
    };
})();