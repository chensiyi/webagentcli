// 输入控制器
// 根据模型能力动态管理输入按钮的显示和隐藏

class InputController {
  constructor(modelManager) {
    this.modelManager = modelManager;
    this.currentModelCapabilities = null;
    this.currentModelId = null; // 缓存当前模型ID
  }

  /**
   * 更新当前模型的能力
   */
  updateModelCapabilities(modelId) {
    if (!modelId) {
      this.currentModelCapabilities = null;
      this.currentModelId = null;
      return;
    }

    this.currentModelId = modelId;
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
    // 优先从 capability 中检测
    if (this.currentModelCapabilities?.video) {
      console.log('[InputController] Video supported from capabilities');
      return true;
    }
    
    // 其次从 input_modalities 中检测
    if (this.currentModelId) {
      const details = this.modelManager.getModelDetails(this.currentModelId);
      console.log('[InputController] Checking video from details:', {
        modelId: this.currentModelId,
        inputModalities: details?.input_modalities
      });
      if (details?.input_modalities?.includes('video')) {
        console.log('[InputController] Video supported from input_modalities');
        return true;
      }
    }
    
    console.log('[InputController] Video NOT supported');
    return false;
  }

  /**
   * 检查是否支持工具调用
   */
  supportsTools() {
    return this.currentModelCapabilities?.tools || false;
  }

  /**
   * 检查是否支持流式输出
   */
  supportsStreaming() {
    return this.currentModelCapabilities?.streaming || false;
  }

  /**
   * 获取当前模型ID
   */
  getCurrentModel() {
    // 优先返回缓存的模型ID
    if (this.currentModelId) {
      return Promise.resolve(this.currentModelId);
    }
    
    // 从设置中获取当前模型
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const modelId = result.settings?.model || null;
        this.currentModelId = modelId; // 缓存
        resolve(modelId);
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
        tools: false,
        streaming: false
      };
    }

    return {
      image: this.supportsImage(),
      audio: this.supportsAudio(),
      video: this.supportsVideo(),
      tools: this.supportsTools(),
      streaming: this.supportsStreaming()
    };
  }
}

// 导出
window.InputController = InputController;
