/**
 * OpenRouter 模型清单获取工具
 * 
 * 功能：从 OpenRouter API 获取免费模型清单
 */

const OpenRouterModelFetcher = (function() {
    'use strict';

    /**
     * 获取 OpenRouter 免费模型清单
     * @param {string} apiKey - OpenRouter API Key (可选)
     * @returns {Promise<Array>} 模型列表
     */
    async function fetchFreeModels(apiKey = '') {
        const url = 'https://openrouter.ai/api/v1/models';
        const headers = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let responseText;

        // 环境适配：优先使用 GM_xmlhttpRequest，否则使用标准 fetch
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            responseText = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: headers,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.responseText);
                        } else {
                            reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
                        }
                    },
                    onerror: (err) => reject(err),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        } else {
            // 标准浏览器环境 (Console / Web)
            try {
                const response = await fetch(url, { method: 'GET', headers });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                responseText = await response.text();
            } catch (error) {
                console.error('[OpenRouterModelFetcher] Fetch error:', error);
                throw error;
            }
        }

        try {
            const response = JSON.parse(responseText);
            if (response.data && Array.isArray(response.data)) {
                // 过滤出免费模型（pricing 为 '0' 或 0）
                return response.data.filter(model => {
                    const pricing = model.pricing;
                    // OpenRouter API 返回的 pricing 是字符串格式的
                    if (!pricing) return false;
                    return String(pricing.prompt) === '0' && String(pricing.completion) === '0';
                }).map(model => ({
                    id: model.id,
                    name: model.name || model.id,
                    context_length: model.context_length,
                    pricing: model.pricing,
                    description: model.description
                }));
            }
            return [];
        } catch (error) {
            console.error('[OpenRouterModelFetcher] Parse error:', error);
            throw error;
        }
    }

    return {
        fetchFreeModels
    };
})();
