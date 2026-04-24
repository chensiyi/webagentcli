// ==================== ToolsView - 工具页面 ====================

(function() {
  'use strict';
  
  const { createElement, clearElement, createButton } = window.DOMUtils;
  
  let tools = [];
  let loading = true;
  let sendMessage = null;
  let container = null;
  
  function init(rootElement, sendMsg) {
    container = rootElement;
    sendMessage = sendMsg;
    render();
    loadTools();
  }
  
  async function loadTools() {
    try {
      loading = true;
      render();
      
      const response = await sendMessage('GET_TOOLS', {});
      if (response.success) {
        tools = response.data;
      }
    } catch (error) {
      console.error('[ToolsView] Failed to load tools:', error);
    } finally {
      loading = false;
      render();
    }
  }
  
  async function testTool(toolName) {
    try {
      let params = {};
      if (toolName === 'read_page' || toolName === 'click_element') {
        params = { selector: 'title' };
      } else if (toolName === 'fill_form') {
        params = { selector: 'input', value: 'test' };
      }
      const response = await sendMessage('EXECUTE_TOOL', { toolName, params });
      alert('工具测试结果:\n' + JSON.stringify(response, null, 2));
    } catch (error) {
      alert('测试失败: ' + error.message);
    }
  }
  
  function render() {
    clearElement(container);
    container.style.height = '100%';
    container.style.overflowY = 'auto';
    container.style.background = '#f5f5f5';
    container.style.padding = '16px';
    
    if (loading) {
      container.appendChild(createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' },
        children: ['加载中...']
      }));
      return;
    }
    
    // Header
    const header = createElement('div', { style: { marginBottom: '20px' } });
    header.appendChild(createElement('h2', {
      style: { fontSize: '18px', fontWeight: '600', color: '#333' },
      children: ['工具注册']
    }));
    header.appendChild(createElement('p', {
      style: { fontSize: '12px', color: '#999', marginTop: '4px' },
      children: ['共 ' + tools.length + ' 个可用工具']
    }));
    container.appendChild(header);
    
    // Tools list
    if (tools.length === 0) {
      container.appendChild(createElement('div', {
        style: { textAlign: 'center', color: '#999', marginTop: '60px' }
      }, [
        createElement('div', { style: { fontSize: '48px', marginBottom: '16px' }, children: ['🔧'] }),
        createElement('p', { children: ['暂无可用工具'] })
      ]));
    } else {
      tools.forEach(tool => {
        const card = createElement('div', {
          style: { 
            background: '#fff', 
            borderRadius: '8px', 
            padding: '16px', 
            marginBottom: '12px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
          }
        });
        
        const headerRow = createElement('div', {
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            marginBottom: '8px' 
          }
        });
        
        const infoDiv = createElement('div', { style: { flex: 1 } });
        infoDiv.appendChild(createElement('h3', {
          style: { fontSize: '14px', fontWeight: '600', color: '#1976d2', marginBottom: '4px' },
          children: [tool.function.name]
        }));
        infoDiv.appendChild(createElement('p', {
          style: { fontSize: '12px', color: '#666', lineHeight: '1.5' },
          children: [tool.function.description]
        }));
        headerRow.appendChild(infoDiv);
        
        const testBtn = createButton('测试', {
          padding: '4px 12px',
          background: '#f0f0f0',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          color: '#666',
          marginLeft: '12px'
        }, () => testTool(tool.function.name));
        headerRow.appendChild(testBtn);
        
        card.appendChild(headerRow);
        container.appendChild(card);
      });
    }
  }
  
  window.ToolsView = { init };
})();
