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
            apiKey: '',
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
                
                // 从 ConfigManager 加载配置
                const config = ConfigManager.getAll();
                const providers = ProviderManager.getAllProviders();
                
                setSettings({
                    apiKey: config.apiKey || '',
                    model: config.model || 'auto',
                    temperature: config.temperature || 0.7,
                    maxTokens: config.maxTokens || 4096,
                    providers: providers || []
                });
                
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
                
                // 保存基础配置
                if (newSettings.apiKey !== undefined) {
                    ConfigManager.set('apiKey', newSettings.apiKey);
                }
                if (newSettings.model !== undefined) {
                    ConfigManager.set('model', newSettings.model);
                }
                if (newSettings.temperature !== undefined) {
                    ConfigManager.set('temperature', newSettings.temperature);
                }
                if (newSettings.maxTokens !== undefined) {
                    ConfigManager.set('maxTokens', newSettings.maxTokens);
                }
                
                // 更新状态
                setSettings(prev => ({ ...prev, ...newSettings }));
                
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
        
        return {
            settings,
            isLoading,
            saveSettings,
            addProvider,
            deleteProvider,
            addModelToProvider,
            reloadSettings: loadSettings
        };
    }
    
    // 暴露到全局
    window.useSettings = useSettings;
    
})();
