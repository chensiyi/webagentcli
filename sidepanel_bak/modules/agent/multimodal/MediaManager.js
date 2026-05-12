// 多媒体管理器
// 统一管理图片、音频、视频等多媒体资源

class MediaManager {
  constructor() {
    this.imageHandler = new window.ImageHandler();
    this.audioHandler = new window.AudioHandler();
    this.videoHandler = new window.VideoHandler();
    
    // 待处理的多媒体文件
    this.pendingMedia = [];
  }

  /**
   * 验证文件并返回对应的处理器
   */
  validateAndClassify(file) {
    if (file.type.startsWith('image/')) {
      const result = this.imageHandler.validateFile(file);
      return { 
        type: 'image', 
        handler: this.imageHandler, 
        valid: result.valid,
        error: result.error 
      };
    }
    
    if (file.type.startsWith('audio/')) {
      const result = this.audioHandler.validateFile(file);
      return { 
        type: 'audio', 
        handler: this.audioHandler, 
        valid: result.valid,
        error: result.error 
      };
    }
    
    if (file.type.startsWith('video/')) {
      const result = this.videoHandler.validateFile(file);
      return { 
        type: 'video', 
        handler: this.videoHandler, 
        valid: result.valid,
        error: result.error 
      };
    }
    
    return {
      type: 'unknown',
      handler: null,
      valid: false,
      error: `不支持的文件类型: ${file.type}`
    };
  }

  /**
   * 处理文件上传
   */
  async processFile(file) {
    const classification = this.validateAndClassify(file);
    
    if (!classification.valid) {
      throw new Error(classification.error);
    }

    const dataUrl = await classification.handler.readFileAsDataURL(file);
    const previewUrl = classification.handler.createPreviewUrl(dataUrl);
    
    const mediaItem = {
      type: classification.type,
      file: file,
      dataUrl: dataUrl,
      previewUrl: previewUrl,
      filename: file.name,
      timestamp: Date.now()
    };

    // 获取额外信息
    if (classification.type === 'image') {
      const info = await classification.handler.getImageInfo(dataUrl);
      mediaItem.width = info.width;
      mediaItem.height = info.height;
      mediaItem.size = info.size;
    } else if (classification.type === 'audio') {
      const info = await classification.handler.getAudioInfo(dataUrl);
      mediaItem.duration = info.duration;
      mediaItem.size = info.size;
    } else if (classification.type === 'video') {
      const info = await classification.handler.getVideoInfo(dataUrl);
      mediaItem.duration = info.duration;
      mediaItem.width = info.width;
      mediaItem.height = info.height;
      mediaItem.size = info.size;
      
      // 生成缩略图
      try {
        mediaItem.thumbnail = await classification.handler.generateThumbnail(dataUrl);
      } catch (e) {
        console.warn('[MediaManager] 生成视频缩略图失败:', e);
      }
    }

    this.pendingMedia.push(mediaItem);
    return mediaItem;
  }

  /**
   * 批量处理文件
   */
  async processFiles(files) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.processFile(file);
        results.push(result);
      } catch (error) {
        errors.push({ filename: file.name, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * 移除多媒体文件
   */
  removeMedia(index) {
    if (index >= 0 && index < this.pendingMedia.length) {
      const removed = this.pendingMedia.splice(index, 1)[0];
      
      // 撤销预览URL
      if (removed.previewUrl) {
        const handler = this.getHandlerByType(removed.type);
        if (handler) {
          handler.revokePreviewUrl(removed.previewUrl);
        }
      }
      
      return removed;
    }
    return null;
  }

  /**
   * 清空所有待处理的多媒体
   */
  clearAll() {
    this.pendingMedia.forEach(media => {
      const handler = this.getHandlerByType(media.type);
      if (handler && media.previewUrl) {
        handler.revokePreviewUrl(media.previewUrl);
      }
    });
    this.pendingMedia = [];
  }

  /**
   * 根据类型获取处理器
   */
  getHandlerByType(type) {
    switch (type) {
      case 'image':
        return this.imageHandler;
      case 'audio':
        return this.audioHandler;
      case 'video':
        return this.videoHandler;
      default:
        return null;
    }
  }

  /**
   * 获取所有待处理的多媒体
   */
  getPendingMedia() {
    return this.pendingMedia;
  }

  /**
   * 开始录音
   */
  async startRecording() {
    return await this.audioHandler.startRecording();
  }

  /**
   * 停止录音并添加到待处理列表
   */
  async stopRecording() {
    const result = await this.audioHandler.stopRecording();
    
    if (result.success) {
      const dataUrl = await this.audioHandler.blobToDataURL(result.blob);
      const previewUrl = this.audioHandler.createPreviewUrl(dataUrl);
      
      const mediaItem = {
        type: 'audio',
        dataUrl: dataUrl,
        previewUrl: previewUrl,
        filename: `录音_${new Date().getTime()}.webm`,
        timestamp: Date.now(),
        isRecording: true
      };

      const info = await this.audioHandler.getAudioInfo(dataUrl);
      mediaItem.duration = info.duration;
      mediaItem.size = info.size;

      this.pendingMedia.push(mediaItem);
      return mediaItem;
    }
    
    return null;
  }
}

// 导出
window.MediaManager = MediaManager;
