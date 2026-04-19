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
            updateProvider,  // P2: 更新供应商
            deleteProvider,
            toggleProviderEnabled,  // P2: 切换供应商启用状态
            addModelToProvider,
            refreshProviderModels,  // P2: 刷新模型
            toggleModelEnabled  // P2: 切换模型状态
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
        
        // P2: 编辑供应商对话框状态
        const [editingProvider, setEditingProvider] = React.useState(null);
        const [editFormData, setEditFormData] = React.useState({
            name: '',
            baseUrl: '',
            apiKey: '',
            isLocal: false
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
        
        // 同步设置对话框状态到 StorageManager（用于快捷键冲突检测）
        React.useEffect(() => {
            if (window.StorageManager) {
                window.StorageManager.setState('ui.settingsVisible', isOpen ? true : null);
            }
        }, [isOpen]);
        
        // 设置对话框键盘事件处理（仅在对话框打开时）
        React.useEffect(() => {
            if (!isOpen) return;
            
            function handleKeyDown(e) {
                // Escape: 关闭设置对话框
                if (e.key === 'Escape') {
                    e.stopPropagation(); // 阻止事件冒泡到 ChatWindow
                    if (onClose) {
                        onClose();
                        console.log('[SettingsDialog] ⌨️ Escape 关闭设置对话框');
                    }
                    e.preventDefault();
                }
            }
            
            // 使用捕获阶段，确保优先处理
            window.addEventListener('keydown', handleKeyDown, true);
            return () => {
                window.removeEventListener('keydown', handleKeyDown, true);
            };
        }, [isOpen, onClose]);
        
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
        
        // P2: 打开编辑供应商对话框
        function handleEditProvider(provider) {
            setEditingProvider(provider);
            setEditFormData({
                name: provider.name,
                baseUrl: provider.baseUrl,
                apiKey: '',  // 不显示原有 API Key
                isLocal: provider.isLocal || false
            });
        }
        
        // P2: 关闭编辑对话框
        function handleCloseEdit() {
            setEditingProvider(null);
            setEditFormData({
                name: '',
                baseUrl: '',
                apiKey: '',
                isLocal: false
            });
        }
        
        // P2: 保存编辑的供应商
        async function handleSaveEdit() {
            if (!editingProvider) return;
            
            try {
                const updates = {
                    name: editFormData.name,
                    baseUrl: editFormData.baseUrl,
                    isLocal: editFormData.isLocal
                };
                
                // 如果填写了新的 API Key，则更新
                if (editFormData.apiKey.trim()) {
                    updates.apiKey = editFormData.apiKey;
                }
                
                await updateProvider(editingProvider.id, updates);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.PROVIDER_UPDATED, {
                        providerId: editingProvider.id
                    });
                }
                
                alert('✅ 供应商已更新');
                handleCloseEdit();
                
            } catch (error) {
                alert('❌ 更新失败: ' + error.message);
            }
        }
        
        // P2: 刷新供应商模型
        async function handleRefreshModels(providerId) {
            if (!confirm('确定要刷新模型列表吗？\n系统将对比新旧模型并自动保留已有配置。')) return;
            
            try {
                const result = await refreshProviderModels(providerId);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.MODELS_UPDATED, {
                        providerId,
                        ...result
                    });
                }
                
                alert(`✅ 模型已刷新\n新增: ${result.added} 个\n移除: ${result.removed} 个\n总计: ${result.newCount} 个`);
            } catch (error) {
                alert('❌ 刷新失败: ' + error.message);
            }
        }
        
        // P2: 切换模型启用状态
        async function handleToggleModel(providerId, modelId, currentEnabled) {
            try {
                await toggleModelEnabled(providerId, modelId, currentEnabled);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.MODELS_UPDATED, {
                        providerId,
                        modelId,
                        enabled: !currentEnabled
                    });
                }
            } catch (error) {
                alert('❌ 操作失败: ' + error.message);
            }
        }
        
        // P2: 切换供应商启用状态
        async function handleToggleProvider(providerId, currentEnabled) {
            try {
                await toggleProviderEnabled(providerId, !currentEnabled);
                
                // P2: 触发事件通知模型列表更新
                if (window.EventManager) {
                    window.EventManager.emit(window.EventManager.EventTypes.PROVIDER_UPDATED, {
                        providerId,
                        enabled: !currentEnabled
                    });
                }
            } catch (error) {
                alert('❌ 操作失败: ' + error.message);
            }
        }

        // 渲染基础设置标签页
        function renderBasicTab() {
            return React.createElement('div', { className: 'settings-tab-content' }, [

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
                return React.createElement('div', { 
                    key: provider.id, 
                    className: 'provider-item',
                    style: {
                        padding: '15px',
                        marginBottom: '15px',
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef'
                    }
                }, [
                    // 供应商头部信息
                    React.createElement('div', { 
                        key: 'header',
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px'
                        }
                    }, [
                        React.createElement('div', { key: 'info', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
                            // P2: 供应商启用开关
                            React.createElement('label', {
                                key: 'toggle',
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }
                            }, [
                                React.createElement('input', {
                                    type: 'checkbox',
                                    checked: provider.enabled !== false,
                                    onChange: () => handleToggleProvider(provider.id, provider.enabled),
                                    style: { marginRight: '5px' }
                                }),
                                provider.enabled !== false ? '启用' : '禁用'
                            ]),
                            
                            React.createElement('strong', { 
                                key: 'name',
                                style: { 
                                    fontSize: '16px',
                                    color: provider.enabled === false ? '#6c757d' : '#212529'
                                }
                            }, provider.name),
                            React.createElement('span', { 
                                key: 'badge',
                                style: {
                                    fontSize: '12px',
                                    padding: '2px 8px',
                                    background: provider.isLocal ? '#28a745' : '#007bff',
                                    color: 'white',
                                    borderRadius: '12px',
                                    marginRight: '10px'
                                }
                            }, provider.isLocal ? '本地' : '云端'),
                            React.createElement('span', { 
                                key: 'models',
                                style: { fontSize: '13px', color: '#6c757d' }
                            }, `${provider.models?.length || 0} 个模型`)
                        ]),
                        React.createElement('div', { key: 'actions', style: { display: 'flex', gap: '5px' } }, [
                            React.createElement('button', {
                                key: 'edit',
                                onClick: () => handleEditProvider(provider),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#ffc107',
                                    color: '#212529',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '✏️ 编辑'),
                            React.createElement('button', {
                                key: 'refresh',
                                onClick: () => handleRefreshModels(provider.id),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '🔄 刷新'),
                            React.createElement('button', {
                                key: 'delete',
                                onClick: () => handleDeleteProvider(provider.id),
                                style: {
                                    padding: '5px 10px',
                                    fontSize: '12px',
                                    background: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }
                            }, '🗑️')
                        ])
                    ]),
                    
                    // P2: 模型列表
                    provider.models && provider.models.length > 0 ? React.createElement('div', {
                        key: 'models',
                        style: {
                            marginTop: '10px',
                            paddingTop: '10px',
                            borderTop: '1px solid #dee2e6'
                        }
                    }, [
                        React.createElement('div', { 
                            key: 'title',
                            style: { fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }
                        }, '模型列表:'),
                        React.createElement('div', { 
                            key: 'list',
                            style: {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '8px'
                            }
                        }, provider.models.map(model => 
                            React.createElement('div', {
                                key: model.id,
                                style: {
                                    padding: '8px 10px',
                                    background: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #dee2e6',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '12px'
                                }
                            }, [
                                React.createElement('span', {
                                    key: 'name',
                                    style: {
                                        color: model.enabled ? '#212529' : '#6c757d',
                                        textDecoration: model.enabled ? 'none' : 'line-through'
                                    }
                                }, model.name || model.id),
                                React.createElement('label', {
                                    key: 'toggle',
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }
                                }, [
                                    React.createElement('input', {
                                        type: 'checkbox',
                                        checked: model.enabled,
                                        onChange: () => handleToggleModel(provider.id, model.id, model.enabled),
                                        style: { marginRight: '5px' }
                                    }),
                                    model.enabled ? '启用' : '禁用'
                                ])
                            ])
                        ))
                    ]) : null
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
                ),
                
                // P2: 编辑供应商对话框
                editingProvider ? React.createElement('div', {
                    key: 'edit-overlay',
                    style: {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000001
                    },
                    onClick: handleCloseEdit
                }, [
                    React.createElement('div', {
                        key: 'edit-modal',
                        onClick: (e) => e.stopPropagation(),
                        style: {
                            background: 'white',
                            borderRadius: '8px',
                            padding: '24px',
                            width: '500px',
                            maxWidth: '90%'
                        }
                    }, [
                        React.createElement('h3', {
                            key: 'title',
                            style: { margin: '0 0 20px 0', fontSize: '18px' }
                        }, `✏️ 编辑供应商: ${editingProvider.name}`),
                        
                        React.createElement('div', { key: 'form' }, [
                            React.createElement('div', { key: 'name', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, '供应商名称:'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'text',
                                    value: editFormData.name,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, name: e.target.value })),
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
                            
                            React.createElement('div', { key: 'url', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, 'Base URL:'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'text',
                                    value: editFormData.baseUrl,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, baseUrl: e.target.value })),
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
                            
                            React.createElement('div', { key: 'apikey', style: { marginBottom: '15px' } }, [
                                React.createElement('label', { 
                                    key: 'label',
                                    style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }
                                }, 'API Key (留空不修改):'),
                                React.createElement('input', {
                                    key: 'input',
                                    type: 'password',
                                    value: editFormData.apiKey,
                                    onChange: (e) => setEditFormData(prev => ({ ...prev, apiKey: e.target.value })),
                                    placeholder: '输入新的 API Key',
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
                            
                            React.createElement('div', { key: 'local', style: { marginBottom: '20px' } }, [
                                React.createElement('label', {
                                    key: 'label',
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }
                                }, [
                                    React.createElement('input', {
                                        key: 'checkbox',
                                        type: 'checkbox',
                                        checked: editFormData.isLocal,
                                        onChange: (e) => setEditFormData(prev => ({ ...prev, isLocal: e.target.checked })),
                                        style: { marginRight: '8px' }
                                    }),
                                    '本地服务 (如 LM Studio, Ollama)'
                                ])
                            ]),
                            
                            React.createElement('div', {
                                key: 'actions',
                                style: {
                                    display: 'flex',
                                    gap: '10px',
                                    justifyContent: 'flex-end'
                                }
                            }, [
                                React.createElement('button', {
                                    key: 'cancel',
                                    onClick: handleCloseEdit,
                                    style: {
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        background: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }
                                }, '取消'),
                                React.createElement('button', {
                                    key: 'save',
                                    onClick: handleSaveEdit,
                                    style: {
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        background: '#007bff',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }
                                }, '💾 保存')
                            ])
                        ])
                    ])
                ]) : null
            ])
        ]);
    }
    
    // 暴露到全局
    window.SettingsDialog = SettingsDialog;
    
})();
