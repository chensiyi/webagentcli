/**
 * CaptureVisibleTabTool - 截取当前可见标签页为图片
 *
 * 运行在 Service Worker 中，调用 chrome.tabs.captureVisibleTab。
 * 属于「模型自我编辑/管理基础设施」：模型在推理中自主决定何时截图，
 * 经工具调用完成，无需前端写死按钮。
 *
 * 截图经 mediaStore 持久化（本地 IndexedDB 或远端资源服务器，按设置切换），
 * tool 结果消息仅持 mediaId 引用，避免 chrome.storage 配额膨胀。
 */
import { Tool } from 'kernel/models/Tool.js';
import { Log } from 'kernel/services/Log.js';

class CaptureVisibleTabTool extends Tool {
  constructor(kernel, mediaStore) {
    super({
      name: 'capture_visible_tab',
      description:
        '截取当前浏览器活动标签页的可见区域为一张图片，供视觉分析使用。' +
        '当你需要「看」用户正在浏览的页面（如页面布局、报错信息、图表、文章内容、UI 状态）时调用。' +
        '返回一张图片，可直接用于视觉理解。无必填参数。',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: '截图格式，默认 png（无损）；如需更小体积可选 jpeg。',
            enum: ['png', 'jpeg']
          }
        }
      },
      handler: async (args) => {
        if (typeof chrome?.tabs?.captureVisibleTab !== 'function') {
          throw new Error('当前环境不支持 chrome.tabs.captureVisibleTab（可能未授予 tabs 权限）');
        }
        const format = args?.format === 'jpeg' ? 'jpeg' : 'png';
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format });
        if (!dataUrl) throw new Error('截图失败：未返回图像数据');

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const filename = `screenshot-${Date.now()}.${format}`;
        // 持久化到 mediaStore（可插拔后端），返回 mediaId 引用，消息只持引用
        const res = await this.mediaStore.put({ dataUrl, mimeType, filename });
        return [
          {
            type: 'media',
            kind: 'image',
            mediaId: res?.id,
            filename,
            mimeType,
          }
        ];
      }
    });
    this.kernel = kernel;
    this.mediaStore = mediaStore;
  }
}

export { CaptureVisibleTabTool };
