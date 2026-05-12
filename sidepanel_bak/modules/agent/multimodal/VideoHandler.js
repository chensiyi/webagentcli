// 视频处理器
// 负责视频上传、预览、压缩等多媒体处理

class VideoHandler {
  constructor() {
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  }

  /**
   * 验证视频文件
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: '未选择文件' };
    }

    if (!this.allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: `不支持的文件类型: ${file.type}` 
      };
    }

    if (file.size > this.maxFileSize) {
      return { 
        valid: false, 
        error: `文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB (最大${this.maxFileSize / 1024 / 1024}MB)` 
      };
    }

    return { valid: true };
  }

  /**
   * 读取视频为DataURL
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 获取视频时长和尺寸
   */
  getVideoInfo(dataUrl) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({
          duration: Math.round(video.duration),
          width: video.videoWidth,
          height: video.videoHeight,
          size: Math.round(dataUrl.length * 0.75) // 估算大小
        });
      };
      video.onerror = reject;
      video.src = dataUrl;
    });
  }

  /**
   * 创建视频预览URL
   */
  createPreviewUrl(dataUrl) {
    return dataUrl;
  }

  /**
   * 撤销预览URL
   */
  revokePreviewUrl(url) {
    // DataURL不需要撤销
  }

  /**
   * 生成视频缩略图
   */
  generateThumbnail(dataUrl, time = 0) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.onloadeddata = () => {
        video.currentTime = time;
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      
      video.onerror = reject;
      video.src = dataUrl;
    });
  }

  /**
   * 播放视频
   */
  playVideo(dataUrl, container) {
    const video = document.createElement('video');
    video.controls = true;
    video.style.maxWidth = '100%';
    video.style.borderRadius = '8px';
    video.src = dataUrl;
    
    if (container) {
      container.innerHTML = '';
      container.appendChild(video);
    }
    
    return video;
  }

  /**
   * 压缩视频（简化版，实际需要使用ffmpeg.wasm）
   */
  async compressVideo(dataUrl, options = {}) {
    // TODO: 实现视频压缩
    // 这里可以集成 ffmpeg.wasm 进行真正的视频压缩
    console.warn('[VideoHandler] 视频压缩功能待实现');
    return dataUrl;
  }
}

// 导出
window.VideoHandler = VideoHandler;
