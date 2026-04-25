// 多媒体工具函数
window.MediaUtils = {
  // 将文件转换为 base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // 压缩图片（限制最大尺寸）
  async compressImage(file, maxWidth = 1024, maxHeight = 1024) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        let width = img.width;
        let height = img.height;
        
        // 计算缩放比例
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.8);
      };
      
      img.src = url;
    });
  },

  // 验证图片文件
  validateImage(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
      throw new Error('不支持的图片格式，请使用 JPG、PNG、GIF 或 WebP');
    }
    
    if (file.size > maxSize) {
      throw new Error('图片大小不能超过 10MB');
    }
    
    return true;
  },

  // 创建图片预览 URL
  createPreview(file) {
    return URL.createObjectURL(file);
  },

  // 释放预览 URL
  revokePreview(url) {
    URL.revokeObjectURL(url);
  }
};
