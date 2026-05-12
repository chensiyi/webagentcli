// 网页访问工具
// 负责抓取和解析网页内容

window.FetchTool = {
  /**
   * 工具配置
   */
  config: {
    id: 'web_fetch',
    name: 'web_fetch',
    description: 'Fetch and extract content from web pages',
    enabled: false,
    systemPrompt: `### web_fetch

抓取并提取网页内容。

**用法：**
\`\`\`web_fetch
https://example.com
\`\`\`

**返回：**
- 页面标题
- 主要内容（前2000字符）
- 最多20个链接
- 最多10张图片

**提示：**
- 使用完整的http://或https:// URL
- 通常配合搜索工具使用`
  },

  /**
   * 执行网页访问
   */
  async execute(url) {
    try {
      console.log(`[FetchTool] Fetching web page: ${url}`);
      
      // 验证 URL 格式
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // 直接调用 FetchTool 的工具函数处理
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // 使用工具函数提取内容
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      
      const articleContent = this.extractArticleContent(html);
      const content = this.htmlToMarkdown(articleContent);
      const links = this.extractLinks(html);
      const images = this.extractImages(html);
      const media = this.extractMedia(html);
      
      console.log(`[FetchTool] Fetched: ${title}, content=${content.length} chars, links=${links.length}, images=${images.length}`);
      
      return {
        success: true,
        url: url,
        title: title || '无标题',
        content: content,
        links: links,
        images: images,
        media: media,
        output: this.formatContent({ title, content, links, images, media })
      };
    } catch (error) {
      console.error(`[FetchTool] Web fetch error:`, error);
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  },

  /**
   * 格式化网页内容为 Markdown 格式
   */
  formatContent(data) {
    let output = `# ${data.title || '无标题'}\n\n`;
    
    if (data.content) {
      output += data.content + '\n\n';
    }
    
    // 添加图片（使用 Markdown 图片语法）
    if (data.images && data.images.length > 0) {
      output += `\n## 图片 (${data.images.length} 个)\n\n`;
      data.images.slice(0, 10).forEach((img, idx) => {
        const altText = img.alt || `图片${idx + 1}`;
        output += `![${altText}](${img.url})\n\n`;
      });
      if (data.images.length > 10) {
        output += `...还有 ${data.images.length - 10} 个图片\n\n`;
      }
    }
    
    // 添加链接（使用 Markdown 链接语法）
    if (data.links && data.links.length > 0) {
      output += `\n## 页面链接 (${data.links.length} 个)\n\n`;
      data.links.slice(0, 20).forEach((link, idx) => {
        output += `${idx + 1}. [${link.title || link.url}](${link.url})\n`;
      });
      if (data.links.length > 20) {
        output += `\n...还有 ${data.links.length - 20} 个链接\n`;
      }
    }
    
    // 添加音视频
    if (data.media && data.media.length > 0) {
      output += `\n## 音视频 (${data.media.length} 个)\n\n`;
      data.media.forEach((item, idx) => {
        output += `${idx + 1}. [${item.type.toUpperCase()}] ${item.title || item.url}\n   ${item.url}\n\n`;
      });
    }
    
    return output;
  },

  /**
   * 类Readability算法：提取网页正文内容
   */
  extractArticleContent(html) {
    // 移除不可见元素
    let cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')  // 移除导航
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')  // 移除页脚
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');  // 移除头部
    
    // 尝试从常见容器提取
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*(?:article|content|post|entry|story)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="main"[^>]*>([\s\S]*?)<\/div>/i,
      /<section[^>]*class="[^"]*(?:article|content|post)[^"]*"[^>]*>([\s\S]*?)<\/section>/i
    ];
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match && match[1].length > 500) {
        return match[1];
      }
    }
    
    // 如果没找到或内容太少，使用整个body
    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1];
    }
    
    // 最后回退到整个HTML
    return cleaned;
  },

  /**
   * HTML转Markdown
   */
  htmlToMarkdown(html) {
    let result = html;
    
    // 转换标题
    result = result
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n')
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');
    
    // 转换段落
    result = result
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
    
    // 转换链接
    result = result
      .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
    
    // 转换图片
    result = result
      .replace(/<img[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi, '![$2]($1)\n');
    
    // 转换列表
    result = result
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      .replace(/<[uo]l[^>]*>([\s\S]*?)<\/[uo]l>/gi, '$1\n');
    
    // 转换代码块
    result = result
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
    
    // 转换粗体和斜体
    result = result
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
    
    // 转换删除线
    result = result
      .replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~')
      .replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
    
    // 转换水平线
    result = result
      .replace(/<hr[^>]*>/gi, '\n---\n');
    
    // 转换换行
    result = result
      .replace(/<br[^>]*>/gi, '\n');
    
    // 移除剩余HTML标签
    result = result
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return result;
  },

  /**
   * 提取链接
   */
  extractLinks(html) {
    const links = [];
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(html)) !== null && links.length < 50) {
      const linkUrl = linkMatch[1];
      const linkTitle = linkMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      if (linkUrl && (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) && linkTitle && linkTitle.length > 3) {
        links.push({
          url: linkUrl,
          title: linkTitle
        });
      }
    }
    
    return links;
  },

  /**
   * 提取图片
   */
  extractImages(html) {
    const images = [];
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi;
    let imgMatch;
    
    while ((imgMatch = imgRegex.exec(html)) !== null && images.length < 30) {
      const imgUrl = imgMatch[1];
      const imgAlt = imgMatch[2] || '';
      
      if (imgUrl && (imgUrl.startsWith('http://') || imgUrl.startsWith('https://'))) {
        images.push({
          url: imgUrl,
          alt: imgAlt
        });
      }
    }
    
    return images;
  },

  /**
   * 提取音视频
   */
  extractMedia(html) {
    const media = [];
    const mediaRegex = /<(video|audio)[^>]*src="([^"]+)"[^>]*>(?:<source[^>]*src="([^"]+)"[^>]*>)?/gi;
    let mediaMatch;
    
    while ((mediaMatch = mediaRegex.exec(html)) !== null && media.length < 20) {
      const mediaType = mediaMatch[1];
      const mediaUrl = mediaMatch[2] || mediaMatch[3];
      
      if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
        media.push({
          type: mediaType,
          url: mediaUrl,
          title: mediaUrl.split('/').pop()
        });
      }
    }
    
    return media;
  }
};
