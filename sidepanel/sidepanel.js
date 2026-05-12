/**
 * Side Panel Navigation Script
 * 
 * 侧边栏导航逻辑
 * 处理页面切换和tooltip显示
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Sidebar] DOM ready, initializing navigation...');
  
  const frame = document.getElementById('page-frame');
  const buttons = document.querySelectorAll('.sidebar-btn');
  
  console.log('[Sidebar] Found', buttons.length, 'buttons');
  console.log('[Sidebar] Frame element:', frame);
  
  buttons.forEach((btn, index) => {
    console.log(`[Sidebar] Setting up button ${index}:`, btn.dataset.page);
    
    // 点击切换页面
    btn.addEventListener('click', (e) => {
      console.log('[Sidebar] Button clicked:', btn.dataset.page);
      e.preventDefault();
      e.stopPropagation();
      
      // 更新 active 状态
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // 切换页面
      const page = btn.dataset.page;
      const newSrc = `pages/${page}`;
      console.log('[Sidebar] Switching frame src to:', newSrc);
      frame.src = newSrc;
    });
    
    // Tooltip 显示逻辑
    let tooltipElement = null;
    
    btn.addEventListener('mouseenter', (e) => {
      console.log('[Sidebar] Mouse enter:', btn.dataset.tooltip);
      
      // 移除已存在的 tooltip
      if (tooltipElement && tooltipElement.parentNode) {
        tooltipElement.remove();
      }
      
      // 创建 tooltip 元素
      tooltipElement = document.createElement('div');
      tooltipElement.className = 'sidebar-tooltip';
      tooltipElement.textContent = btn.dataset.tooltip;
      
      const rect = btn.getBoundingClientRect();
      tooltipElement.style.cssText = `
        position: fixed;
        right: 45px;
        top: ${rect.top + rect.height / 2}px;
        transform: translateY(-50%);
        padding: 6px 10px;
        background: var(--color-surface, #fafafa);
        color: var(--color-text, #333);
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid var(--color-border, #e0e0e0);
        z-index: 999999;
        pointer-events: none;
        animation: fadeIn 0.15s ease;
      `;
      
      document.body.appendChild(tooltipElement);
    });
    
    btn.addEventListener('mouseleave', () => {
      if (tooltipElement && tooltipElement.parentNode) {
        tooltipElement.remove();
        tooltipElement = null;
      }
    });
  });
  
  console.log('[Sidebar] Navigation initialized successfully');
});
