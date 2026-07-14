/**
 * CaptureScreenshotTool — 捕获当前可见页面截图（标准页面能力工具）
 *
 * 依赖扩展权限（manifest 已含 activeTab / scripting），故实现为内核内置工具，
 * 而非 @tool 用户脚本：截图所需的 chrome.tabs.captureVisibleTab 在 MAIN / USER_SCRIPT
 * 世界均不可用（用户脚本世界无 chrome.tabs API）。
 *
 * 截图结果经 mediaStore 落盘得到 mediaId（不把巨大 base64 写进消息 JSON）。
 * 工具返回 { output: [TextBlock], userMedia: [{mediaId,...}] }：文本作为 tool 结果，
 * 执行器把 userMedia 原子追加为一条 user 图片消息，模型当轮即可「看见」截图，
 * 且规避 OpenAI tool message 禁含图片的限制。
 */

import { Tool } from 'kernel/models/Tool.js';
import { TextBlock } from 'kernel/models/MessageContent.js';
import { Log } from 'kernel/services/Log.js';

/**
 * 从 PNG dataURL 解析宽高（读取 IHDR：签名 8B + length 4B + 'IHDR' 4B + width 4B + height 4B）。
 * jpeg 不支持，返回 null 即可（不影响主流程）。
 */
function pngSize(dataUrl) {
  try {
    const b64 = String(dataUrl).split(',')[1];
    if (!b64) return null;
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    const dv = new DataView(buf);
    if (dv.getUint32(0) !== 0x89504e47) return null; // 非 PNG 签名
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  } catch {
    return null;
  }
}

/**
 * 判断 URL 是否为浏览器「受限/特殊页面」——这些页面 Chrome 出于安全限制，
 * 不允许扩展通过 chrome.tabs.captureVisibleTab 等 API 读取其内容或截图：
 *   chrome:// / chrome-extension:// / edge:// / about: / moz-extension:// /
 *   view-source: / devtools / chrome.google.com/webstore 等。
 * 返回 true 时应提前给出清晰说明，而非抛出晦涩的 Chrome 原生错误。
 */
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    /^(chrome|chrome-extension|edge|about|moz-extension|view-source|devtools|chrome-search|chrome-native):/i.test(
      url
    ) || /^https?:\/\/chrome\.google\.com\/webstore/i.test(url)
  );
}

/**
 * @param kernel     内核实例（保留以便未来扩展）
 * @param mediaStore MediaStoreLike（put 返回 mediaId）
 */
class CaptureScreenshotTool extends Tool {
  constructor(kernel, mediaStore) {
    super({
      name: 'capture_screenshot',
      description:
        '捕获当前浏览器窗口中「可见区域」的页面截图，返回一张图片给模型查看。\n' +
        '适用场景：\n' +
        '- 让模型看到页面当前渲染结果（布局、图表、报错界面、验证码等视觉信息）\n' +
        '- 页面内容依赖渲染/样式、纯文本提取不足以描述时\n' +
        '注意事项：\n' +
        '- 仅捕获「可见区域」，无法截取完整长页面（整页截图需滚动拼接，暂不支持）\n' +
        '- 特殊页面（chrome:// / 扩展页 / 新标签页）通常无法截图，会报错',
      source: 'builtin',
      category: 'page-capability',
      tags: ['page', 'vision', 'screenshot'],
      danger: false,
      version: '1.0',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: '截图格式，png 无损、jpeg 体积更小。默认 png。',
            enum: ['png', 'jpeg'],
            default: 'png',
          },
        },
        required: [],
      },
      handler: async (args, context) => {
        const { format = 'png' } = args || {};
        if (format !== 'png' && format !== 'jpeg') {
          throw new Error('format 仅支持 png / jpeg');
        }

        // captureVisibleTab 捕获「当前窗口的可见（活动）标签」，与具体 tabId 无关。
        // 先取活动标签（用于受限页面预判）；调用方传入的 tabId 仅作日志提示。
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || activeTab.id == null) throw new Error('无法找到当前活动标签页');

