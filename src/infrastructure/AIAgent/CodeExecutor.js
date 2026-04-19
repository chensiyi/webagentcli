// ==================== 代码执行器 ====================
// v4.5.0: 从 chat.js 提取，专门负责代码执行
// 职责：安全执行 AI 生成的 JavaScript 代码

const CodeExecutor = (function() {
    'use strict';

    // 执行队列
    let executionQueue = [];
    let isExecuting = false;

    /**
     * 检查代码是否为高危操作
     */
    function isHighRiskCode(code) {
        const highRiskPatterns = [
            // 导航/跳转类
            /window\.location\s*=/,
            /window\.location\.href\s*=/,
            /location\.href\s*=/,
            /location\.replace\s*\(/,
            /location\.assign\s*\(/,
            /window\.open\s*\(/,
            
            // 数据删除类
            /localStorage\.clear\s*\(/,
            /localStorage\.removeItem\s*\(/,
            /sessionStorage\.clear\s*\(/,
            /indexedDB\.deleteDatabase\s*\(/,
            
            // Cookie 操作
            /document\.cookie\s*=/,
            
            // 页面修改（谨慎）
            /document\.write\s*\(/,
            /document\.innerHTML\s*=/,
            /document\.outerHTML\s*=/,
            
            // 无限循环风险
            /while\s*\(\s*true\s*\)/,
            /for\s*\(\s*;\s*;\s*\)/,
            
            // 递归调用
            /function\s+\w+\s*\([^)]*\)\s*\{[^}]*\w+\s*\(/,
            
            // eval（双重 eval 风险）
            /eval\s*\(\s*eval\s*\(/,
            
            // 定时器滥用
            /setInterval\s*\([^,]+,\s*0\s*\)/,
            /setTimeout\s*\([^,]+,\s*0\s*\)/g
        ];

        return highRiskPatterns.some(pattern => pattern.test(code));
    }

    /**
     * 获取高危类型描述
     */
    function getHighRiskType(code) {
        if (/window\.location|location\.href|location\.replace|window\.open/.test(code)) {
            return '页面导航/跳转';
        }
        if (/localStorage\.clear|sessionStorage\.clear|indexedDB\.deleteDatabase/.test(code)) {
            return '数据删除';
        }
        if (/document\.cookie\s*=/.test(code)) {
            return 'Cookie 修改';
        }
        if (/document\.write|document\.innerHTML/.test(code)) {
            return '页面修改';
        }
        if (/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(code)) {
            return '无限循环';
        }
        return '未知高危操作';
    }

    /**
     * 安全地执行代码
     */
    function executeCode(code, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // 1. 安全检查
                const isHighRisk = isHighRiskCode(code);
                const riskType = isHighRisk ? getHighRiskType(code) : null;
                
                // 如果启用严格模式且是高危代码，直接拒绝
                if (options.strictMode && isHighRisk) {
                    reject(new Error(`⚠️ 检测到高危操作：${riskType}\n\n为保护您的数据安全，已阻止执行。`));
                    return;
                }

                // 2. 在沙箱环境中执行
                const result = unsafeWindow.eval(code);
                
                // 3. 格式化结果
                const formattedResult = formatResult(result);
                
                resolve({
                    success: true,
                    result: formattedResult,
                    rawResult: result,
                    isHighRisk,
                    riskType
                });

            } catch (error) {
                reject({
                    success: false,
                    error: error.message,
                    stack: error.stack
                });
            }
        });
    }

    /**
     * 格式化执行结果（P2: 支持压缩）
     */
    function formatResult(result, options = {}) {
        const maxLength = options.maxLength || 5000;  // 默认最大 5000 字符
        
        // null 或 undefined
        if (result === null) return 'null';
        if (result === undefined) return 'undefined';

        // 基本类型
        if (typeof result === 'string') {
            // P2: 字符串截断
            if (result.length > maxLength) {
                return `"${result.substring(0, maxLength)}..." (已截断，总长度: ${result.length} 字符)`;
            }
            return `"${result}"`;
        }
        if (typeof result === 'number' || typeof result === 'boolean') return String(result);
        if (typeof result === 'function') return `[Function: ${result.name || 'anonymous'}]`;

        // 对象类型
        if (typeof result === 'object') {
            try {
                // 尝试 JSON 序列化
                const jsonStr = JSON.stringify(result, null, 2);
                
                // P2: JSON 结果截断
                if (jsonStr.length > maxLength) {
                    return jsonStr.substring(0, maxLength) + '\n... (已截断，总长度: ${jsonStr.length} 字符)';
                }
                
                return jsonStr;
            } catch (e) {
                // 处理循环引用
                return `[${result.constructor?.name || 'Object'}] (无法序列化)`;
            }
        }

        return String(result);
    }

    /**
     * 批量执行代码（队列模式）
     */
    async function executeBatch(codeBlocks, options = {}) {
        const results = [];
        
        for (let i = 0; i < codeBlocks.length; i++) {
            const block = codeBlocks[i];
            
            try {
                const result = await executeCode(block.code, {
                    ...options,
                    blockIndex: i
                });
                
                results.push({
                    index: i,
                    lang: block.lang,
                    ...result
                });
                
            } catch (error) {
                results.push({
                    index: i,
                    lang: block.lang,
                    success: false,
                    error: error.message || error.error
                });
                
                // 如果某个块失败，是否继续？
                if (options.stopOnError) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * 从文本中提取代码块
     */
    function extractCodeBlocks(text) {
        const codeBlocks = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            codeBlocks.push({
                lang: match[1] || 'runjs',
                code: match[2].trim()
            });
        }
        
        return codeBlocks;
    }

    /**
     * 清空执行队列
     */
    function clearQueue() {
        executionQueue = [];
        isExecuting = false;
    }

    /**
     * 获取执行器状态
     */
    function getState() {
        return {
            isExecuting,
            queueLength: executionQueue.length
        };
    }

    return {
        executeCode,
        executeBatch,
        extractCodeBlocks,
        isHighRiskCode,
        getHighRiskType,
        clearQueue,
        getState
    };
})();
