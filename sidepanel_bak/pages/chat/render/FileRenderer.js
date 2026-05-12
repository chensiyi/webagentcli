// 文件消息渲染器
// 负责通用文件（非视频）的渲染和下载

class FileRenderer {
  /**
   * 渲染文件内容
   * @param {Object} item - 文件数据项 { type: 'file', file: { data: string, filename: string, mimeType: string } }
   * @returns {HTMLElement} 渲染后的 DOM 元素
   */
  render(item) {
    const { create } = window.DOM;
    
    const fileContainer = create('div', {
      style: { margin: '8px 0' }
    });
    
    // 显示为可下载链接
    const link = create('a', {
      attrs: {
        href: item.file.data,
        download: item.file.filename,
        target: '_blank'
      },
      text: `📎 ${item.file.filename}`,
      style: {
        display: 'inline-block',
        padding: '8px 12px',
        background: 'var(--color-surface)',
        borderRadius: '6px',
        textDecoration: 'none',
        color: 'var(--color-primary)'
      }
    });
    
    fileContainer.appendChild(link);
    return fileContainer;
  }
}

window.FileRenderer = FileRenderer;
