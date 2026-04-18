// ==================== Settings Dialog Component ====================
// React 设置对话框组件

(function() {
    'use strict';
    
    /**
     * SettingsDialog 组件
     */
    function SettingsDialog({ isOpen, onClose }) {
        const { 
            settings, 
            isLoading, 
            saveSettings,
            addProvider,
            deleteProvider,
            addModelToProvider
        } = window.useSettings();
        
        const [activeTab, setActiveTab] = React.useState('basic'); // basic, providers
        const [formData, setFormData] = React.useState(settings);
        const [newProvider, setNewProvider] = React.useState({
            name: '',
            baseUrl: '',
            apiKey: '',
            template: 'openai'
        });
        const [newModel, setNewModel] = React.useState({
            providerId: '',
            modelId: '',
            modelName: ''
        });
        
        // 通用样式
        const styles = {
            formGroup: { marginBottom: '15px' },
            label: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' },
            input: {
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
            },
            select: {
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                background: 'white'
            },
            button: {
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
                border: 'none',
                borderRadius: '4px',
                marginTop: '10px'
            },
            providerItem: {
                padding: '12px',
                marginBottom: '10px',
                background: '#f8f9fa',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }
        };
        
        // 同步 settings 到 formData
        React.useEffect(() => {
            setFormData(settings);
        }, [settings]);
        
        if (!isOpen) return null;
        
        // 处理基础设置保存
        async function handleSaveBasic() {
            try {
                await saveSettings(formData);
                alert('✅ 设置已保存');
                onClose();
            } catch (error) {
                alert('❌ 保存失败: ' + error.message);
            }
        }
        
        // 处理添加供应商
        async function handleAddProvider() {
            if (!newProvider.name || !newProvider.baseUrl) {
                alert('请填写供应商名称和 Base URL');
                return;
            }
            
            try {
                await addProvider({
                    name: newProvider.name,
                    baseUrl: newProvider.baseUrl,
                    apiKey: newProvider.apiKey,
                    template: newProvider.template,
                    isLocal: newProvider.baseUrl.includes('localhost') || newProvider.baseUrl.includes('127.0.0.1'),
                    models: []
                });
                
                setNewProvider({
                    name: '',
                    baseUrl: '',
                    apiKey: '',
                    template: 'openai'
                });
                
                alert('✅ 供应商已添加');
                
            } catch (error) {
                alert('❌ 添加失败: ' + error.message);
            }
        }
        
        // 处理删除供应商
        async function handleDeleteProvider(providerId) {
            if (!confirm('确定要删除这个供应商吗？')) return;
            
            try {
                await deleteProvider(providerId);
                alert('✅ 供应商已删除');
            } catch (error) {
                alert('❌ 删除失败: ' + error.message);
            }
        }
        
        // 处理添加模型
        async function handleAddModel() {
            if (!newModel.providerId || !newModel.modelId) {
                alert('请选择供应商并填写模型 ID');
                return;
            }
            
            try {
                await addModelToProvider(newModel.providerId, {
                    id: newModel.modelId,
                    name: newModel.modelName || newModel.modelId,
                    enabled: true
                });
                
                setNewModel({
                    providerId: '',
                    modelId: '',
                    modelName: ''
                });
                
                alert('✅ 模型已添加');
                
            } catch (error) {
                alert('❌ 添加失败: ' + error.message);
            }
        }
        
        // 渲染基础设置标签页
        function renderBasicTab() {
            return React.createElement('div', { className: 'settings-tab-content' }, [
                // API Key
                React.createElement('div', { 
                    key: 'apikey', 
                    style: { marginBottom: '15px' }
                }, [
                    React.createElement('label', { 
                        key: 'label',
                        style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                    }, 'API Key:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'password',
                        value: formData.apiKey,
                        onChange: (e) => setFormData(prev => ({ ...prev, apiKey: e.target.value })),
                        placeholder: '输入 API Key',
                        style: {
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                        }
                    })
                ]),
                
                // Model
                React.createElement('div', { key: 'model', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, '默认模型:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        value: formData.model,
                        onChange: (e) => setFormData(prev => ({ ...prev, model: e.target.value })),
                        placeholder: '例如: gpt-4, claude-3, auto',
                        className: 'form-input'
                    })
                ]),
                
                // Temperature
                React.createElement('div', { key: 'temp', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, `温度参数: ${formData.temperature}`),
                    React.createElement('input', {
                        key: 'input',
                        type: 'range',
                        min: 0,
                        max: 2,
                        step: 0.1,
                        value: formData.temperature,
                        onChange: (e) => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) })),
                        className: 'form-range'
                    })
                ]),
                
                // Max Tokens
                React.createElement('div', { key: 'tokens', className: 'form-group' }, [
                    React.createElement('label', { key: 'label' }, '最大 Token:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'number',
                        value: formData.maxTokens,
                        onChange: (e) => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) })),
                        className: 'form-input'
                    })
                ]),
                
                // Save Button
                React.createElement('button', {
                    key: 'save',
                    onClick: handleSaveBasic,
                    disabled: isLoading,
                    className: 'btn btn-primary'
                }, isLoading ? '保存中...' : '💾 保存设置')
            ]);
        }
        
        // 渲染供应商管理标签页
        function renderProvidersTab() {
            const providerElements = settings.providers.map(provider => {
                return React.createElement('div', { key: provider.id, className: 'provider-item' }, [
                    React.createElement('div', { key: 'info', className: 'provider-info' }, [
                        React.createElement('strong', { key: 'name' }, provider.name),
                        React.createElement('span', { key: 'url' }, provider.baseUrl),
                        React.createElement('span', { key: 'models' }, `${provider.models?.length || 0} 个模型`)
                    ]),
                    React.createElement('button', {
                        key: 'delete',
                        onClick: () => handleDeleteProvider(provider.id),
                        className: 'btn btn-danger btn-small'
                    }, '🗑️ 删除')
                ]);
            });
            
            return React.createElement('div', { className: 'settings-tab-content' }, [
                // 供应商列表
                React.createElement('div', { key: 'list', className: 'provider-list' }, 
                    providerElements.length > 0 ? providerElements : React.createElement('p', null, '暂无供应商')
                ),
                
                // 添加供应商表单
                React.createElement('div', { key: 'add-form', className: 'add-provider-form' }, [
                    React.createElement('h3', { key: 'title' }, '➕ 添加供应商'),
                    React.createElement('input', {
                        key: 'name',
                        type: 'text',
                        value: newProvider.name,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, name: e.target.value })),
                        placeholder: '供应商名称',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'url',
                        type: 'text',
                        value: newProvider.baseUrl,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, baseUrl: e.target.value })),
                        placeholder: 'Base URL (例如: https://api.openai.com/v1)',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'key',
                        type: 'password',
                        value: newProvider.apiKey,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, apiKey: e.target.value })),
                        placeholder: 'API Key (可选)',
                        className: 'form-input'
                    }),
                    React.createElement('select', {
                        key: 'template',
                        value: newProvider.template,
                        onChange: (e) => setNewProvider(prev => ({ ...prev, template: e.target.value })),
                        className: 'form-select'
                    }, [
                        React.createElement('option', { key: 'openai', value: 'openai' }, 'OpenAI'),
                        React.createElement('option', { key: 'anthropic', value: 'anthropic' }, 'Anthropic'),
                        React.createElement('option', { key: 'google', value: 'google' }, 'Google')
                    ]),
                    React.createElement('button', {
                        key: 'add',
                        onClick: handleAddProvider,
                        className: 'btn btn-success'
                    }, '➕ 添加供应商')
                ]),
                
                // 添加模型表单
                React.createElement('div', { key: 'add-model', className: 'add-model-form' }, [
                    React.createElement('h3', { key: 'title' }, '➕ 添加模型'),
                    React.createElement('select', {
                        key: 'provider',
                        value: newModel.providerId,
                        onChange: (e) => setNewModel(prev => ({ ...prev, providerId: e.target.value })),
                        className: 'form-select'
                    }, [
                        React.createElement('option', { key: 'default', value: '' }, '选择供应商'),
                        ...settings.providers.map(p => 
                            React.createElement('option', { key: p.id, value: p.id }, p.name)
                        )
                    ]),
                    React.createElement('input', {
                        key: 'modelid',
                        type: 'text',
                        value: newModel.modelId,
                        onChange: (e) => setNewModel(prev => ({ ...prev, modelId: e.target.value })),
                        placeholder: '模型 ID (例如: gpt-4)',
                        className: 'form-input'
                    }),
                    React.createElement('input', {
                        key: 'modelname',
                        type: 'text',
                        value: newModel.modelName,
                        onChange: (e) => setNewModel(prev => ({ ...prev, modelName: e.target.value })),
                        placeholder: '模型名称 (可选)',
                        className: 'form-input'
                    }),
                    React.createElement('button', {
                        key: 'add',
                        onClick: handleAddModel,
                        className: 'btn btn-success'
                    }, '➕ 添加模型')
                ])
            ]);
        }
        
        // 主渲染
        return React.createElement('div', { 
            className: 'modal-overlay', 
            onClick: onClose,
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 1000000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }
        }, [
            React.createElement('div', { 
                key: 'modal',
                className: 'modal-content settings-modal',
                onClick: (e) => e.stopPropagation(),
                style: {
                    background: 'white',
                    borderRadius: '12px',
                    width: '700px',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                }
            }, [
                // Header
                React.createElement('div', { 
                    key: 'header', 
                    style: {
                        padding: '20px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }
                }, [
                    React.createElement('h2', { 
                        key: 'title',
                        style: { margin: 0, fontSize: '20px' } 
                    }, '⚙️ 设置'),
                    React.createElement('button', {
                        key: 'close',
                        onClick: onClose,
                        style: {
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#999'
                        }
                    }, '×')
                ]),
                
                // Tabs
                React.createElement('div', { 
                    key: 'tabs',
                    style: {
                        display: 'flex',
                        borderBottom: '1px solid #eee',
                        background: '#f8f9fa'
                    }
                }, [
                    React.createElement('button', {
                        key: 'basic',
                        onClick: () => setActiveTab('basic'),
                        style: {
                            flex: 1,
                            padding: '12px',
                            border: 'none',
                            background: activeTab === 'basic' ? 'white' : 'transparent',
                            borderBottom: activeTab === 'basic' ? '2px solid #2196F3' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: activeTab === 'basic' ? '#2196F3' : '#666',
                            fontWeight: activeTab === 'basic' ? 'bold' : 'normal'
                        }
                    }, '🔧 基础设置'),
                    React.createElement('button', {
                        key: 'providers',
                        onClick: () => setActiveTab('providers'),
                        style: {
                            flex: 1,
                            padding: '12px',
                            border: 'none',
                            background: activeTab === 'providers' ? 'white' : 'transparent',
                            borderBottom: activeTab === 'providers' ? '2px solid #2196F3' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: activeTab === 'providers' ? '#2196F3' : '#666',
                            fontWeight: activeTab === 'providers' ? 'bold' : 'normal'
                        }
                    }, '🌐 供应商管理')
                ]),
                
                // Content
                React.createElement('div', { 
                    key: 'content', 
                    className: 'modal-body',
                    style: {
                        padding: '20px'
                    }
                },
                    activeTab === 'basic' ? renderBasicTab() : renderProvidersTab()
                )
            ])
        ]);
    }
    
    // 暴露到全局
    window.SettingsDialog = SettingsDialog;
    
})();
