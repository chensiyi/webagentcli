/**
 * MediaContent - 多媒体内容模型（协议无关）
 * 
 * 表示消息中的多媒体内容（图片、音频、文件等）。
 * Message.content 可以是字符串或多媒体内容数组。
 */

class MediaContent {
  /**
   * @param {Object} params
   * @param {'text'|'image'|'audio'|'file'} params.type - 内容类型
   * @param {string} [params.text] - 文本内容（type='text' 时必需）
   * @param {string} [params.image_url] - 图片 URL 或 base64 data URL（type='image' 时必需）
   * @param {string} [params.audio_url] - 音频 URL（type='audio' 时必需）
   * @param {string} [params.file_url] - 文件 URL（type='file' 时必需）
   * @param {string} [params.mime_type] - MIME 类型
   * @param {string} [params.name] - 文件名
   * @param {number} [params.size] - 文件大小（字节）
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor({
    type,
    text = null,
    image_url = null,
    audio_url = null,
    file_url = null,
    mime_type = null,
    name = null,
    size = null,
    metadata = {}
  }) {
    // 验证类型
    if (!['text', 'image', 'audio', 'file'].includes(type)) {
      throw new Error(`Invalid media content type: ${type}`);
    }

    this.type = type;
    
    // 根据类型验证必填字段
    switch (type) {
      case 'text':
        if (!text) {
          throw new Error('Text content is required for type "text"');
        }
        this.text = text;
        break;
      
      case 'image':
        if (!image_url) {
          throw new Error('image_url is required for type "image"');
        }
        this.image_url = image_url;
        break;
      
      case 'audio':
        if (!audio_url) {
          throw new Error('audio_url is required for type "audio"');
        }
        this.audio_url = audio_url;
        break;
      
      case 'file':
        if (!file_url) {
          throw new Error('file_url is required for type "file"');
        }
        this.file_url = file_url;
        break;
    }

    this.mime_type = mime_type;
    this.name = name;
    this.size = size;
    this.metadata = metadata;
  }

  /**
   * 判断是否为文本
   */
  isText() {
    return this.type === 'text';
  }

  /**
   * 判断是否为图片
   */
  isImage() {
    return this.type === 'image';
  }

  /**
   * 判断是否为音频
   */
  isAudio() {
    return this.type === 'audio';
  }

  /**
   * 判断是否为文件
   */
  isFile() {
    return this.type === 'file';
  }

  /**
   * 获取内容的显示文本
   */
  getDisplayText() {
    switch (this.type) {
      case 'text':
        return this.text;
      case 'image':
        return `[图片: ${this.name || '未命名'}]`;
      case 'audio':
        return `[音频: ${this.name || '未命名'}]`;
      case 'file':
        return `[文件: ${this.name || '未命名'}]`;
      default:
        return '';
    }
  }

  /**
   * 转换为 OpenAI 多模态格式
   * @returns {Object}
   */
  toOpenAIFormat() {
    switch (this.type) {
      case 'text':
        return {
          type: 'text',
          text: this.text
        };
      
      case 'image':
        return {
          type: 'image_url',
          image_url: {
            url: this.image_url,
            detail: this.metadata.detail || 'auto'
          }
        };
      
      default:
        throw new Error(`Unsupported type for OpenAI format: ${this.type}`);
    }
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      type: this.type,
      text: this.text,
      image_url: this.image_url,
      audio_url: this.audio_url,
      file_url: this.file_url,
      mime_type: this.mime_type,
      name: this.name,
      size: this.size,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建 MediaContent 实例
   */
  static fromJSON(obj) {
    return new MediaContent(obj);
  }

  /**
   * 创建文本内容
   * @param {string} text 
   * @returns {MediaContent}
   */
  static createText(text) {
    return new MediaContent({ type: 'text', text });
  }

  /**
   * 创建图片内容
   * @param {string} imageUrl - URL 或 base64 data URL
   * @param {Object} options 
   * @returns {MediaContent}
   */
  static createImage(imageUrl, options = {}) {
    return new MediaContent({
      type: 'image',
      image_url: imageUrl,
      ...options
    });
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.MediaContent = MediaContent;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MediaContent;
}
