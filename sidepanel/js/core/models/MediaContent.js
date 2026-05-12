/**
 * MediaContent - 多媒体内容模型（协议无关）
 * 
 * 表示消息中的多媒体内容，不包含任何 API 标准相关的字段。
 */

class MediaContent {
  /**
   * @param {Object} params
   * @param {'text'|'image'|'audio'|'file'} params.type - 内容类型
   * @param {string} [params.text] - 文本内容
   * @param {string} [params.dataUrl] - 数据 URL（base64 或远程 URL）
   * @param {string} [params.url] - 远程 URL
   * @param {string} [params.filename] - 文件名
   * @param {string} [params.mimeType] - MIME 类型
   * @param {number} [params.size] - 文件大小（字节）
   * @param {Object} [params.metadata] - 额外元数据
   */
  constructor({
    type,
    text = null,
    dataUrl = null,
    url = null,
    filename = null,
    mimeType = null,
    size = null,
    metadata = {}
  }) {
    if (!['text', 'image', 'audio', 'file'].includes(type)) {
      throw new Error(`Invalid media content type: ${type}`);
    }

    this.type = type;
    
    // 根据类型验证必填字段
    if (type === 'text' && !text) {
      throw new Error('Text content is required for type "text"');
    }
    if ((type === 'image' || type === 'audio' || type === 'file') && !dataUrl && !url) {
      throw new Error(`dataUrl or url is required for type "${type}"`);
    }

    this.text = text;
    this.dataUrl = dataUrl;
    this.url = url;
    this.filename = filename;
    this.mimeType = mimeType;
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
   * 获取显示文本（用于 UI 展示）
   */
  getDisplayText() {
    switch (this.type) {
      case 'text':
        return this.text;
      case 'image':
        return `[图片: ${this.filename || '未命名'}]`;
      case 'audio':
        return `[音频: ${this.filename || '未命名'}]`;
      case 'file':
        return `[文件: ${this.filename || '未命名'}]`;
      default:
        return '';
    }
  }

  /**
   * 获取数据源（优先使用 dataUrl，其次 url）
   */
  getSource() {
    return this.dataUrl || this.url;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      type: this.type,
      text: this.text,
      dataUrl: this.dataUrl,
      url: this.url,
      filename: this.filename,
      mimeType: this.mimeType,
      size: this.size,
      metadata: this.metadata
    };
  }

  /**
   * 从普通对象创建实例
   */
  static fromJSON(obj) {
    return new MediaContent(obj);
  }

  /**
   * 工厂方法：创建文本内容
   */
  static createText(text) {
    return new MediaContent({ type: 'text', text });
  }

  /**
   * 工厂方法：创建图片内容
   */
  static createImage(dataUrlOrUrl, options = {}) {
    const isDataUrl = dataUrlOrUrl.startsWith('data:');
    return new MediaContent({
      type: 'image',
      dataUrl: isDataUrl ? dataUrlOrUrl : null,
      url: isDataUrl ? null : dataUrlOrUrl,
      ...options
    });
  }

  /**
   * 工厂方法：创建音频内容
   */
  static createAudio(dataUrlOrUrl, options = {}) {
    const isDataUrl = dataUrlOrUrl.startsWith('data:');
    return new MediaContent({
      type: 'audio',
      dataUrl: isDataUrl ? dataUrlOrUrl : null,
      url: isDataUrl ? null : dataUrlOrUrl,
      ...options
    });
  }
}

// 导出（同时支持 ES Module 和全局变量）
if (typeof window !== 'undefined') {
  window.MediaContent = MediaContent;
}
export { MediaContent };
