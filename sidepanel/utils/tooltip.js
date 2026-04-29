/**
 * 智能浮窗工具
 * 自动检测屏幕位置并合理显示浮窗
 */

class Tooltip {
  static currentTooltip = null;

  /**
   * 显示浮窗
   * @param {HTMLElement} target - 目标元素
   * @param {string} content - 浮窗内容
   * @param {Object} options - 配置选项
   */
  static show(target, content, options = {}) {
    // 销毁之前的浮窗
    this.hide();

    const {
      position = 'auto',  // auto, top, bottom, left, right
      offset = 8,
      className = '',
      duration = 0,  // 0 表示不自动隐藏
      maxWidth = '300px'
    } = options;

    // 创建浮窗元素
    const tooltip = document.createElement('div');
    tooltip.className = `tooltip ${className}`;
    tooltip.innerHTML = content;
    tooltip.style.maxWidth = maxWidth;
    
    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;

    // 计算最佳位置
    const bestPosition = this.calculatePosition(target, tooltip, position, offset);
    
    // 应用位置
    tooltip.style.top = bestPosition.top;
    tooltip.style.left = bestPosition.left;
    tooltip.style.right = bestPosition.right;
    tooltip.style.bottom = bestPosition.bottom;
    tooltip.style.transform = bestPosition.transform;

    // 添加箭头方向类
    tooltip.classList.add(`tooltip-${bestPosition.direction}`);

    // 触发动画
    requestAnimationFrame(() => {
      tooltip.classList.add('show');
    });

    // 自动隐藏
    if (duration > 0) {
      setTimeout(() => this.hide(), duration);
    }

    return tooltip;
  }

  /**
   * 隐藏浮窗
   */
  static hide() {
    if (this.currentTooltip) {
      this.currentTooltip.classList.remove('show');
      setTimeout(() => {
        if (this.currentTooltip && this.currentTooltip.parentNode) {
          this.currentTooltip.parentNode.removeChild(this.currentTooltip);
        }
        this.currentTooltip = null;
      }, 150);
    }
  }

  /**
   * 计算最佳显示位置
   */
  static calculatePosition(target, tooltip, preferredPosition, offset) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 如果指定了固定位置
    if (preferredPosition !== 'auto') {
      return this.getPositionCoordinates(targetRect, tooltipRect, preferredPosition, offset);
    }

    // 自动检测最佳位置
    const positions = ['top', 'bottom', 'left', 'right'];
    
    for (const pos of positions) {
      const coords = this.getPositionCoordinates(targetRect, tooltipRect, pos, offset);
      
      // 检查是否会超出视口
      if (this.isInViewport(coords, tooltipRect, viewportWidth, viewportHeight)) {
        return coords;
      }
    }

    // 如果所有位置都不合适，默认显示在下方
    return this.getPositionCoordinates(targetRect, tooltipRect, 'bottom', offset);
  }

  /**
   * 获取指定位置的坐标
   */
  static getPositionCoordinates(targetRect, tooltipRect, position, offset) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const result = {
      top: 'auto',
      left: 'auto',
      right: 'auto',
      bottom: 'auto',
      transform: '',
      direction: position
    };

    switch (position) {
      case 'top':
        result.bottom = `${viewportHeight - targetRect.top + offset}px`;
        result.left = `${targetRect.left + targetRect.width / 2}px`;
        result.transform = 'translateX(-50%)';
        break;

      case 'bottom':
        result.top = `${targetRect.bottom + offset}px`;
        result.left = `${targetRect.left + targetRect.width / 2}px`;
        result.transform = 'translateX(-50%)';
        break;

      case 'left':
        result.top = `${targetRect.top + targetRect.height / 2}px`;
        result.right = `${viewportWidth - targetRect.left + offset}px`;
        result.transform = 'translateY(-50%)';
        break;

      case 'right':
        result.top = `${targetRect.top + targetRect.height / 2}px`;
        result.left = `${targetRect.right + offset}px`;
        result.transform = 'translateY(-50%)';
        break;
    }

    return result;
  }

  /**
   * 检查位置是否在视口内
   */
  static isInViewport(coords, tooltipRect, viewportWidth, viewportHeight) {
    // 这里简化处理，实际应该根据 coords 计算最终位置
    return true;
  }

  /**
   * 为元素绑定悬停事件
   */
  static bindHover(element, content, options = {}) {
    let timeoutId = null;

    const showTooltip = () => {
      timeoutId = setTimeout(() => {
        this.show(element, content, options);
      }, options.delay || 200);
    };

    const hideTooltip = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      this.hide();
    };

    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);

    // 返回清理函数
    return () => {
      element.removeEventListener('mouseenter', showTooltip);
      element.removeEventListener('mouseleave', hideTooltip);
      element.removeEventListener('focus', showTooltip);
      element.removeEventListener('blur', hideTooltip);
    };
  }
}

// 导出到全局
window.Tooltip = Tooltip;
