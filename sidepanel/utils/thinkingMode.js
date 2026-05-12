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
      
      // 标题栏
      const header = document.createElement('div');
      header.className = 'thinking-header';

      const title = document.createElement('div');
      title.className = 'thinking-title';
      title.innerHTML = '<span class="thinking-icon">💭</span><span class="thinking-label">思考</span>';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'thinking-toggle';
      toggleBtn.textContent = '▼';
      toggleBtn.title = '展开';

      header.appendChild(title);
      header.appendChild(toggleBtn);

      // 内容区域
      const content = document.createElement('div');
      content.className = 'thinking-content';
      content.style.display = 'none'; // 默认收起
      content.textContent = reasoningContent || '';

      // 切换展开/收起
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isExpanded = !this.isExpanded;
        content.style.display = this.isExpanded ? 'block' : 'none';
        toggleBtn.textContent = this.isExpanded ? '▲' : '▼';
        toggleBtn.title = this.isExpanded ? '收起' : '展开';
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
        margin: 4px 0;
        padding: 6px 10px;
        background: var(--color-surface);
        border-left: 2px solid var(--color-primary);
        border-radius: 4px;
        font-size: 12px;
      `;

      const functionName = toolCall.function?.name || 'unknown';
      const args = toolCall.function?.arguments || '{}';

      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 4px; color: var(--color-primary); font-weight: 500; margin-bottom: 4px; font-size: 11px;">
          🔧 ${functionName}
        </div>
        <details style="color: var(--color-text-secondary); font-size: 11px;">
          <summary style="cursor: pointer; margin-bottom: 2px; font-size: 11px;">参数</summary>
          <pre style="background: var(--color-bg); padding: 4px 6px; border-radius: 3px; overflow-x: auto; font-size: 10px; margin: 0;">${this.formatJson(args)}</pre>
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
