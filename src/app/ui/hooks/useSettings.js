// ==================== Settings Hook ====================
// 管理设置状态的 React Hook

(function() {
    'use strict';
    
    /**
     * Settings Hook
     * @returns {Object} 设置状态和方法
     */
    function useSettings() {
        const [settings, setSettings] = React.useState({
            model: 'auto',
            temperature: 0.7,
            maxTokens: 4096,
            providers: []
        });
        
        const [isLoading, setIsLoading] = React.useState(true);
        
        // 加载设置
        React.useEffect(() => {
            loadSettings();
        }, []);
        
        async function loadSettings() {
            try {
                setIsLoading(true);
                
                // 从 StorageManager 加载设置
                let settings = {};
                if (window.StorageManager) {
                    settings = {
                        model: window.StorageManager.getState('config.model') || 'auto',
                        temperature: window.StorageManager.getState('config.temperature') || 0.7,
                        maxTokens: window.StorageManager.getState('config.maxTokens') || 4096
                    };
                    console.log('[useSettings] 📦 从 StorageManager 加载设置');
                }
                
                const providers = ProviderManager.getAllProviders();
                
                setSettings({
                    ...settings,
                    providers: providers || []
                });
                
                // 触发配置更新事件，通知其他组件
                if (window.EventManager && settings.model) {
                    window.EventManager.emit('SETTINGS_UPDATED', {
                        defaultModel: settings.model,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens
                    });
                    console.log('[useSettings] 📢 初始化时触发 SETTINGS_UPDATED 事件');
                }
                
            } catch (error) {
                console.error('[useSettings] 加载设置失败:', error);
            } finally {
                setIsLoading(false);
            }
        }
        
        // 保存设置
        async function saveSettings(newSettings) {
            try {
                setIsLoading(true);
                
                // 保存到 StorageManager
                if (window.StorageManager) {
                    if (newSettings.model !== undefined) {
                        window.StorageManager.setState('config.model', newSettings.model);
                    }
                    if (newSettings.temperature !== undefined) {
                        window.StorageManager.setState('config.temperature', newSettings.temperature);
                    }
                    if (newSettings.maxTokens !== undefined) {
                        window.StorageManager.setState('config.maxTokens', newSettings.maxTokens);
                    }
                    console.log('[useSettings] 💾 设置已保存到 StorageManager');
                }
                
                // 更新状态
                setSettings(prev => ({ ...prev, ...newSettings }));
                
                // 触发配置更新事件，通知其他组件
                if (window.EventManager) {
                    window.EventManager.emit('SETTINGS_UPDATED', {
                        defaultModel: newSettings.model,
                        temperature: newSettings.temperature,
                        maxTokens: newSettings.maxTokens
                    });
                    console.log('[useSettings] 📢 已触发 SETTINGS_UPDATED 事件');
                }
                
                console.log('[useSettings] ✅ 设置已保存');
                
            } catch (error) {
                console.error('[useSettings] 保存设置失败:', error);
                throw error;
            } finally {
                setIsLoading(false);
            }
        }
        
        // 添加供应商
        async function addProvider(providerData) {
            try {
                await ProviderManager.addProvider(providerData);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已添加');
                
            } catch (error) {
                console.error('[useSettings] 添加供应商失败:', error);
                throw error;
            }
        }
        
        // 删除供应商
        async function deleteProvider(providerId) {
            try {
                await ProviderManager.deleteProvider(providerId);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已删除');
                
            } catch (error) {
                console.error('[useSettings] 删除供应商失败:', error);
                throw error;
            }
        }
        
        // 添加模型到供应商
        async function addModelToProvider(providerId, modelData) {
            try {
                await ProviderManager.addModelsToProvider(providerId, [modelData]);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型已添加');
                
            } catch (error) {
                console.error('[useSettings] 添加模型失败:', error);
                throw error;
            }
        }
        
        // P2: 更新供应商（包括 API Key）
        async function updateProvider(providerId, updates) {
            try {
                await ProviderManager.updateProvider(providerId, updates);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新供应商失败:', error);
                throw error;
            }
        }
        
        // P2: 刷新供应商模型
        async function refreshProviderModels(providerId) {
            try {
                const result = await ProviderManager.refreshProviderModels(providerId);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型已刷新', result);
                return result;
                
            } catch (error) {
                console.error('[useSettings] 刷新模型失败:', error);
                throw error;
            }
        }
        
        // P2: 切换模型启用状态
        async function toggleModelEnabled(providerId, modelId, currentEnabled) {
            try {
                const provider = ProviderManager.getProviderById(providerId);
                if (!provider) throw new Error('供应商不存在');
                
                const models = provider.models.map(m => 
                    m.id === modelId ? { ...m, enabled: !currentEnabled } : m
                );
                
                await ProviderManager.updateProvider(providerId, { models });
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 模型状态已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新模型状态失败:', error);
                throw error;
            }
        }
        
        // P2: 切换供应商启用状态
        async function toggleProviderEnabled(providerId, enabled) {
            try {
                await ProviderManager.toggleProviderEnabled(providerId, enabled);
                
                // 重新加载供应商列表
                const providers = ProviderManager.getAllProviders();
                setSettings(prev => ({ ...prev, providers }));
                
                console.log('[useSettings] ✅ 供应商状态已更新');
                
            } catch (error) {
                console.error('[useSettings] 更新供应商状态失败:', error);
                throw error;
            }
        }
        
        return {
            settings,
            isLoading,
            saveSettings,
            addProvider,
            updateProvider,  // P2: 更新供应商
            deleteProvider,
            toggleProviderEnabled,  // P2: 切换供应商启用状态
            addModelToProvider,
            refreshProviderModels,  // P2: 刷新模型
            toggleModelEnabled,  // P2: 切换模型状态
            reloadSettings: loadSettings
        };
    }
    
    // 暴露到全局
    window.useSettings = useSettings;
    
})();
