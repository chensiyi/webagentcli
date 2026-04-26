// 模型能力检测工具
// 负责判断模型是否支持视觉、音频、工具调用等能力

window.ModelCapabilityDetector = {
  /**
   * 检查视觉支持（白名单 + 启发式检测）
   */
  checkVisionSupport(modelNameLower) {
    // 1. 经过验证的支持视觉的模型白名单
    const visionModels = [
      // OpenAI
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      
      // Anthropic Claude
      'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
      'claude-3.5-sonnet', 'claude-3.5-haiku',
      'claude-3.7-sonnet',
      
      // Google Gemini
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'gemini-2.0-pro', 'gemini-2.0-flash',
      'gemini-exp',
      
      // Google Gemma
      'gemma',
      
      // Qwen (阿里云)
      'qwen-vl', 'qwen2-vl', 'qwen3-vl',
      
      // LLaVA
      'llava', 'llava-v1.6',
      
      // Yi (零一万物)
      'yi-vision',
      
      // GLM (智谱)
      'glm-4v', 'glm-4-plus'
    ];
    
    // 2. 白名单匹配
    if (visionModels.some(keyword => modelNameLower.includes(keyword))) {
      return true;
    }
    
    // 3. 启发式检测：名称中包含明确的视觉相关关键词
    const visionKeywords = [
      'vision', 'vl', 'visual', 'image', 'img',
      'multimodal', 'mm', 'multi-modal'
    ];
    
    return visionKeywords.some(keyword => {
      // 确保是独立的词或后缀，避免误判
      const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
      return regex.test(modelNameLower);
    });
  },
  
  /**
   * 检查音频支持（白名单 + 启发式检测）
   */
  checkAudioSupport(modelNameLower) {
    // 1. 白名单
    const audioModels = [
      // OpenAI - GPT-4o 系列支持实时音频
      'gpt-4o-realtime', 'gpt-4o-audio',
      'gpt-4o-mini-realtime',
      
      // Google Gemini - 支持音频输入
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'gemini-2.0-pro', 'gemini-2.0-flash',
      
      // 专门的音频模型
      'whisper', 'speech-to-text'
    ];
    
    if (audioModels.some(keyword => modelNameLower.includes(keyword))) {
      return true;
    }
    
    // 2. 启发式检测
    const audioKeywords = [
      'audio', 'voice', 'speech', 'sound',
      'realtime', 'real-time', 'stt', 'tts'
    ];
    
    return audioKeywords.some(keyword => {
      const regex = new RegExp(`(^|[-_/\\s])${keyword}($|[-_/\\s])`, 'i');
      return regex.test(modelNameLower);
    });
  },
  
  /**
   * 检查工具调用支持
   */
  checkToolsSupport(modelNameLower) {
    const toolKeywords = [
      'gpt-4', 'gpt-3.5-turbo', 'claude', 'gemini'
    ];
    
    return toolKeywords.some(keyword => modelNameLower.includes(keyword));
  },
  
  /**
   * 估算上下文窗口大小
   */
  estimateContextWindow(modelNameLower) {
    // GPT-4 系列
    if (modelNameLower.includes('gpt-4o')) return 128000;
    if (modelNameLower.includes('gpt-4-32k')) return 32768;
    if (modelNameLower.includes('gpt-4')) return 8192;
    if (modelNameLower.includes('gpt-3.5')) return 16385;
    
    // Claude 系列
    if (modelNameLower.includes('claude-3')) return 200000;
    if (modelNameLower.includes('claude-2')) return 100000;
    
    // Gemini 系列
    if (modelNameLower.includes('gemini')) return 32768;
    
    // Llama 系列
    if (modelNameLower.includes('llama-3')) return 8192;
    
    // 默认保守估计
    return 8192;
  }
};
