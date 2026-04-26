// 代码执行工具
// 负责JavaScript代码的安全执行

window.CodeTool = {
  /**
   * 工具配置
   */
  config: {
    id: 'js_code',
    name: 'js_code',
    description: 'Execute JavaScript code in sandboxed environment',
    enabled: false,
    systemPrompt: `### js_code

Execute JavaScript code in a sandboxed environment for calculations and data processing.

**Format:**
\`\`\`javascript
// your code
expression_to_return
\`\`\`

**Examples:**
\`\`\`javascript
2 + 2
\`\`\`
Returns: 4

\`\`\`javascript
[1,2,3].filter(x => x > 1)
\`\`\`
Returns: [2, 3]

**Available APIs:**
console, Math, JSON, Date, Array, Object, String, Number, Boolean, parseInt, parseFloat

**Notes:**
- Last expression's value is returned
- Strict mode sandbox, no browser APIs (window, document, fetch)
- No require() or import`
  },

  /**
   * 执行 JavaScript 代码
   */
  async execute(code) {
    try {
      // 在沙箱环境中执行
      const result = await this.safeExecute(code);
      
      // 格式化结果
      let output = '';
      if (result !== undefined) {
        if (typeof result === 'object') {
          output = JSON.stringify(result, null, 2);
        } else {
          output = String(result);
        }
      }
      
      return {
        success: true,
        result: result,
        output: output,
        type: typeof result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  },

  /**
   * 安全执行 JavaScript
   */
  safeExecute(code) {
    return new Promise((resolve, reject) => {
      try {
        // 创建沙箱环境
        const sandbox = {
          console: {
            log: (...args) => {
              console.log('[JS Sandbox]', ...args);
            },
            error: (...args) => {
              console.error('[JS Sandbox]', ...args);
            },
            warn: (...args) => {
              console.warn('[JS Sandbox]', ...args);
            }
          },
          Math: Math,
          JSON: JSON,
          Date: Date,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          Boolean: Boolean,
          parseInt: parseInt,
          parseFloat: parseFloat,
          isNaN: isNaN,
          isFinite: isFinite
        };
        
        // 构建沙箱代码
        const sandboxKeys = Object.keys(sandbox);
        const sandboxValues = Object.values(sandbox);
        
        const wrappedCode = `
          "use strict";
          (function(${sandboxKeys.join(', ')}) {
            try {
              return eval(${JSON.stringify(code)});
            } catch (e) {
              throw e;
            }
          })(${sandboxValues.map(v => typeof v === 'function' ? v : JSON.stringify(v)).join(', ')})
        `;
        
        const func = new Function(wrappedCode);
        const result = func();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }
};
