// ==UserScript==
// @name         网页宠物聊天浮窗 Pet Chat
// @namespace    https://github.com/webagentcli
// @version      1.0.0
// @description  点宠物 → 弹出玻璃输入框（截图 + 工具），工具清单与侧栏同步、聊天气泡流式返回并自动淡化保留最新两条。
// @author       webagentcli
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * pet-chat.js — 由 Ardot 设计稿实现的「宠物聊天浮窗」组件（零依赖、可独立运行）。
 *
 * 设计稿核心（详见 Ardot 文件 703523941510964）：
 *   气泡(历史) → 输入框 的自下而上阅读顺序（宠物为外部唤起方，不出现在聊天 UI 内）；
 *   输入框为无圆角水晶方框(240×40, 0.5px 白半透明窄边)；
 *   工具按钮点开「从按钮处向上弹出」的工具清单，与 sidepanel ToolsPage 同一套数据/启用逻辑。
 *
 * 通信：走独立 Pet Bridge（chrome.runtime 直连 Kernel），与 sidepanel 的 RPC Facade 隔离。
 *   - 工具清单：rpc('tools.list')  → 内核 createToolsFacade
 *   - 工具开关：rpc('tools.toggle', {name, enabled})
 *   - 真实对话：挂载 window.__petAgentSend(prompt, {onToken}) 钩子（由 Pet Bridge 提供），
 *     缺省时本地模拟流式回复，仅用于演示气泡生命周期。
 * 当扩展环境不可用（纯 Tampermonkey / 未接 Pet Bridge）时，全部优雅降级到内置示例数据。
 *
 * 与 page-pet.user.js 协作：环境宠物点击时派发 window 事件 'mini-pet:open-chat'，本组件监听并开合浮窗；
 * 若无环境宠物，则自带一个 🐱 启动器。
 *
 * 样式权威来源为同目录 pet-chat.css；运行时内联副本见 injectStyles()，两者需保持同步。
 */
