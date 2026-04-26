// Terminal Manager - 标签页终端管理器
// 为AI提供操作网页的能力

class TerminalManager {
  constructor() {
    this.activeTabs = new Map(); // tabId -> { url, title, injected }
  }

  /**
   * 在指定标签页执行JavaScript代码
   * @param {number} tabId - 标签页ID
   * @param {string} code - JavaScript代码
   * @returns {Promise<any>} 执行结果
   */
  async execute(tabId, code) {
    try {
      console.log(`[TerminalManager] Executing in tab ${tabId}:`, code.substring(0, 100));

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (scriptCode) => {
          try {
            // 保存原始的 console
            const originalConsoleLog = console.log;
            const originalConsoleError = console.error;
            
            // 禁用控制台输出到页面（防止污染）
            console.log = () => {};
            console.error = () => {};
            
            // 序列化函数（在页面上下文中定义）
            function serializeResult(result) {
              if (result === null || result === undefined) {
                return result;
              }

              const type = typeof result;
              
              if (type === 'string' || type === 'number' || type === 'boolean') {
                return result;
              }

              if (type === 'object') {
                try {
                  JSON.stringify(result);
                  return result;
                } catch (e) {
                  return String(result);
                }
              }

              return String(result);
            }
            
            // 使用 script 标签注入执行代码
            // 这种方式不会触发 TrustedScript 检查
            const resultId = '__terminal_result_' + Date.now();
            
            // 创建包装代码，将结果存储到 window 对象
            // 注意：需要将执行结果赋值给 window[resultId]
            const wrappedCode = `
              (function() {
                try {
                  window.${resultId} = (function() {
                    ${scriptCode}
                  })();
                } catch (e) {
                  window.${resultId} = { error: e.message, stack: e.stack };
                }
              })();
            `;
            
            // 创建 script 标签并注入
            // 使用 createTextNode 避免 TrustedScript 检查
            const script = document.createElement('script');
            script.appendChild(document.createTextNode(wrappedCode));
            (document.head || document.documentElement).appendChild(script);
            script.remove();
            
            // 检查结果
            const resultData = window[resultId];
            delete window[resultId];
            
            // 恢复控制台
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            
            // 如果有错误，返回错误信息
            if (resultData && resultData.error) {
              return {
                success: false,
                error: resultData.error,
                stack: resultData.stack
              };
            }
            
            // 序列化结果（处理循环引用）
            return {
              success: true,
              result: serializeResult(resultData),
              type: typeof resultData
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              stack: error.stack
            };
          }
        },
        args: [code],
        world: 'MAIN' // 关键：在MAIN world执行，可访问页面所有对象
      });

      if (results && results[0] && results[0].result) {
        const executionResult = results[0].result;
        
        if (executionResult.success) {
          console.log(`[TerminalManager] Execution successful, type: ${executionResult.type}`);
          return {
            success: true,
            data: executionResult.result,
            type: executionResult.type
          };
        } else {
          console.error('[TerminalManager] Execution failed:', executionResult.error);
          return {
            success: false,
            error: executionResult.error,
            stack: executionResult.stack
          };
        }
      }

      throw new Error('No result returned');
    } catch (error) {
      console.error('[TerminalManager] Execute error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取标签页信息
   * @param {number} tabId - 标签页ID
   */
  async getTabInfo(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return {
        success: true,
        data: {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取当前激活的标签页
   */
  async getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        return { success: false, error: 'No active tab' };
      }
      
      return {
        success: true,
        data: {
          id: tab.id,
          url: tab.url,
          title: tab.title
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 根据 URL 或关键字查找标签页
   * @param {string} query - URL 或标题关键字
   * @returns {Promise} 匹配的标签页
   */
  async findTabByQuery(query) {
    try {
      // 获取所有标签页
      const tabs = await chrome.tabs.query({});
      
      // 精确匹配 URL
      let matchedTab = tabs.find(tab => tab.url === query);
      
      // 如果没有精确匹配，尝试部分匹配
      if (!matchedTab) {
        matchedTab = tabs.find(tab => tab.url?.includes(query) || tab.title?.includes(query));
      }
      
      if (!matchedTab) {
        return {
          success: false,
          error: `No tab found matching: ${query}`,
          availableTabs: tabs.slice(0, 10).map(t => ({
            id: t.id,
            url: t.url,
            title: t.title
          }))
        };
      }
      
      return {
        success: true,
        data: {
          id: matchedTab.id,
          url: matchedTab.url,
          title: matchedTab.title
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 序列化执行结果（处理不可序列化的对象）
   */
  serializeResult(result) {
    if (result === null || result === undefined) {
      return result;
    }

    const type = typeof result;
    
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return result;
    }

    if (type === 'object') {
      try {
        // 尝试JSON序列化
        JSON.stringify(result);
        return result;
      } catch (e) {
        // 如果失败，转换为字符串
        return String(result);
      }
    }

    // 其他类型转为字符串
    return String(result);
  }

  /**
   * 生成便捷的DOM操作脚本
   */
  generateDomScript(action, selector, value = '') {
    const scripts = {
      // 获取元素文本
      getText: `document.querySelector('${selector}')?.textContent`,
      
      // 设置元素文本
      setText: `(() => { 
        const el = document.querySelector('${selector}');
        if (el) { el.textContent = '${value}'; return true; }
        return false;
      })()`,
      
      // 点击元素
      click: `(() => {
        const el = document.querySelector('${selector}');
        if (el) { el.click(); return true; }
        return false;
      })()`,
      
      // 获取输入框值
      getValue: `document.querySelector('${selector}')?.value`,
      
      // 设置输入框值
      setValue: `(() => {
        const el = document.querySelector('${selector}');
        if (el) { el.value = '${value}'; return true; }
        return false;
      })()`,
      
      // 获取属性
      getAttribute: `document.querySelector('${selector}')?.getAttribute('${value}')`,
      
      // 设置样式
      setStyle: `(() => {
        const el = document.querySelector('${selector}');
        if (el) { ${value}; return true; }
        return false;
      })()`,
      
      // 滚动到元素
      scrollTo: `(() => {
        const el = document.querySelector('${selector}');
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); return true; }
        return false;
      })()`,
      
      // 获取所有匹配元素
      queryAll: `Array.from(document.querySelectorAll('${selector}')).map(el => ({
        text: el.textContent?.trim(),
        html: el.innerHTML?.substring(0, 200),
        tag: el.tagName
      }))`
    };

    return scripts[action] || null;
  }

  /**
   * 执行便捷的DOM操作
   * @param {number} tabId - 标签页ID
   * @param {string} action - 操作类型
   * @param {string} selector - CSS选择器
   * @param {string} value - 可选值
   */
  async domAction(tabId, action, selector, value = '') {
    const script = this.generateDomScript(action, selector, value);
    
    if (!script) {
      return { success: false, error: `Unknown action: ${action}` };
    }

    return await this.execute(tabId, script);
  }

  /**
   * 注入Terminal对象到页面（增强模式）
   * @param {number} tabId - 标签页ID
   * @todo 需要创建 content/terminal-injector.js 文件
   */
  async injectTerminal(tabId) {
    // TODO: 注入增强版Terminal对象到页面
    // 目前直接使用 execute() 方法执行代码即可
    console.warn('[TerminalManager] injectTerminal not implemented yet');
    return { success: false, error: 'Not implemented' };
  }

  /**
   * 检查标签页是否已注入Terminal
   */
  isInjected(tabId) {
    return this.activeTabs.has(tabId);
  }
}

// 导出单例
window.TerminalManager = new TerminalManager();
