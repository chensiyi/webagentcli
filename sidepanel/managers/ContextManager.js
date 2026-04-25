// 上下文窗口管理器
// 负责估算 token 数量并智能截断历史消息
(function() {
  'use strict';
  
  class ContextManager {
    constructor() {
      // 常见模型的上下文窗口大小
      this.modelContextWindows = {
        // OpenAI
        'gpt-4': 8192,
        'gpt-4-32k': 32768,
        'gpt-4o': 128000,
        'gpt-4o-mini': 128000,
        'gpt-3.5-turbo': 16385,
        
        // Claude
        'claude-3-opus': 200000,
        'claude-3-sonnet': 200000,
        'claude-3-haiku': 200000,
        'claude-2': 100000,
        
        // Llama
        'llama-3': 8192,
        'llama-3-8b': 8192,
        'llama-3-70b': 8192,
        
        // 默认值（保守估计）
        'default': 8192
      };
      
      // Token 估算系数（字符数到 token 数的转换比例）
      // 英文约 4 字符/token，中文约 1.5-2 字符/token
      this.charToTokenRatio = 2.5;
    }
    
    /**
     * 获取模型的上下文窗口大小
     */
    getContextWindowSize(modelName) {
      if (!modelName) return this.modelContextWindows.default;
      
      // 尝试精确匹配
      if (this.modelContextWindows[modelName]) {
        return this.modelContextWindows[modelName];
      }
      
      // 尝试部分匹配
      for (const [key, value] of Object.entries(this.modelContextWindows)) {
        if (modelName.toLowerCase().includes(key.toLowerCase())) {
          return value;
        }
      }
      
      // 返回默认值
      return this.modelContextWindows.default;
    }
    
    /**
     * 估算文本的 token 数量
     */
    estimateTokens(text) {
      if (!text) return 0;
      return Math.ceil(text.length / this.charToTokenRatio);
    }
    
    /**
     * 估算消息列表的总 token 数量
     */
    estimateMessagesTokens(messages) {
      let totalTokens = 0;
      
      for (const msg of messages) {
        // 每条消息的基础开销（role + 格式）
        totalTokens += 4;
        
        // 内容 token
        totalTokens += this.estimateTokens(msg.content);
      }
      
      return totalTokens;
    }
    
    /**
     * 智能截断消息列表以适应上下文窗口
     * @param {Array} messages - 消息列表
     * @param {string} modelName - 模型名称
     * @param {number} maxOutputTokens - 预留的输出 token 数
     * @returns {Array} 截断后的消息列表
     */
    truncateMessages(messages, modelName, maxOutputTokens = 1000) {
      if (!messages || messages.length === 0) return [];
      
      const contextWindow = this.getContextWindowSize(modelName);
      const availableTokens = contextWindow - maxOutputTokens;
      
      console.log(`[ContextManager] Context window: ${contextWindow}, Available: ${availableTokens}`);
      
      // 如果总 token 数在限制内，直接返回
      const totalTokens = this.estimateMessagesTokens(messages);
      if (totalTokens <= availableTokens) {
        console.log(`[ContextManager] No truncation needed (${totalTokens}/${availableTokens})`);
        return [...messages];
      }
      
      console.log(`[ContextManager] Truncation needed (${totalTokens}/${availableTokens})`);
      
      // 分离系统消息和普通消息
      const systemMessages = messages.filter(m => m.role === 'system');
      const otherMessages = messages.filter(m => m.role !== 'system');
      
      // 计算系统消息占用的 token
      const systemTokens = this.estimateMessagesTokens(systemMessages);
      const remainingTokens = availableTokens - systemTokens;
      
      if (remainingTokens <= 0) {
        // 系统消息已经超过限制，只保留系统消息
        console.warn('[ContextManager] System messages exceed context window');
        return [...systemMessages];
      }
      
      // 从后往前选择消息，优先保留最近的消息
      const selectedMessages = [];
      let usedTokens = 0;
      
      for (let i = otherMessages.length - 1; i >= 0; i--) {
        const msg = otherMessages[i];
        const msgTokens = this.estimateTokens(msg.content) + 4; // 基础开销
        
        if (usedTokens + msgTokens <= remainingTokens) {
          selectedMessages.unshift(msg); // 插入到前面保持顺序
          usedTokens += msgTokens;
        } else {
          break;
        }
      }
      
      // 组合最终消息列表
      const result = [...systemMessages, ...selectedMessages];
      
      console.log(`[ContextManager] Truncated from ${messages.length} to ${result.length} messages`);
      console.log(`[ContextManager] Used tokens: ${systemTokens + usedTokens}/${availableTokens}`);
      
      return result;
    }
    
    /**
     * 获取上下文使用率
     */
    getContextUsage(messages, modelName) {
      const contextWindow = this.getContextWindowSize(modelName);
      const usedTokens = this.estimateMessagesTokens(messages);
      return {
        used: usedTokens,
        total: contextWindow,
        percentage: Math.round((usedTokens / contextWindow) * 100)
      };
    }
  }
  
  // 全局单例
  window.ContextManager = new ContextManager();
})();
