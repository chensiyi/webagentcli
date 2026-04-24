// ==================== Side Panel Entry ====================
// 加载所有组件

console.log('[SidePanel] Loading components...');

// 按顺序加载组件
const scripts = [
  'components/App.jsx',
  'components/ChatView.jsx',
  'components/ToolsView.jsx',
  'components/SettingsView.jsx',
  'components/HistoryView.jsx'
];

let loadedCount = 0;

scripts.forEach((script, index) => {
  const scriptEl = document.createElement('script');
  scriptEl.src = script;
  scriptEl.onload = () => {
    loadedCount++;
    console.log(`[SidePanel] Loaded: ${script} (${loadedCount}/${scripts.length})`);
    
    if (loadedCount === scripts.length) {
      console.log('[SidePanel] All components loaded');
    }
  };
  scriptEl.onerror = () => {
    console.error(`[SidePanel] Failed to load: ${script}`);
  };
  document.head.appendChild(scriptEl);
});