(function () {
  'use strict';

  const ROOT_ID = 'pet-chat-root';
  if (document.getElementById(ROOT_ID)) return;            // 防重复注入

  /* =============================================================================
   * CSS_SOURCE — pet-chat.css 的内联副本（运行时注入用，修改请同步 pet-chat.css）
   * ========================================================================== */
  const CSS_SOURCE = `
#pet-chat-root{position:fixed;right:24px;bottom:24px;z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#1a1c22;-webkit-user-select:none;user-select:none}
#pet-chat-root[hidden]{display:none}
.pc-bubbles{display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-height:320px;width:360px;overflow-y:auto;overflow-x:hidden;padding-right:2px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.6) transparent}.pc-bubbles::-webkit-scrollbar{width:6px}.pc-bubbles::-webkit-scrollbar-thumb{background:rgba(255,255,255,.6);border-radius:3px}.pc-bubbles::-webkit-scrollbar-track{background:transparent}
.pc-bubble{max-width:360px;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.45;border:.5px solid rgba(255,255,255,.5);box-shadow:0 8px 24px rgba(20,22,35,.1);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);word-break:break-word;transition:opacity 1.2s ease,transform 1.2s ease}
.pc-bubble.user{background:linear-gradient(180deg,rgba(229,242,255,.88),rgba(214,234,255,.72));color:#1a1c22;align-self:flex-end}
.pc-bubble.ai{background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,.28));color:#1a1c22}
.pc-bubble.fading{opacity:0;transform:translateY(4px)}
.pc-caret{display:inline-block;width:6px;height:14px;margin-left:2px;vertical-align:-2px;background:#1a1c22;border-radius:1px;animation:pc-blink 1s steps(2,start) infinite}
@keyframes pc-blink{50%{opacity:0}}
.pc-box{position:relative;display:flex;align-items:center;justify-content:space-between;width:240px;height:40px;padding:0 8px;border-radius:0;border:1px solid rgba(255,255,255,.55);background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,.28));box-shadow:0 8px 24px rgba(20,22,35,.12);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.pc-input{flex:1 1 auto;min-width:0;border:none;outline:none;background:transparent;font-size:14px;color:#1a1c22;padding:0}
.pc-input::placeholder{color:#9aa0b3}
.pc-actions{display:flex;align-items:center;gap:12px;flex:0 0 auto;margin-left:8px}
.pc-btn{width:14px;height:14px;padding:0;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#3b6fd4;opacity:.85;transition:opacity .15s ease,transform .15s ease}
.pc-btn:hover{opacity:1;transform:scale(1.08)}
.pc-btn svg{width:14px;height:14px;display:block}
.pc-btn.active{color:#1f5fe0}
.pc-btn.active svg{filter:drop-shadow(0 0 3px rgba(31,95,224,.5))}
.pc-panel{position:absolute;right:0;bottom:calc(100% + 8px);width:280px;max-height:280px;overflow-y:auto;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.72);box-shadow:0 16px 40px rgba(20,22,35,.18);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:10px}
.pc-panel[hidden]{display:none}
.pc-panel-head{display:flex;align-items:baseline;justify-content:space-between}
.pc-panel-title{font-size:14px;font-weight:600;color:#1a1c22}
.pc-panel-hint{font-size:11px;color:#9aa0b3}
.pc-tool{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,.55);border:.5px solid rgba(255,255,255,.5)}
.pc-tool-info{min-width:0}
.pc-tool-name{font-size:13px;font-weight:600;color:#1a1c22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-tool-meta{display:flex;align-items:center;gap:6px;margin-top:4px}
.pc-badge{font-size:10px;line-height:1;padding:2px 6px;border-radius:6px;color:#5a6275;background:rgba(120,130,160,.14)}
.pc-badge.script{color:#2f7d4f;background:rgba(60,160,100,.14)}
.pc-switch{flex:0 0 auto;width:40px;height:24px;border-radius:12px;border:none;padding:2px;cursor:pointer;background:#d4d4d8;transition:background .18s ease;position:relative}
.pc-switch::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s ease}
.pc-switch.on{background:#3b6fd4}
.pc-switch.on::after{transform:translateX(16px)}
.pc-launcher{position:fixed;right:24px;bottom:24px;z-index:2147483645;font-size:30px;line-height:1;cursor:pointer;filter:drop-shadow(0 4px 6px rgba(0,0,0,.18))}
.pc-launcher[hidden]{display:none}
`;

  /* ---------------------------------------------------------------- 样式 */
  function injectStyles() {
    if (document.getElementById(ROOT_ID + '-style')) return;
    const style = document.createElement('style');
    style.id = ROOT_ID + '-style';
    style.textContent = CSS_SOURCE;                       // 见文件底部 CSS_SOURCE 常量
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------- 内核桥接 (Pet Bridge) */
  // 与 background RPCServer 同样的信封：{ __pet_rpc__:true, id, method, params }
  // method 形如 'tools.list' / 'tools.toggle' / 'session.send'
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const rt = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;
      if (!rt || !rt.sendMessage) { reject(new Error('no chrome.runtime')); return; }
      const id = 'pc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      // user script 世界用 onUserScriptMessage；content script 世界用 onMessage。两者都挂，按可用情况。
      const ch = rt.onUserScriptMessage || rt.onMessage;
      let settled = false;
      const onResp = (msg) => {
        if (!msg || !msg.__pet_rpc__ || msg.id !== id) return;
        cleanup();
        if (msg.ok) resolve(msg.result); else reject(new Error(msg.error?.message || 'rpc error'));
      };
      const cleanup = () => {
        if (settled) return; settled = true;
        try { (rt.onUserScriptMessage || rt.onMessage)?.removeListener?.(onResp); } catch {}
        clearTimeout(timer);
      };
      (ch?.addListener ? ch : null)?.addListener(onResp);
      const timer = setTimeout(() => { cleanup(); reject(new Error('rpc timeout')); }, 8000);
      Promise.resolve(rt.sendMessage({ __pet_rpc__: true, id, method, params })).catch((e) => { cleanup(); reject(e); });
    });
  }

  // 工具数据：连不上内核时降级到这份示例（与侧栏默认工具一致）
  const MOCK_TOOLS = [
    { name: 'run_user_script',     title: 'run_user_script',     source: '脚本', enabled: true },
    { name: 'manage_user_scripts', title: 'manage_user_scripts', source: '脚本', enabled: true },
    { name: 'web_search',          title: 'web_search',          source: '内置', enabled: false },
  ];
  let _useMock = false;
  const toolsApi = {
    async list() {
      try {
        const r = await rpc('tools.list', []);
        const arr = (r && r.tools) || [];
        return arr.map((t) => ({ name: t.name, title: t.title || t.name, source: t.source || '内置', enabled: t.enabled !== false }));
      } catch {
        _useMock = true;
        return MOCK_TOOLS.map((t) => ({ ...t }));
      }
    },
    async toggle(name, enabled) {
      if (_useMock) { const t = MOCK_TOOLS.find((x) => x.name === name); if (t) t.enabled = enabled; return; }
      try { await rpc('tools.toggle', [{ name, enabled }]); } catch { /* 忽略：降级已生效 */ }
    },
  };

  /* ---------------------------------------------------------------- DOM */
  let root, bubblesEl, inputEl, panelEl, toolsBtn, shotBtn, launcher;

  function svgCamera() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }
  function svgGrid() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.hidden = true;

    bubblesEl = document.createElement('div');
    bubblesEl.className = 'pc-bubbles';

    const box = document.createElement('div');
    box.className = 'pc-box';

    inputEl = document.createElement('input');
    inputEl.className = 'pc-input';
    inputEl.type = 'text';
    inputEl.placeholder = '说点什么';

    const actions = document.createElement('div');
    actions.className = 'pc-actions';

    shotBtn = document.createElement('button');
    shotBtn.className = 'pc-btn';
    shotBtn.title = '截图';
    shotBtn.innerHTML = svgCamera();

    toolsBtn = document.createElement('button');
    toolsBtn.className = 'pc-btn';
    toolsBtn.title = '工具';
    toolsBtn.innerHTML = svgGrid();

    actions.append(shotBtn, toolsBtn);

    panelEl = document.createElement('div');
    panelEl.className = 'pc-panel';
    panelEl.hidden = true;

    box.append(inputEl, actions, panelEl);

    root.append(bubblesEl, box);
    document.body.appendChild(root);

    // 无环境宠物时，自带启动器
    if (!document.getElementById('mini-pet-root')) {
      launcher = document.createElement('div');
      launcher.className = 'pc-launcher';
      launcher.textContent = '🐱';
      launcher.title = '打开宠物聊天';
      document.body.appendChild(launcher);
      launcher.addEventListener('click', toggleOpen);
    }

    /* 事件 */
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendUser(inputEl.value); }
    });
    shotBtn.addEventListener('click', captureScreenshot);
    toolsBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    // 点击面板外部关闭工具面板
    document.addEventListener('click', (e) => {
      if (panelEl.hidden) return;
      if (!panelEl.contains(e.target) && e.target !== toolsBtn) closePanel();
    });
    // 环境宠物派发的开合事件
    window.addEventListener('mini-pet:open-chat', toggleOpen);
    // Esc 关闭聊天（并恢复宠物运动）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) closeChat();
    });
  }

  /* ----------------------------------------------------- 工具面板 */
  let _toolsRendered = false;
  async function ensureTools() {
    if (_toolsRendered) return;
    _toolsRendered = true;
    const tools = await toolsApi.list();
    renderTools(tools);
  }
  function renderTools(tools) {
    panelEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'pc-panel-head';
    head.innerHTML = '<span class="pc-panel-title">工具</span><span class="pc-panel-hint">与侧栏同步</span>';
    panelEl.appendChild(head);

    tools.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'pc-tool';

      const info = document.createElement('div');
      info.className = 'pc-tool-info';
      const name = document.createElement('div');
      name.className = 'pc-tool-name';
      name.textContent = t.title;
      const meta = document.createElement('div');
      meta.className = 'pc-tool-meta';
      const badge = document.createElement('span');
      badge.className = 'pc-badge' + (t.source === '脚本' ? ' script' : '');
      badge.textContent = t.source;
      meta.appendChild(badge);
      info.append(name, meta);

      const sw = document.createElement('button');
      sw.className = 'pc-switch' + (t.enabled ? ' on' : '');
      sw.setAttribute('aria-pressed', String(!!t.enabled));
      sw.addEventListener('click', async () => {
        const next = !sw.classList.contains('on');
        sw.classList.toggle('on', next);
        sw.setAttribute('aria-pressed', String(next));
        await toolsApi.toggle(t.name, next);
      });

      row.append(info, sw);
      panelEl.appendChild(row);
    });
  }
  function togglePanel() {
    const willOpen = panelEl.hidden;
    panelEl.hidden = !willOpen;
    toolsBtn.classList.toggle('active', willOpen);
    if (willOpen) ensureTools();
  }
  function closePanel() {
    panelEl.hidden = true;
    toolsBtn.classList.remove('active');
  }

  /* ----------------------------------------------------- 气泡生命周期 */
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 气泡生命周期：除最后两条外，所有气泡在 FADE_DELAY 后随时间平滑淡化并移除；
  // 最后两条始终保留、不启动消失过程（对齐 shell 消息常驻直觉，仅做极简清理）。
  const FADE_DELAY = 6000;     // 气泡存活时长(ms)：到点后开始淡化
  const FADE_MS = 1200;        // 淡出过渡时长(需与 CSS .fading transition 一致)

  function pushBubble(kind, text) {
    const el = document.createElement('div');
    el.className = 'pc-bubble ' + kind;
    el.textContent = text;
    bubblesEl.appendChild(el);
    scrollToBottom();
    scheduleFades();
    return el;
  }

  // 对齐 shell ChatPage.autoScrollToBottom：有新增/流式内容时始终贴底
  function scrollToBottom() {
    bubblesEl.scrollTop = bubblesEl.scrollHeight;
  }

  // 仅保留最末两条气泡，其余安排随时间淡化消失
  function scheduleFades() {
    const all = Array.from(bubblesEl.querySelectorAll('.pc-bubble'));
    all.forEach((el, idx) => {
      const kept = idx >= all.length - 2;          // 最后两条：保留，不启动消失
      if (kept) {
        if (el._fadeTimer) { clearTimeout(el._fadeTimer); el._fadeTimer = null; }
        el.classList.remove('fading');
        return;
      }
      if (el._fadeTimer || el.classList.contains('fading')) return;   // 已安排 / 已淡出
      el._fadeTimer = setTimeout(() => {
        el._fadeTimer = null;
        el.classList.add('fading');
        setTimeout(() => { if (el.isConnected) el.remove(); scheduleFades(); }, FADE_MS);
      }, FADE_DELAY);
    });
  }

  function sendUser(text) {
    text = (text || '').trim();
    if (!text) return;
    pushBubble('user', text);
    inputEl.value = '';
    runAssistant(text);
  }

  async function runAssistant(prompt) {
    const bubble = pushBubble('ai', '');
    const caret = document.createElement('span');
    caret.className = 'pc-caret';
    bubble.appendChild(caret);
    const append = (chunk) => {
      if (caret && caret.isConnected) caret.insertAdjacentText('beforebegin', chunk);
      else bubble.append(chunk);
      scrollToBottom();
    };

    // 真实通道：Pet Bridge 挂载 window.__petAgentSend(prompt, {onToken})
    if (typeof window.__petAgentSend === 'function') {
      try {
        await window.__petAgentSend(prompt, { onToken: append });
      } catch (e) {
        append('（通道异常：' + (e && e.message ? e.message : e) + '）');
      }
      if (caret && caret.isConnected) caret.remove();
      scheduleFades();
      return;
    }

    // 本地模拟流式回复（演示气泡生命周期）
    const full = '好的，我已收到：「' + prompt + '」。这是网页宠物通道的示例回复（本地模拟）。真实环境会经独立 Pet Bridge 连到内核会话。';
    for (let i = 0; i < full.length; i += 3) {
      append(full.slice(i, i + 3));
      await sleep(28);
    }
    if (caret && caret.isConnected) caret.remove();
    scheduleFades();
  }

  /* ----------------------------------------------------- 截图 */
  async function captureScreenshot() {
    const rt = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;
    try {
      if (rt && chrome.tabs && chrome.tabs.captureVisibleTab) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        pushBubble('user', '📷 截图已发送');
        runAssistant('（用户发来一张截图，请结合截图内容回答）');
        return dataUrl;
      }
    } catch { /* 降级 */ }
    pushBubble('user', '📷 截图（演示）');
    runAssistant('（演示：截图按钮已触发，真实环境将截取当前标签页并附给模型）');
  }

  /* ----------------------------------------------------- 开合 */
  function openChat() {
    root.hidden = false;
    if (launcher) launcher.hidden = true;
    inputEl.focus();
  }
  function closeChat() {
    root.hidden = true;
    closePanel();
    if (launcher) launcher.hidden = false;
    // 通知环境宠物恢复运动
    window.dispatchEvent(new CustomEvent('mini-pet:chat-closed'));
  }
  function toggleOpen() {
    if (root.hidden) openChat(); else closeChat();
  }

  /* ----------------------------------------------------- 启动 */
  injectStyles();
  buildDOM();

  // 对外暴露（便于手动调用 / 其他脚本集成）
  window.PetChat = { open: openChat, close: closeChat, toggle: toggleOpen };
})();
