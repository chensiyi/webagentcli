// 模型选择器
// 负责模型列表管理、过滤、搜索等业务逻辑

class ModelSelector {
  constructor(modelManager) {
    this.modelManager = modelManager;
    this.searchKeyword = '';
  }

  /**
   * 设置搜索关键词
   */
  setSearchKeyword(keyword) {
    this.searchKeyword = keyword || '';
  }

  /**
   * 获取过滤后的模型列表
   */
  getFilteredModels() {
    const allModels = this.modelManager.getModels();
    
    if (!this.searchKeyword) {
      return allModels;
    }
    
    const keyword = this.searchKeyword.toLowerCase();
    return allModels.filter(m => m.toLowerCase().includes(keyword));
  }

  /**
   * 检查输入是否精确匹配某个模型
   */
  isExactMatch(inputValue) {
    if (!inputValue) return false;
    
    const allModels = this.modelManager.getModels();
    return allModels.some(m => m === inputValue);
  }

  /**
   * 验证模型是否在列表中
   */
  validateModel(modelId) {
    const allModels = this.modelManager.getModels();
    return allModels.includes(modelId);
  }

  /**
   * 格式化上下文长度
   */
  formatContextLength(length) {
    if (length >= 1000000) {
      return `${(length / 1000000).toFixed(0)}M`;
    } else if (length >= 1000) {
      return `${(length / 1000).toFixed(0)}K`;
    }
    return length.toString();
  }

  /**
   * 格式化价格
   */
  formatPricing(pricing) {
    if (!pricing) return '';
    
    const parts = [];
    if (pricing.prompt) {
      const price = parseFloat(pricing.prompt);
      if (price > 0) {
        parts.push(`$${(price * 1000000).toFixed(2)}/M`);
      }
    }
    
    return parts.join(' | ') || '免费';
  }

  /**
   * 获取模型显示名称
   */
  getModelDisplayName(modelId) {
    const details = this.modelManager.getModelDetails(modelId);
    return details?.name || modelId;
  }

  /**
   * 获取模型的详细信息用于浮窗显示
   */
  getModelTooltipData(modelId) {
    return this.modelManager.getModelDetails(modelId);
  }

  /**
   * 获取模型能力徽章列表
   */
  getModelCapabilityBadges(modelId) {
    const caps = this.modelManager.getCapability(modelId);
    if (!caps) return [];
    
    const badges = [];
    if (caps.vision) badges.push('🖼️ 支持图片');
    if (caps.audio) badges.push('🎤 支持音频');
    if (caps.streaming) badges.push('⚡ 支持流式');
    if (caps.tools) badges.push('🔧 支持工具');
    
    return badges;
  }
}

// 导出
window.ModelSelector = ModelSelector;
