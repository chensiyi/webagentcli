// 搜索工具
// 负责网络搜索功能（DuckDuckGo、百度）

window.SearchTool = {
  /**
   * 工具配置
   */
  config: {
    id: 'web_search',
    name: 'web_search',
    description: 'Search for information on the internet',
    enabled: false,
    systemPrompt: `### web_search

Search the internet for real-time information, news, or facts.

**Format:**
\`\`\`web_search
search query
\`\`\`

**Parameters:**
- query: Your search keywords
- Optional: append \`|page=N\` for pagination (e.g., \`keyword|page=2\`)

**Example:**
\`\`\`web_search
latest technology news|page=2
\`\`\`

**Notes:**
- Each page returns up to 10 results
- Use pagination when you see "第 X 页" and need more results
- Results include: rank, title, URL, snippet, source`
  },

  /**
   * 执行网络搜索
   * @param {string} query - 搜索关键词，可以包含|page=N参数
   */
  async execute(query) {
    try {
      console.log(`[SearchTool] Executing web search: ${query}`);
      
      // 解析查询参数，支持 page=N 格式
      let searchQuery = query;
      let page = 0;
      
      const pageMatch = query.match(/\|\s*page\s*=\s*(\d+)/i);
      if (pageMatch) {
        page = parseInt(pageMatch[1]) - 1; // 用户从1开始，内部从0开始
        searchQuery = query.replace(/\|\s*page\s*=\s*\d+/i, '').trim();
        console.log(`[SearchTool] Parsed page: ${page + 1}, query: ${searchQuery}`);
      }
      
      // 调用搜索 API
      const response = await this.search(searchQuery, page);
      
      if (response && response.success) {
        const results = response.data?.results || [];
        
        // 优化结果格式，让模型更容易理解
        const formattedResults = results.map((item, index) => {
          return {
            rank: index + 1,
            title: item.title || '无标题',
            url: item.url || '',
            snippet: item.snippet || '无摘要',
            source: item.engine || 'unknown'
          };
        });
        
        console.log(`[SearchTool] Search returned ${formattedResults.length} results`);
        
        return {
          success: true,
          query: query,
          page: page,
          results: formattedResults,
          count: formattedResults.length,
          output: this.formatResults(formattedResults, page, searchQuery)
        };
      } else {
        console.error('[SearchTool] Search failed:', response?.error);
        return {
          success: false,
          error: response?.error || 'Search failed',
          query: query,
          results: [],
          count: 0
        };
      }
    } catch (error) {
      console.error('[SearchTool] Web search error:', error);
      return {
        success: false,
        error: error.message,
        query: query,
        results: [],
        count: 0
      };
    }
  },
  
  /**
   * 执行搜索（DuckDuckGo + 百度降级）
   */
  async search(query, page = 0) {
    try {
      console.log(`[SearchTool] Searching: ${query} (page ${page})`);
      return await this.searchWithDuckDuckGo(query, page);
    } catch (error) {
      console.error('[SearchTool] DuckDuckGo search error:', error);
      console.log('[SearchTool] Falling back to Baidu...');
      return await this.searchWithBaidu(query);
    }
  },
  
  /**
   * 使用 DuckDuckGo 搜索
   */
  async searchWithDuckDuckGo(query, page = 0) {
    try {
      const s = page * 10;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${s}`;
      
      const response = await fetch(searchUrl, {
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
      const results = [];
      
      // 方法1: 查找 result__a 链接
      const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
      let match;
      
      while ((match = titleRegex.exec(html)) !== null && results.length < 10) {
        const url = match[1];
        const titleHtml = match[2];
        const remainingHtml = html.substring(match.index + match[0].length);
        const snippetMatch = remainingHtml.match(/<div[^>]*class="result__snippet"[^>]*>(.*?)<\/div>/s);
        
        let realUrl = url;
        if (url.includes('/l/?')) {
          const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            realUrl = decodeURIComponent(uddgMatch[1]);
          }
        }
        
        const title = titleHtml.replace(/<[^>]*>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        
        if (title && realUrl && !realUrl.includes('duckduckgo.com')) {
          results.push({ title, url: realUrl, snippet, engine: 'duckduckgo' });
        }
      }
      
      // 方法2: 新版 DDG 结构
      if (results.length === 0) {
        const resultBodyRegex = /<div[^>]*class="result__body"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gs;
        
        while ((match = resultBodyRegex.exec(html)) !== null && results.length < 10) {
          const bodyContent = match[1];
          const linkMatch = bodyContent.match(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s);
          
          if (!linkMatch) continue;
          
          const url = linkMatch[1];
          const titleHtml = linkMatch[2];
          const snippetMatch = bodyContent.match(/<div[^>]*class="result__snippet"[^>]*>(.*?)<\/div>/s);
          
          let realUrl = url;
          if (url.includes('/l/?')) {
            const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch) {
              realUrl = decodeURIComponent(uddgMatch[1]);
            }
          }
          
          const title = titleHtml.replace(/<[^>]*>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
          
          if (title && realUrl && !realUrl.includes('duckduckgo.com')) {
            results.push({ title, url: realUrl, snippet, engine: 'duckduckgo' });
          }
        }
      }
      
      console.log(`[SearchTool] DuckDuckGo search "${query}": ${results.length} results`);
      
      return {
        success: true,
        data: {
          query,
          results,
          count: results.length,
          source: 'duckduckgo'
        }
      };
    } catch (error) {
      console.error('[SearchTool] DuckDuckGo search error:', error);
      return await this.searchWithBaidu(query);
    }
  },
  
  /**
   * 使用百度搜索
   */
  async searchWithBaidu(query) {
    try {
      const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=10&ie=utf-8`;
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://www.baidu.com/',
          'Cookie': 'BDSVRTM=0; BD_HOME=1'
        },
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      if (html.includes('安全验证') || html.includes('captcha')) {
        throw new Error('百度检测到异常访问');
      }
      
      const results = [];
      const containerRegex = /<div[^>]*class="[^"]*c-container[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?:<div|<\/div)/g;
      let match;
      
      while ((match = containerRegex.exec(html)) !== null && results.length < 8) {
        const containerHtml = match[0];
        const titleLinkMatch = containerHtml.match(/<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/i);
        
        if (!titleLinkMatch) continue;
        
        const url = titleLinkMatch[1];
        const titleHtml = titleLinkMatch[2];
        const title = titleHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        
        if (!title || !url || url.includes('baidu.com') || url.startsWith('#')) continue;
        
        const snippetMatch = containerHtml.match(/<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
        
        results.push({ title, url, snippet, engine: 'baidu' });
      }
      
      console.log(`[SearchTool] Baidu search "${query}": ${results.length} results`);
      
      return {
        success: true,
        data: {
          query,
          results,
          count: results.length,
          source: 'baidu'
        }
      };
    } catch (error) {
      console.error('[SearchTool] Baidu search failed:', error);
      return {
        success: false,
        error: `Search failed: ${error.message}`,
        data: { query, results: [], count: 0 }
      };
    }
  },
  
  /**
   * 格式化搜索结果为人类可读的文本
   * @param {Array} results - 搜索结果
   * @param {number} page - 当前页码（从0开始）
   * @param {string} query - 搜索关键词
   */
  formatResults(results, page = 0, query = '') {
    if (!results || results.length === 0) {
      return '未找到搜索结果';
    }
      
    const lines = results.map(item => {
      return `[${item.rank}] ${item.title}\n   链接: ${item.url}\n   摘要: ${item.snippet}\n   来源: ${item.source}`;
    });
      
    const currentPage = page + 1;
    let output = `第 ${currentPage} 页，找到 ${results.length} 条结果：\n\n` + lines.join('\n\n');
      
    // 添加分页提示
    if (results.length >= 10) {
      output += `\n\n（当前是第 ${currentPage} 页。如需更多结果，请使用：\`\`\`search\n${query}|page=${currentPage + 1}\n\`\`\`）`;
    } else {
      output += `\n\n（已是最后一页）`;
    }
      
    return output;
  }
};
