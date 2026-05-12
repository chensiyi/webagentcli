/**
 * useChat - 聊天状态管理 Hook（React 风格）
 * 
 * 使用示例：
 * ```javascript
 * const chat = useChat();
 * 
 * // 访问状态
 * console.log(chat.state.messages);
 * console.log(chat.state.isLoading);
 * 
 * // 调用方法
 * await chat.sendMessage('你好');
 * chat.stopGeneration();
 * ```
 */

function useChat() {
  // 检查 ChatController 是否已初始化
  if (!window.chatController) {
    throw new Error('ChatController not initialized. Call initChatController() first.');
  }
  
  const controller = window.chatController;
  
  return {
    // 状态
    state: controller.getState(),
    
    // 方法
    sendMessage: (text, media) => controller.sendMessage(text, media),
    stopGeneration: () => controller.stopGeneration(),
    deleteMessage: (index) => controller.deleteMessage(index),
    editMessage: (index, content) => controller.editMessage(index, content),
    switchSession: (sessionId) => controller.switchSession(sessionId),
    
    // 便捷属性
    messages: controller.getState().messages,
    isLoading: controller.getState().isLoading,
    isThinking: controller.getState().isThinking,
    error: controller.getState().error,
    currentSessionId: controller.getState().currentSessionId
  };
}

// 初始化 ChatController
async function initChatController({ sessionManager, toolManager, adapter }) {
  const controller = new ChatController({
    sessionManager,
    toolManager,
    adapter,
    onStateChange: (state) => {
      // 触发 UI 更新
      if (window.renderChatUI) {
        window.renderChatUI(state);
      }
    }
  });
  
  await controller.initialize();
  
  // 保存到全局
  window.chatController = controller;
  
  return controller;
}

// 导出
if (typeof window !== 'undefined') {
  window.useChat = useChat;
  window.initChatController = initChatController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useChat, initChatController };
}
