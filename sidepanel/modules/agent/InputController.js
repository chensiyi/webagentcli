// 输入控制器
// 根据模型能力动态管理输入按钮的显示和隐藏

class InputController {
  constructor(modelManager) {
    this.modelManager = modelManager;
    this.currentModelCapabilities = null;
  }

  /**
   * 更新当前模型的能力
   */
  updateModelCapabilities(modelId) {
    if (!modelId) {
      this.currentModelCapabilities = null;
      return;
    }

    const modelInfo = this.modelManager.getModelFullInfo(modelId);
    this.currentModelCapabilities = modelInfo?.capability || null;
  }

  /**
   * 检查是否支持图片输入
   */
  supportsImage() {
    return this.currentModelCapabilities?.vision || false;
  }

  /**
   * 检查是否支持音频输入
   */
  supportsAudio() {
    return this.currentModelCapabilities?.audio || false;
  }

  /**
   * 检查是否支持视频输入
   */
  supportsVideo() {
    // 目前API中video在input_modalities中
    const details = this.modelManager.getModelDetails(this.getCurrentModel());
    return details?.input_modalities?.includes('video') || false;
  }

  /**
   * 检查是否支持工具调用
   */
  supportsTools() {
    return this.currentModelCapabilities?.tools || false;
  }

  /**
   * 获取当前模型ID
   */
  getCurrentModel() {
    // 从设置中获取当前模型
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        resolve(result.settings?.model || null);
      });
    });
  }

  /**
   * 初始化（异步）
   */
  async initialize() {
    const modelId = await this.getCurrentModel();
    this.updateModelCapabilities(modelId);
  }

  /**
   * 获取所有能力的摘要信息
   */
  getCapabilitySummary() {
    if (!this.currentModelCapabilities) {
      return {
        image: false,
        audio: false,
        video: false,
        tools: false
      };
    }

    return {
      image: this.supportsImage(),
      audio: this.supportsAudio(),
      video: this.supportsVideo(),
      tools: this.supportsTools()
    };
  }
}

// 导出
window.InputController = InputController;
