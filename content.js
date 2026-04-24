// ==================== Content Script ====================
// 页面交互代理

console.log('[ContentScript] Initialized');

class ContentAgent {
  constructor() {
    console.log('[ContentAgent] Initialized');
    
    // 监听来自 Background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then(sendResponse).catch(error => {
        console.error('[ContentAgent Error]', error);
        sendResponse({ success: false, error: error.message });
      });
      
      return true; // 异步响应
    });
  }
  
  /**
   * 处理消息
   */
  async handleMessage(message) {
    const { action, payload } = message;
    
    console.log(`[ContentAgent] Action: ${action}`, payload);
    
    switch (action) {
      case 'READ_DOM':
        return this.readDOM(payload.selector);
      
      case 'CLICK_ELEMENT':
        return this.clickElement(payload.selector);
      
      case 'FILL_FORM':
        return this.fillForm(payload.selector, payload.value);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  /**
   * 读取 DOM 内容
   */
  readDOM(selector) {
    try {
      const element = document.querySelector(selector);
      
      if (!element) {
        return {
          success: false,
          error: `Element not found: ${selector}`
        };
      }
      
      return {
        success: true,
        data: {
          text: element.textContent?.trim() || '',
          html: element.innerHTML || '',
          tagName: element.tagName,
          attributes: this.getElementAttributes(element)
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
   * 点击元素
   */
  clickElement(selector) {
    try {
      const element = document.querySelector(selector);
      
      if (!element) {
        return {
          success: false,
          error: `Element not found: ${selector}`
        };
      }
      
      element.click();
      
      return {
        success: true,
        data: { clicked: true }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 填写表单
   */
  fillForm(selector, value) {
    try {
      const element = document.querySelector(selector);
      
      if (!element) {
        return {
          success: false,
          error: `Element not found: ${selector}`
        };
      }
      
      // 设置值
      element.value = value;
      
      // 触发事件（让 React/Vue 等框架检测到变化）
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      return {
        success: true,
        data: { filled: true }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 获取元素属性
   */
  getElementAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
}

// 启动
new ContentAgent();
