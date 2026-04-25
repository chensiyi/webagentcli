// 设置页面
window.Pages = window.Pages || {};

window.Pages.settings = function(container) {
  const { create, clear, setTheme, getTheme } = window.DOM;
  
  let settings = {
    apiKey: '',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
    theme: getTheme()
  };
  
  function render() {
    clear(container);
    
    const page = create('div', { className: 'page' });
    
    // 头部
    page.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', text: '设置' })
    ]));
    
    // 内容
    const content = create('div', { className: 'page-content' });
    
    // 主题选择
    content.appendChild(create('div', { className: 'setting-group' }, [
      create('label', { className: 'setting-label', text: '主题' }),
      create('div', {}, [
        create('label', { style: { marginRight: '16px', cursor: 'pointer' } }, [
          create('input', {
            attrs: { type: 'radio', name: 'theme', value: 'light' },
            style: { marginRight: '4px' },
            onChange: () => { settings.theme = 'light'; setTheme('light'); }
          }),
          '浅色'
        ]),
        create('label', { style: { cursor: 'pointer' } }, [
          create('input', {
            attrs: { type: 'radio', name: 'theme', value: 'dark' },
            style: { marginRight: '4px' },
            onChange: () => { settings.theme = 'dark'; setTheme('dark'); }
          }),
          '深色'
        ])
      ])
    ]));
    
    // 加载已保存的设置
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        settings = { ...settings, ...result.settings };
        setTheme(settings.theme);
        
        // 更新单选按钮状态
        const radios = content.querySelectorAll('input[name="theme"]');
        radios.forEach(radio => {
          radio.checked = radio.value === settings.theme;
        });
      }
    });
    
    page.appendChild(content);
    
    // 底部
    page.appendChild(create('div', { className: 'page-footer' }, [
      create('button', {
        className: 'btn btn-primary',
        text: '保存设置',
        style: { width: '100%' },
        onClick: () => {
          chrome.storage.local.set({ settings }, () => {
            alert('已保存');
          });
        }
      })
    ]));
    
    container.appendChild(page);
  }
  
  render();
};
