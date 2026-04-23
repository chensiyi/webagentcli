// ==================== Tool Registry ====================
// 工具注册表 - 向 AI 暴露可用能力

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.initBuiltInTools();
  }
  
  /**
   * 初始化工具
   */
  initBuiltInTools() {
    // 1. 读取页面内容
    this.register('read_page', {
      description: 'Read content from the current page',
      parameters: {
        type: 'object',
        properties: {
          selector: { 
            type: 'string',
            description: 'CSS selector to find the element'
          }
        },
        required: ['selector']
      }
    }, async ({ selector }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      
      return await chrome.tabs.sendMessage(tab.id, {
        action: 'READ_DOM',
        payload: { selector }
      });
    });
    
    // 2. 点击元素
    this.register('click_element', {
      description: 'Click an element on the page',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the element to click'
          }
        },
        required: ['selector']
      }
    }, async ({ selector }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      
      return await chrome.tabs.sendMessage(tab.id, {
        action: 'CLICK_ELEMENT',
        payload: { selector }
      });
    });
    
    // 3. 填写表单
    this.register('fill_form', {
      description: 'Fill a form field with value',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the input field'
          },
          value: {
            type: 'string',
            description: 'Value to fill'
          }
        },
        required: ['selector', 'value']
      }
    }, async ({ selector, value }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      
      return await chrome.tabs.sendMessage(tab.id, {
        action: 'FILL_FORM',
        payload: { selector, value }
      });
    });
    
    // 4. 获取页面信息
    this.register('get_page_info', {
      description: 'Get current page URL and title',
      parameters: {
        type: 'object',
        properties: {}
      }
    }, async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      
      return {
        url: tab.url,
        title: tab.title
      };
    });
  }
  
  /**
   * 注册工具
   */
  register(name, schema, executor) {
    this.tools.set(name, { schema, executor });
    console.log(`[ToolRegistry] Registered: ${name}`);
  }
  
  /**
   * 获取所有工具定义（发送给 AI）
   */
  getDefinitions() {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      type: 'function',
      function: {
        name,
        description: tool.schema.description,
        parameters: tool.schema.parameters
      }
    }));
  }
  
  /**
   * 执行工具
   */
  async execute(name, params) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }
    
    console.log(`[ToolRegistry] Executing: ${name}`, params);
    
    try {
      const result = await tool.executor(params);
      console.log(`[ToolRegistry] Success: ${name}`, result);
      return { success: true, data: result };
    } catch (error) {
      console.error(`[ToolRegistry] Error: ${name}`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 检查工具是否存在
   */
  hasTool(name) {
    return this.tools.has(name);
  }
}

// 导出单例
export default new ToolRegistry();
