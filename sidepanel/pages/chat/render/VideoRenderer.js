// 视频消息渲染器
// 负责视频文件的渲染和播放

class VideoRenderer {
  /**
   * 渲染视频内容
   * @param {Object} item - 视频数据项 { type: 'file', file: { data: string, mimeType: string, filename: string } }
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  render(item) {
    const { create } = window.DOM;
    
    const videoContainer = create('div', {
      style: { margin: '8px 0' }
    });
    
    const video = create('video', {
      attrs: { 
        src: item.file.data,
        controls: true
      },
      style: { 
        maxWidth: '100%', 
        maxHeight: '300px', 
        borderRadius: '8px' 
      }
    });
    
    videoContainer.appendChild(video);
    return videoContainer;
  }
}

window.VideoRenderer = VideoRenderer;
