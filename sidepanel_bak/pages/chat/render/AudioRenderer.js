// 音频消息渲染器
// 负责音频数据的渲染和播放

class AudioRenderer {
  /**
   * 渲染音频内容
   * @param {Object} item - 音频数据项 { type: 'input_audio', input_audio: { data: string } }
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  render(item) {
    const { create } = window.DOM;
    
    const audioContainer = create('div', {
      style: { margin: '8px 0' }
    });
    
    const audio = create('audio', {
      attrs: { 
        src: item.input_audio.data,
        controls: true
      },
      style: { 
        maxWidth: '100%', 
        borderRadius: '8px' 
      }
    });
    
    audioContainer.appendChild(audio);
    return audioContainer;
  }
}

window.AudioRenderer = AudioRenderer;
