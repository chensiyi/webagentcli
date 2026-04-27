// 图片处理器
// 负责图片上传、预览、压缩等多模态处理

class ImageHandler {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  }

  /**
   * 验证图片文件
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
   * 读取图片为DataURL
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
   * 创建预览URL
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
   * 压缩图片
   */
  async compressImage(dataUrl, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 计算缩放比例
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  /**
   * 获取图片信息
   */
  getImageInfo(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
          size: Math.round(dataUrl.length * 0.75) // 估算大小
        });
      };
      img.src = dataUrl;
    });
  }
}

// 导出
window.ImageHandler = ImageHandler;
