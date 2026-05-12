// 用户脚本元数据解析器
// 负责解析Tampermonkey格式的脚本头信息

window.UserScriptMetadata = {
  /**
   * 解析用户脚本元数据
   */
  parseMetadata(code) {
    const metadata = {};
    const metaMatch = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    
    if (!metaMatch) {
      return null;
    }
    
    const metaBlock = metaMatch[1];
    const lines = metaBlock.split('\n');
    
    for (const line of lines) {
      const match = line.match(/\/\/\s*@(\S+)\s+(.+)/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        
        if (key === 'match' || key === 'include' || key === 'exclude') {
          if (!metadata[key]) {
            metadata[key] = [];
          }
          metadata[key].push(value);
        } else {
          metadata[key] = value;
        }
      }
    }
    
    return metadata;
  },

  /**
   * 检查 URL 是否匹配脚本规则
   */
  matchesURL(url, scriptInfo) {
    if (!scriptInfo.matches || scriptInfo.matches.length === 0) {
      return true;
    }
    
    // 检查排除规则
    if (scriptInfo.excludes) {
      for (const pattern of scriptInfo.excludes) {
        if (this.matchPattern(url, pattern)) {
          return false;
        }
      }
    }
    
    // 检查包含规则
    for (const pattern of scriptInfo.matches) {
      if (this.matchPattern(url, pattern)) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * 匹配 URL 模式（简化版）
   */
  matchPattern(url, pattern) {
    if (pattern === '*://*/*') {
      return true;
    }
    
    // 转换为正则表达式
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?');
    
    const fullRegex = new RegExp('^' + regex + '$');
    return fullRegex.test(url);
  }
};
