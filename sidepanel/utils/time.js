// 时间工具函数

window.TimeUtils = {
  /**
   * 获取当前时间的格式化字符串 (YYYY-MM-DD HH:mm)
   * 用于在 system prompt 中告诉大模型当前时间
   */
  getCurrentTimeString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },
  
  /**
   * 格式化时间戳为可读字符串（用于UI显示）
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
};
