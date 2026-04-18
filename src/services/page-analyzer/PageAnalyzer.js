// ==================== 页面分析器 ====================
// v4.3.0: 智能提取和理解网页内容
// 为 AI 提供结构化的页面上下文

const PageAnalyzer = (function() {
    'use strict';

    /**
     * 分析当前页面
     * @param {Object} options - 分析选项
     * @returns {Object} 页面分析结果
     */
    function analyzePage(options = {}) {
        const config = {
            maxContentLength: options.maxContentLength || 10000, // 最大内容长度
            includeLinks: options.includeLinks !== false, // 是否包含链接
            includeImages: options.includeImages || false, // 是否包含图片
            detectForms: options.detectForms !== false, // 是否检测表单
            ...options
        };

        return {
            url: window.location.href,
            title: document.title,
            meta: extractMetaInfo(),
            content: extractMainContent(config.maxContentLength),
            structure: detectPageStructure(),
            interactiveElements: config.detectForms ? findInteractiveElements() : [],
            links: config.includeLinks ? extractLinks() : [],
            images: config.includeImages ? extractImages() : [],
            timestamp: Date.now()
        };
    }

    /**
     * 提取元信息
     */
    function extractMetaInfo() {
        const meta = {};
        
        // 描述
        const description = document.querySelector('meta[name="description"]');
        if (description) meta.description = description.content;
        
        // 关键词
        const keywords = document.querySelector('meta[name="keywords"]');
        if (keywords) meta.keywords = keywords.content;
        
        // Open Graph
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) meta.ogTitle = ogTitle.content;
        
        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) meta.ogDescription = ogDescription.content;
        
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) meta.ogImage = ogImage.content;
        
        return meta;
    }

    /**
     * 提取主要内容（智能算法）
     */
    function extractMainContent(maxLength) {
        // 尝试多种策略提取主要内容
        let content = '';
        
        // 策略 1: 查找 article 标签
        const article = document.querySelector('article');
        if (article) {
            content = extractTextFromElement(article);
        }
        
        // 策略 2: 查找 main 标签
        if (!content) {
            const main = document.querySelector('main');
            if (main) {
                content = extractTextFromElement(main);
            }
        }
        
        // 策略 3: 查找具有大量文本的元素
        if (!content) {
            content = findContentRichElement();
        }
        
        // 策略 4: 使用 body（最后手段）
        if (!content) {
            content = extractTextFromElement(document.body);
        }
        
        // 清理和截断
        content = cleanText(content);
        
        if (content.length > maxLength) {
            content = content.substring(0, maxLength) + '... [内容已截断]';
        }
        
        return content;
    }

    /**
     * 从元素中提取文本
     */
    function extractTextFromElement(element) {
        if (!element) return '';
        
        // 移除脚本和样式
        const clone = element.cloneNode(true);
        const scripts = clone.querySelectorAll('script, style, nav, footer, header, aside');
        scripts.forEach(el => el.remove());
        
        return clone.innerText || clone.textContent || '';
    }

    /**
     * 查找内容丰富的元素
     */
    function findContentRichElement() {
        const candidates = [];
        
        // 查找所有 div 和 section
        const elements = document.querySelectorAll('div, section');
        
        elements.forEach(el => {
            const text = el.innerText || '';
            const length = text.trim().length;
            
            // 只考虑文本长度超过 200 字符的元素
            if (length > 200) {
                candidates.push({ element: el, length });
            }
        });
        
        // 按文本长度排序，返回最长的
        candidates.sort((a, b) => b.length - a.length);
        
        if (candidates.length > 0) {
            return extractTextFromElement(candidates[0].element);
        }
        
        return '';
    }

    /**
     * 清理文本
     */
    function cleanText(text) {
        return text
            .replace(/\n\s*\n/g, '\n') // 移除多余空行
            .replace(/[ \t]+/g, ' ') // 合并多个空格
            .trim();
    }

    /**
     * 检测页面结构
     */
    function detectPageStructure() {
        const structure = {
            headings: [],
            paragraphs: 0,
            lists: 0,
            tables: 0,
            codeBlocks: 0
        };
        
        // 提取标题
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
            structure.headings.push({
                level: parseInt(h.tagName[1]),
                text: h.innerText.trim()
            });
        });
        
        // 统计段落
        structure.paragraphs = document.querySelectorAll('p').length;
        
        // 统计列表
        structure.lists = document.querySelectorAll('ul, ol').length;
        
        // 统计表格
        structure.tables = document.querySelectorAll('table').length;
        
        // 统计代码块
        structure.codeBlocks = document.querySelectorAll('pre, code').length;
        
        return structure;
    }

    /**
     * 查找交互元素
     */
    function findInteractiveElements() {
        const elements = [];
        
        // 查找按钮
        const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
        buttons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // 只包括可见元素
                elements.push({
                    type: 'button',
                    text: btn.innerText || btn.value || '',
                    selector: generateSelector(btn),
                    visible: true
                });
            }
        });
        
        // 查找表单输入
        const inputs = document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select');
        inputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                elements.push({
                    type: input.tagName.toLowerCase(),
                    name: input.name || input.id || '',
                    placeholder: input.placeholder || '',
                    selector: generateSelector(input),
                    visible: true
                });
            }
        });
        
        // 限制返回数量（避免过多）
        return elements.slice(0, 50);
    }

    /**
     * 提取链接
     */
    function extractLinks() {
        const links = [];
        const anchorElements = document.querySelectorAll('a[href]');
        
        anchorElements.forEach(a => {
            const rect = a.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // 只包括可见链接
                links.push({
                    text: a.innerText.trim(),
                    href: a.href,
                    title: a.title || ''
                });
            }
        });
        
        // 限制数量
        return links.slice(0, 100);
    }

    /**
     * 提取图片信息
     */
    function extractImages() {
        const images = [];
        const imgElements = document.querySelectorAll('img');
        
        imgElements.forEach(img => {
            const rect = img.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                images.push({
                    src: img.src,
                    alt: img.alt || '',
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                });
            }
        });
        
        return images.slice(0, 50);
    }

    /**
     * 生成 CSS 选择器
     */
    function generateSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).slice(0, 3).join('.');
            if (classes) {
                return `${element.tagName.toLowerCase()}.${classes}`;
            }
        }
        
        return element.tagName.toLowerCase();
    }

    /**
     * 生成页面摘要（用于 AI 上下文）
     */
    function generateSummary(options = {}) {
        const analysis = analyzePage(options);
        
        let summary = `# 页面分析结果\n\n`;
        summary += `**URL**: ${analysis.url}\n`;
        summary += `**标题**: ${analysis.title}\n\n`;
        
        if (analysis.meta.description) {
            summary += `**描述**: ${analysis.meta.description}\n\n`;
        }
        
        summary += `## 内容结构\n`;
        summary += `- 标题数: ${analysis.structure.headings.length}\n`;
        summary += `- 段落数: ${analysis.structure.paragraphs}\n`;
        summary += `- 列表数: ${analysis.structure.lists}\n`;
        summary += `- 表格数: ${analysis.structure.tables}\n\n`;
        
        if (analysis.structure.headings.length > 0) {
            summary += `## 标题层级\n`;
            analysis.structure.headings.slice(0, 10).forEach(h => {
                const indent = '  '.repeat(h.level - 1);
                summary += `${indent}- ${h.text}\n`;
            });
            summary += '\n';
        }
        
        if (analysis.interactiveElements.length > 0) {
            summary += `## 交互元素 (${analysis.interactiveElements.length}个)\n`;
            const buttons = analysis.interactiveElements.filter(e => e.type === 'button');
            const inputs = analysis.interactiveElements.filter(e => e.type !== 'button');
            
            if (buttons.length > 0) {
                summary += `### 按钮\n`;
                buttons.slice(0, 10).forEach(btn => {
                    summary += `- ${btn.text || '(无文本)'}\n`;
                });
                summary += '\n';
            }
            
            if (inputs.length > 0) {
                summary += `### 输入框\n`;
                inputs.slice(0, 10).forEach(input => {
                    summary += `- ${input.name || input.placeholder || '(未命名)'}\n`;
                });
                summary += '\n';
            }
        }
        
        summary += `## 主要内容\n\n`;
        summary += analysis.content.substring(0, 2000);
        
        if (analysis.content.length > 2000) {
            summary += '\n\n... [内容已截断]';
        }
        
        return summary;
    }

    return {
        analyzePage,
        generateSummary,
        extractMainContent,
        findInteractiveElements,
        extractLinks
    };
})();
