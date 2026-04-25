// Thinking Mode 支持示例
// 演示如何扩展支持新的 AI 交互能力

(function() {
  'use strict';

  /**
   * Thinking Mode 渲染器
   * 用于显示模型的思考过程
   */
  class ThinkingRenderer {
    constructor() {
      this.isExpanded = false;
    }

    /**
     * 创建思考过程 UI 元素
     * @param {string} reasoningContent - 思考过程内容
     * @returns {HTMLElement}
     */
    render(reasoningContent) {
      const container = document.createElement('div');
      container.className = 'thinking-container';
      container.style.cssText = `
        margin: 8px 0;
        padding: 12px;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
        border-left: 3px solid #6366f1;
        border-radius: 8px;
        font-size: 13px;
      `;

      // 标题栏
      const header = document.createElement('div');
      header.className = 'thinking-header';
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        margin-bottom: ${this.isExpanded ? '8px' : '0'};
      `;

      const title = document.createElement('div');
      title.className = 'thinking-title';
      title.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        color: #6366f1;
        font-weight: 600;
      `;
      title.innerHTML = '🧠 思考过程';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'thinking-toggle';
      toggleBtn.style.cssText = `
        background: none;
        border: none;
        color: #6366f1;
        cursor: pointer;
        font-size: 16px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
      `;
      toggleBtn.textContent = this.isExpanded ? '▲' : '▼';
      toggleBtn.title = this.isExpanded ? '收起' : '展开';

      header.appendChild(title);
      header.appendChild(toggleBtn);

      // 内容区域
      const content = document.createElement('div');
      content.className = 'thinking-content';
      content.style.cssText = `
        color: #4b5563;
        line-height: 1.6;
        white-space: pre-wrap;
        ${this.isExpanded ? '' : 'display: none;'}
      `;
      content.textContent = reasoningContent;

      // 切换展开/收起
      header.addEventListener('click', () => {
        this.isExpanded = !this.isExpanded;
        content.style.display = this.isExpanded ? 'block' : 'none';
        toggleBtn.textContent = this.isExpanded ? '▲' : '▼';
        toggleBtn.title = this.isExpanded ? '收起' : '展开';
      });

      // hover 效果
      header.addEventListener('mouseenter', () => {
        header.style.background = 'rgba(99, 102, 241, 0.05)';
        toggleBtn.style.background = 'rgba(99, 102, 241, 0.1)';
      });

      header.addEventListener('mouseleave', () => {
        header.style.background = 'transparent';
        toggleBtn.style.background = 'transparent';
      });

      container.appendChild(header);
      container.appendChild(content);

      return container;
    }

    /**
     * 更新思考内容（流式更新）
     * @param {HTMLElement} container - 容器元素
     * @param {string} newContent - 新增的内容
     */
    update(container, newContent) {
      const content = container.querySelector('.thinking-content');
      if (content) {
        content.textContent += newContent;
      }
    }
  }

  /**
   * Tool Call 渲染器
   * 用于显示工具调用信息
   */
  class ToolCallRenderer {
    /**
     * 创建工具调用 UI 元素
     * @param {Object} toolCall - 工具调用对象
     * @returns {HTMLElement}
     */
    render(toolCall) {
      const container = document.createElement('div');
      container.className = 'tool-call-container';
      container.style.cssText = `
        margin: 8px 0;
        padding: 12px;
        background: rgba(59, 130, 246, 0.1);
        border-left: 3px solid #3b82f6;
        border-radius: 8px;
        font-size: 13px;
      `;

      const functionName = toolCall.function?.name || 'unknown';
      const args = toolCall.function?.arguments || '{}';

      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: #3b82f6; font-weight: 600; margin-bottom: 8px;">
          🔧 调用工具: ${functionName}
        </div>
        <details style="color: #6b7280;">
          <summary style="cursor: pointer; margin-bottom: 4px;">查看参数</summary>
          <pre style="background: rgba(0, 0, 0, 0.05); padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${this.formatJson(args)}</pre>
        </details>
      `;

      return container;
    }

    /**
     * 格式化 JSON
     */
    formatJson(jsonString) {
      try {
        const obj = JSON.parse(jsonString);
        return JSON.stringify(obj, null, 2);
      } catch (e) {
        return jsonString;
      }
    }
  }

  /**
   * 注册消息处理器
   */
  function registerMessageHandlers() {
    const registry = window.MessageTypes.MessageHandlerRegistry;
    const ContentType = window.MessageTypes.ContentType;

    // 注册 thinking 内容处理器
    registry.register(ContentType.REASONING, (contentItem, options = {}) => {
      const renderer = new ThinkingRenderer();
      return renderer.render(contentItem.reasoning || contentItem.text || '');
    });

    // 注册 tool_call 内容处理器
    registry.register(ContentType.TOOL_CALL, (contentItem, options = {}) => {
      const renderer = new ToolCallRenderer();
      return renderer.render(contentItem.tool_call || {});
    });

    console.log('[ThinkingMode] Message handlers registered');
  }

  /**
   * 注册自定义能力检测器
   */
  function registerCapabilityDetectors() {
    const capabilityManager = window.MessageTypes.CapabilityManager;
    const ModelCapability = window.MessageTypes.ModelCapability;

    // 注册 thinking 能力检测器
    capabilityManager.registerDetector(ModelCapability.THINKING, (modelName) => {
      const lower = modelName.toLowerCase();
      
      // 白名单
      const thinkingModels = [
        'deepseek-r1', 'qwq', 'qwen3', 'glm-4.5',
        'o1', 'o3', 'claude-3-opus'
      ];
      
      if (thinkingModels.some(keyword => lower.includes(keyword))) {
        return true;
      }

      // 启发式检测
      const thinkingKeywords = ['thinking', 'reasoning', 'think', 'r1', 'qwq'];
      return thinkingKeywords.some(keyword => {
        const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
        return regex.test(lower);
      });
    });

    console.log('[ThinkingMode] Capability detectors registered');
  }

  /**
   * 初始化
   */
  function init() {
    if (!window.MessageTypes) {
      console.error('[ThinkingMode] MessageTypes not loaded');
      return;
    }

    registerMessageHandlers();
    registerCapabilityDetectors();

    console.log('[ThinkingMode] Initialized');
  }

  // 导出
  window.ThinkingMode = {
    ThinkingRenderer,
    ToolCallRenderer,
    init
  };

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
