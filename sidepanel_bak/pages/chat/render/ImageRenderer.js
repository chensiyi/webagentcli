// 图片消息渲染器
// 负责图片 URL 的渲染和预览

class ImageRenderer {
  /**
   * 渲染图片内容
   * @param {Object} item - 图片数据项 { type: 'image_url', image_url: { url: string } }
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  render(item) {
    const { create } = window.DOM;
    
    const imgContainer = create('div', {
      style: { margin: '8px 0' }
    });
    
    const img = create('img', {
      attrs: { src: item.image_url.url },
      style: { 
        maxWidth: '100%', 
        borderRadius: '8px', 
        cursor: 'pointer' 
      }
    });
    
    img.onclick = () => window.open(item.image_url.url, '_blank');
    imgContainer.appendChild(img);
    
    return imgContainer;
  }
}

window.ImageRenderer = ImageRenderer;
