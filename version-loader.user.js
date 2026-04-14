// ==UserScript==
// @name         OpenRouter AI Agent - Version Loader
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  从 GitHub Releases 加载指定版本的 OpenRouter AI Agent
// @author       OpenRouter Agent
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @connect      github.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 配置 - 修改这里来选择版本
    const CONFIG = {
        // GitHub 仓库信息 (修改为你的仓库)
        GITHUB_USER: 'your-username',
        GITHUB_REPO: 'openrouter-browser-agent',
        
        // 版本选择:
        // - 'latest': 自动使用最新版本
        // - 'v2.0.0': 指定版本号
        // - 'main': 使用主分支最新代码
        VERSION: 'latest',
        
        // 是否显示版本信息
        SHOW_VERSION_INFO: true
    };

    // 缓存键
    const CACHE_KEY = 'agent_version_cache';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

    /**
     * 获取最新版本号
     */
    function getLatestVersion() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/releases/latest`,
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        resolve(data.tag_name.replace('v', ''));
                    } else {
                        reject(new Error('获取最新版本失败'));
                    }
                },
                onerror: reject
            });
        });
    }

    /**
     * 从 GitHub 加载脚本
     */
    function loadScript(version) {
        const scriptUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/v${version}/agent.user.js`;
        
        console.log(`📦 正在加载 OpenRouter AI Agent v${version}...`);
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: scriptUrl,
            onload: (response) => {
                if (response.status === 200) {
                    // 缓存版本信息
                    GM_setValue(CACHE_KEY, {
                        version: version,
                        timestamp: Date.now(),
                        content: response.responseText
                    });
                    
                    console.log(`✅ OpenRouter AI Agent v${version} 加载成功!`);
                    
                    // 显示版本信息
                    if (CONFIG.SHOW_VERSION_INFO) {
                        showVersionInfo(version);
                    }
                    
                    // 执行脚本
                    try {
                        eval(response.responseText);
                    } catch (error) {
                        console.error('❌ 脚本执行失败:', error);
                    }
                } else {
                    console.error(`❌ 加载脚本失败 (HTTP ${response.status})`);
                    // 尝试使用缓存
                    loadFromCache();
                }
            },
            onerror: (error) => {
                console.error('❌ 网络错误:', error);
                loadFromCache();
            }
        });
    }

    /**
     * 从缓存加载
     */
    function loadFromCache() {
        const cached = GM_getValue(CACHE_KEY, null);
        
        if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
            console.log(`📦 从缓存加载 v${cached.version}`);
            try {
                eval(cached.content);
            } catch (error) {
                console.error('❌ 缓存脚本执行失败:', error);
            }
        } else {
            console.error('❌ 缓存已过期或不存在');
        }
    }

    /**
     * 显示版本信息（持久浮动按钮）
     */
    function showVersionInfo(version) {
        // 在页面右下角显示持久浮动按钮
        setTimeout(() => {
            const badge = document.createElement('div');
            badge.id = 'agent-launcher-btn';
            badge.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 50%;
                font-size: 24px;
                font-family: -apple-system, sans-serif;
                z-index: 999998;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border: none;
            `;
            badge.textContent = '🤖';
            badge.title = '点击打开 AI Agent';
            
            // 悬停效果
            badge.addEventListener('mouseenter', () => {
                badge.style.transform = 'scale(1.1)';
                badge.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            });
            
            badge.addEventListener('mouseleave', () => {
                badge.style.transform = 'scale(1)';
                badge.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
            });
            
            badge.addEventListener('click', () => {
                // 触发打开 Agent 的事件
                window.dispatchEvent(new CustomEvent('open-ai-agent'));
                
                // 点击后隐藏按钮（Agent 打开后不需要显示）
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 300);
            });
            
            document.body.appendChild(badge);
            
            // 监听 Agent 关闭事件，重新显示按钮
            window.addEventListener('agent-closed', () => {
                badge.style.display = 'flex';
                badge.style.transition = 'all 0.3s ease';
                badge.style.transform = 'scale(1)';
                badge.style.opacity = '1';
            }, { once: false });
            
            console.log('🔘 AI Agent 启动按钮已显示（右下角圆形按钮）');
        }, 1000);
    }

    /**
     * 初始化
     */
    async function init() {
        try {
            let version = CONFIG.VERSION;
            
            if (version === 'latest') {
                console.log('🔍 检查最新版本...');
                version = await getLatestVersion();
            }
            
            console.log(`🎯 目标版本: v${version}`);
            loadScript(version);
            
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            loadFromCache();
        }
    }

    // 启动
    init();

})();
