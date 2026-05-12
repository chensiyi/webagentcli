// 用户脚本沙箱上下文
// 负责创建GM API隔离环境

window.UserScriptSandbox = {
  /**
   * 创建沙箱上下文
   */
  createSandboxContext(scriptId, scriptInfo) {
    return {
      GM: {
        // 存储 API
        getValue: async (key, defaultValue) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          const result = await chrome.storage.local.get(namespacedKey);
          return result[namespacedKey] !== undefined ? result[namespacedKey] : defaultValue;
        },
        
        setValue: async (key, value) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          await chrome.storage.local.set({ [namespacedKey]: value });
        },
        
        deleteValue: async (key) => {
          const namespacedKey = `gm:${scriptId}:${key}`;
          await chrome.storage.local.remove(namespacedKey);
        },
        
        listValues: async () => {
          const result = await chrome.storage.local.get(null);
          return Object.keys(result)
            .filter(key => key.startsWith(`gm:${scriptId}:`))
            .map(key => key.replace(`gm:${scriptId}:`, ''));
        },
        
        // 样式 API
        addStyle: (css) => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          return style;
        },
        
        // 日志 API
        log: (...args) => {
          console.log(`[GM:${scriptInfo?.name || scriptId}]`, ...args);
        },
        
        // 脚本信息
        info: {
          script: {
            name: scriptInfo?.name || '',
            version: scriptInfo?.version || '',
            description: scriptInfo?.description || '',
            namespace: scriptInfo?.namespace || ''
          }
        }
      }
    };
  },

  /**
   * 包装脚本代码，注入GM API
   */
  wrapCode(code, sandboxContext) {
    return `
(function() {
  'use strict';
  
  const GM = {
    getValue: ${sandboxContext.GM.getValue.toString()},
    setValue: ${sandboxContext.GM.setValue.toString()},
    deleteValue: ${sandboxContext.GM.deleteValue.toString()},
    listValues: ${sandboxContext.GM.listValues.toString()},
    addStyle: ${sandboxContext.GM.addStyle.toString()},
    log: ${sandboxContext.GM.log.toString()},
    info: ${JSON.stringify(sandboxContext.GM.info)}
  };
  
  const GM_getValue = GM.getValue;
  const GM_setValue = GM.setValue;
  const GM_deleteValue = GM.deleteValue;
  const GM_listValues = GM.listValues;
  const GM_addStyle = GM.addStyle;
  const GM_log = GM.log;
  const GM_info = GM.info;
  
  ${code}
})();
`;
  }
};
