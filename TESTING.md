# 测试指南

## 前置准备

### 1. 添加图标文件

在 `assets/icons/` 目录创建三个 PNG 图标文件：
- icon16.png (16x16 像素)
- icon48.png (48x48 像素)
- icon128.png (128x128 像素)

**快速生成方法**：
1. 访问 https://favicon.io/emoji-favicons/
2. 选择一个 emoji（如 🤖）
3. 下载并调整为三个尺寸
4. 或使用在线工具：https://www.favicon-generator.org/

**临时方案**：如果只是测试，可以创建一个简单的彩色方块：
```powershell
# PowerShell 生成简单图标（需要 ImageMagick）
convert -size 128x128 xc:blue assets/icons/icon128.png
convert -size 48x48 xc:blue assets/icons/icon48.png
convert -size 16x16 xc:blue assets/icons/icon16.png
```

---

## 加载扩展

### 步骤 1：打开扩展管理页面

1. 打开 Chrome 浏览器
2. 地址栏输入：`chrome://extensions/`
3. 按 Enter

### 步骤 2：启用开发者模式

在页面右上角，找到"开发者模式"开关，将其打开。

### 步骤 3：加载扩展

1. 点击左上角的 **"加载已解压的扩展程序"** 按钮
2. 选择项目根目录（包含 `manifest.json` 的目录）
   - 例如：`D:\dev\webagentcli`
3. 点击"选择文件夹"

### 步骤 4：验证加载成功

如果成功，你会看到：
- 扩展名称：**Web Agent Runtime**
- 版本号：**0.1.0**
- 扩展图标出现在浏览器工具栏

---

## 测试功能

### 测试 1：打开 Side Panel

1. 打开任意网页（例如：https://www.baidu.com）
2. 点击浏览器工具栏中的扩展图标
3. **预期结果**：右侧出现 Side Panel，显示聊天界面

**如果没反应**：
- 检查控制台是否有错误
- 确认 manifest.json 中 `side_panel` 配置正确

### 测试 2：查看 Background 日志

1. 在 `chrome://extensions/` 页面
2. 找到 "Web Agent Runtime" 扩展
3. 点击 **"Service Worker"** 链接（在 "Inspect views" 下）
4. 打开 DevTools Console
5. **预期看到**：
   ```
   [WebAgent Runtime] Starting...
   [ToolRegistry] Registered: read_page
   [ToolRegistry] Registered: click_element
   [ToolRegistry] Registered: fill_form
   [ToolRegistry] Registered: get_page_info
   [WebAgent Runtime] Ready
   ```

### 测试 3：查看 Content Script 日志

1. 在任意网页中按 `F12` 打开 DevTools
2. 切换到 Console 标签
3. 刷新页面
4. **预期看到**：
   ```
   [ContentAgent] Initialized
   ```

### 测试 4：发送消息测试

1. 打开 Side Panel
2. 在 Side Panel 中右键 → "检查"
3. 在输入框中输入："你好"
4. 点击"发送"
5. **预期结果**：
   - 消息出现在聊天窗口
   - AI 回复："收到！这是一个测试响应。工具数量: 4"
   - Background 控制台显示：
     ```
     [Runtime] Received: ADD_MESSAGE
     [Runtime] Received: GET_TOOLS
     ```

### 测试 5：工具调用测试（手动）

在 Side Panel 的 DevTools Console 中执行：

```javascript
// 测试获取工具列表
chrome.runtime.sendMessage({ type: 'GET_TOOLS', payload: {} }, response => {
  console.log('Tools:', response);
});

// 测试读取页面内容
chrome.runtime.sendMessage({ 
  type: 'EXECUTE_TOOL', 
  payload: { 
    toolName: 'read_page', 
    params: { selector: 'title' } 
  } 
}, response => {
  console.log('Read result:', response);
});
```

**预期结果**：
- GET_TOOLS 返回 4 个工具定义
- read_page 返回页面标题内容

---

## 常见问题

### Q1: 点击扩展图标没有反应

**原因**：Side Panel 未正确配置或图标缺失

**解决**：
1. 检查 `manifest.json` 中是否有 `side_panel` 字段
2. 确认 `assets/icons/` 中有图标文件
3. 重新加载扩展（点击扩展卡片上的刷新图标）

### Q2: Side Panel 显示空白

**原因**：Preact 加载失败

**解决**：
1. 在 Side Panel 中右键 → "检查"
2. 查看 Console 是否有错误
3. 确认 `vendor/preact.min.js` 和 `preact-hooks.umd.js` 存在
4. 检查 `sidepanel.html` 中的 script 路径是否正确

### Q3: 消息发送后没有回复

**原因**：Background Service Worker 未正常工作

**解决**：
1. 打开 Background Service Worker 的 DevTools
2. 查看是否有错误
3. 确认 `background.js` 中的 import 路径正确
4. 尝试重新加载扩展

### Q4: Content Script 没有执行

**原因**：权限问题或匹配规则错误

**解决**：
1. 检查 `manifest.json` 中 `content_scripts.matches` 是否为 `<all_urls>`
2. 确认 `content.js` 文件存在
3. 在网页 Console 中查看是否有 `[ContentAgent] Initialized` 日志

### Q5: 修改代码后不生效

**原因**：Chrome 缓存了旧版本

**解决**：
1. 在 `chrome://extensions/` 页面
2. 找到扩展，点击刷新图标（🔄）
3. 或者完全移除后重新加载

---

## 调试技巧

### 查看不同部分的日志

| 组件 | 如何查看日志 |
|------|-------------|
| Background | chrome://extensions/ → Service Worker 链接 |
| Content Script | 网页中 F12 → Console |
| Side Panel UI | Side Panel 中右键 → 检查 → Console |

### 热重载

开发时可以使用自动重载工具：
1. 安装 "Extensions Reloader" 扩展
2. 修改代码后点击重载按钮

### 清除存储数据

如果会话数据混乱：
```javascript
// 在 Background DevTools 中执行
chrome.storage.local.clear(() => {
  console.log('Storage cleared');
});
```

---

## 下一步开发

基础架构已完成，接下来可以：

1. **集成真实 AI API**
   - 在 background.js 中添加 fetch 调用
   - 支持 OpenRouter/OpenAI/Claude 等

2. **实现流式响应**
   - 使用 Fetch Streaming API
   - 在 Side Panel 中实时显示 token

3. **添加工具审批**
   - 在执行危险操作前显示确认对话框
   - Human-in-the-loop 机制

4. **优化 UI**
   - 添加 Markdown 渲染
   - 代码高亮
   - 更好的样式

5. **更多工具**
   - navigate(url): 导航到 URL
   - screenshot(): 截图
   - scroll(direction): 滚动页面

---

## 报告问题

如果遇到无法解决的问题：
1. 提供完整的错误信息
2. 说明操作步骤
3. 附上相关日志（Background + Content + Side Panel）