        // 受限/特殊页面：chrome://、扩展页、about:、新标签页等，Chrome 出于安全限制
        // 一律禁止扩展读取其内容或截图。提前给出清晰说明，避免抛出晦涩的 Chrome 原生错误。
        if (isRestrictedUrl(activeTab.url)) {
          const where = activeTab.url || '未知页面';
          Log.warn('CaptureScreenshotTool', `skip restricted page: ${where}`);
          return [
            new TextBlock(
              `当前标签页是特殊/受限页面（${where}），Chrome 出于安全限制不允许扩展对其截图。\n` +
                `请切换到普通网页（http/https）后再调用 capture_screenshot。`
            ),
          ];
        }

        // 本地文件（file://）页面：Chrome 要求扩展单独开启「允许访问文件网址」才能访问其内容/截图，
        // 即使 manifest 已声明 host_permissions: <all_urls> 也无效，必须用户在扩展详情里手动勾选。
        if (/^file:\/\//i.test(activeTab.url || '')) {
          let fileAccess = true;
          try {
            if (chrome.extension && typeof chrome.extension.isAllowedFileSchemeAccess === 'function') {
              fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
            }
          } catch {
            /* 探测异常时按默认允许继续，让真实错误自然暴露 */
          }
          if (!fileAccess) {
            Log.warn('CaptureScreenshotTool', 'file:// scheme access not allowed');
            return [
              new TextBlock(
                '当前是本地文件（file://）页面。Chrome 要求扩展单独开启「允许访问文件网址」才能截图。\n' +
                  '请在 chrome://extensions → Web Agent Client → 详情 中勾选「允许访问文件网址」，然后重试。'
              ),
            ];
          }
        }

        // 若调用方指定了 tabId 且并非活动标签，记一条日志便于排查
        // （captureVisibleTab 仍只捕获活动标签，这是 API 限制，无法指定其它标签）
        const hintId = context && context.tabId != null ? Number(context.tabId) : null;
        if (Number.isFinite(hintId) && hintId !== activeTab.id) {
          Log.warn(
            'CaptureScreenshotTool',
            `context.tabId=${hintId} 非活动标签，captureVisibleTab 将捕获活动标签 ${activeTab.id}`
          );
        }

        // 捕获「当前窗口的可见标签」（忽略具体 tabId，传 null 即当前窗口）
        let dataUrl;
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(null, { format });
        } catch (e) {
          const msg = e?.message || String(e);
          if (/cannot access contents of the page/i.test(msg)) {
            throw new Error(
              '截图失败：扩展无权访问该页面内容。' +
                (activeTab.url && /^file:\/\//i.test(activeTab.url)
                  ? '当前为 file:// 页面，请在扩展详情中开启「允许访问文件网址」。'
                  : '当前为普通网页，请到 chrome://extensions 点「刷新」重载扩展，使 manifest 的 host_permissions（<all_urls>）生效。')
            );
          }
          throw new Error(`截图失败：${msg}`);
        }
        if (!dataUrl) throw new Error('截图返回为空（可能页面不支持截图）');

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const filename = `screenshot.${format}`;

        // 落盘得到 mediaId（消息只持 mediaId，避免 base64 撑爆 storage）
        let mediaId = null;
        try {
          if (this._mediaStore && typeof this._mediaStore.put === 'function') {
            mediaId = await this._mediaStore.put(dataUrl, mimeType, filename);
          }
        } catch (e) {
          Log.warn('CaptureScreenshotTool', 'mediaStore.put failed, fall back to inline dataURL', e);
        }

        const dims = format === 'png' ? pngSize(dataUrl) : null;
        const dimText = dims ? `（${dims.w}×${dims.h}）` : '';
        const textBlock = new TextBlock(
          `已捕获当前可见页面截图${dimText}，图片已作为消息附上，请查看。\n图片地址：${dataUrl}`
        );
        // 文本作为 tool 结果返回；图片通过 userMedia 交给执行器，原子追加为 user 图片消息。
        const result = { output: [textBlock], userMedia: [] };
        if (mediaId) {
          result.userMedia.push({ mediaId, mimeType, filename });
        } else {
          Log.warn('CaptureScreenshotTool', 'mediaStore 不可用，截图未以图片形式附上（仅文本结果）');
        }
        return result;
      },
    });
    // 持有引用，供 handler 闭包经 this 访问
    this._mediaStore = mediaStore || null;
    this._kernel = kernel || null;
  }
}

export { CaptureScreenshotTool };
