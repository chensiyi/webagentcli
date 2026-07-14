// ==UserScript==
// @name         网页宠物聊天浮窗 Pet Chat
// @namespace    https://github.com/webagentcli
// @version      2.0.0
// @description  点宠物 → 弹出玻璃输入框，工具清单与侧栏同步、聊天气泡流式返回并自动淡化保留最新两条。经 USER_SCRIPT 世界 Port 直连内核 RPC。
// @author       webagentcli
// @match        *://*/*
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

/*
 * pet-chat.js v2 — 网页宠物聊天浮窗
 *
 * 通信架构（方案 B：USER_SCRIPT 世界直连）：
 *   本脚本 @grant GM_setValue → 运行在 USER_SCRIPT 世界 → chrome.runtime 可用。
 *   经 chrome.runtime.connect({name:'webagent-us-rpc'}) 建立到 background SW 的 Port 长连接。
 *   background 的 UserScriptBridge 监听 onUserScriptConnect，把 Port 接入为 RPC 客户端：
 *     - RPC 请求 → rpcServer.dispatch() → 复用同一套 facade handler（session/tools/...）
 *     - session 通道流式事件 → 转发到 Port（STREAM_* / MESSAGE_ADDED）
 *
 *   与 page-pet.user.js（MAIN 世界）的协作：
 *     CustomEvent 跨世界可见，page-pet 点击时派发 'mini-pet:open-chat'，
 *     本组件监听并开合浮窗；关闭时派发 'mini-pet:chat-closed' 恢复宠物运动。
 *     若无环境宠物，则自带一个 🐱 启动器。
 *
 * 样式从 CDN 加载（pet-chat.css），由 injectStyles() fetch 后注入 <style> 标签。
 * 用 fetch+textContent 而非 <link>：不受页面 CSP style-src 限制。
 */
(function () {
  'use strict';

  const ROOT_ID = 'pet-chat-root';
  if (document.getElementById(ROOT_ID)) return;            // 防重复注入

  /* =============================================================================
   * CSS — 从 CDN 加载，fetch 后注入 <style>（不走 <link> 以绕过页面 CSP style-src）
   * ========================================================================== */
  const CSS_CDN_URL = 'https://cdn.jsdelivr.net/gh/chensiyi/webagentcli@latest/sidepanel/userscripts/pet-chat.css';
  let _cssLoaded = false;

  async function injectStyles() {
    if (_cssLoaded || document.getElementById(ROOT_ID + '-style')) return;
    try {
      const resp = await fetch(CSS_CDN_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const css = await resp.text();
      const style = document.createElement('style');
      style.id = ROOT_ID + '-style';
      style.textContent = css;
      document.head.appendChild(style);
      _cssLoaded = true;
    } catch (e) {
      console.warn('[pet-chat] CSS 加载失败，UI 将无样式:', e);
    }
  }

  /* ============================================ Port RPC 客户端 */
  const PORT_NAME = 'webagent-us-rpc';
  let port = null;
  let portReady = false;
  let reconnectTimer = null;
  const pendingRpc = new Map(); // id → {resolve, reject, timer}
  let rpcSeq = 0;
  // session 事件监听器（由 onSessionEvent 注册）
  const sessionEventListeners = new Set();

  function connectPort() {
    if (port && portReady) return port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
      portReady = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.__rpc) {
          // RPC 响应
          const entry = pendingRpc.get(msg.id);
          if (!entry) return;
          pendingRpc.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.ok) entry.resolve(msg.result);
          else entry.reject(new Error(msg.error?.message || 'rpc error'));
        } else if (msg.__event) {
          // 事件转发（session 通道流式事件等）
          for (const fn of sessionEventListeners) {
            try { fn(msg.event, msg.data); } catch (e) { /* 单个监听器异常不影响其他 */ }
          }
        }
      });

      port.onDisconnect.addListener(() => {
        port = null;
        portReady = false;
        // 拒绝所有 pending RPC
        for (const [, entry] of pendingRpc) {
          clearTimeout(entry.timer);
          entry.reject(new Error('port disconnected'));
        }
        pendingRpc.clear();
        // 延迟重连（SW 可能被回收，下次 connect 会唤醒）
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => { reconnectTimer = null; connectPort(); }, 1000);
        }
      });
    } catch (e) {
      port = null;
      portReady = false;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connectPort(); }, 1000);
      }
    }
    return port;
  }

  function rpcCall(method, params, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!portReady) {
        connectPort();
        if (!portReady) { reject(new Error('port not connected')); return; }
      }
      const id = 'pc-' + (++rpcSeq).toString(36) + '-' + Date.now().toString(36);
      const timer = setTimeout(() => {
        pendingRpc.delete(id);
        reject(new Error('rpc timeout: ' + method));
      }, timeoutMs);
      pendingRpc.set(id, { resolve, reject, timer });
      try {
        port.postMessage({ __rpc: true, id, method, params: params ?? null });
      } catch (e) {
        pendingRpc.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function onSessionEvent(fn) {
    sessionEventListeners.add(fn);
    return () => sessionEventListeners.delete(fn);
  }

  /* ============================================ 会话管理 */
  let sessionId = null;

  async function ensureSession() {
    if (sessionId) return sessionId;
    const resp = await rpcCall('session.create', []);
    sessionId = resp?.session?.id || null;
    return sessionId;
  }

  /* ============================================ DOM */
  let root, bubblesEl, inputEl, panelEl, toolsBtn, launcher;

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

    toolsBtn = document.createElement('button');
    toolsBtn.className = 'pc-btn';
    toolsBtn.title = '工具';
    toolsBtn.innerHTML = svgGrid();

    actions.append(toolsBtn);

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
      // 关键定位内联（CDN CSS 加载前的 fallback，防 FOUC）
      launcher.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483645;font-size:30px;cursor:pointer';
      document.body.appendChild(launcher);
      launcher.addEventListener('click', toggleOpen);
    }

    /* 事件 */
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendUser(inputEl.value); }
    });
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
    try {
      const r = await rpcCall('tools.list', []);
      const tools = (r && r.tools) || [];
      renderTools(tools);
    } catch (e) {
      // 连不上内核时显示提示
      panelEl.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'pc-panel-hint';
      hint.textContent = '无法连接内核';
      panelEl.appendChild(hint);
    }
  }
  function renderTools(tools) {
    panelEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'pc-panel-head';
    head.innerHTML = '<span class="pc-panel-title">工具</span><span class="pc-panel-hint">与侧栏同步</span>';
    panelEl.appendChild(head);

    if (!tools.length) {
      const empty = document.createElement('div');
      empty.className = 'pc-panel-hint';
      empty.textContent = '暂无工具';
      panelEl.appendChild(empty);
      return;
    }

    tools.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'pc-tool';

      const info = document.createElement('div');
      info.className = 'pc-tool-info';
      const name = document.createElement('div');
      name.className = 'pc-tool-name';
      name.textContent = t.title || t.name;
      const meta = document.createElement('div');
      meta.className = 'pc-tool-meta';
      const badge = document.createElement('span');
      badge.className = 'pc-badge' + (t.source === '脚本' ? ' script' : '');
      badge.textContent = t.source || '内置';
      meta.appendChild(badge);
      info.append(name, meta);

      const sw = document.createElement('button');
      sw.className = 'pc-switch' + (t.enabled !== false ? ' on' : '');
      sw.setAttribute('aria-pressed', String(!!(t.enabled !== false)));
      sw.addEventListener('click', async () => {
        const next = !sw.classList.contains('on');
        sw.classList.toggle('on', next);
        sw.setAttribute('aria-pressed', String(next));
        try { await rpcCall('tools.toggle', [{ name: t.name, enabled: next }]); } catch { /* 忽略 */ }
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

  const FADE_DELAY = 6000;
  const FADE_MS = 1200;

  function pushBubble(kind, text) {
    const el = document.createElement('div');
    el.className = 'pc-bubble ' + kind;
    el.textContent = text;
    bubblesEl.appendChild(el);
    scrollToBottom();
    scheduleFades();
    return el;
  }

  function scrollToBottom() {
    bubblesEl.scrollTop = bubblesEl.scrollHeight;
  }

  function scheduleFades() {
    const all = Array.from(bubblesEl.querySelectorAll('.pc-bubble'));
    all.forEach((el, idx) => {
      const kept = idx >= all.length - 2;
      if (kept) {
        if (el._fadeTimer) { clearTimeout(el._fadeTimer); el._fadeTimer = null; }
        el.classList.remove('fading');
        return;
      }
      if (el._fadeTimer || el.classList.contains('fading')) return;
      el._fadeTimer = setTimeout(() => {
        el._fadeTimer = null;
        el.classList.add('fading');
        setTimeout(() => { if (el.isConnected) el.remove(); scheduleFades(); }, FADE_MS);
      }, FADE_DELAY);
    });
  }

  /* ----------------------------------------------------- 对话发送 + 流式接收 */
  // 当前正在流式接收的气泡（用于事件回调追加 token）
  let streamingBubble = null;
  let streamingCaret = null;

  // 注册 session 事件监听：处理流式 token
  onSessionEvent((event, data) => {
    // 只处理当前会话的事件
    if (!sessionId || data?.sessionId !== sessionId) return;

    if (event === 'session:streamStart') {
      // 创建 AI 气泡，显示光标
      streamingBubble = pushBubble('ai', '');
      streamingCaret = document.createElement('span');
      streamingCaret.className = 'pc-caret';
      streamingBubble.appendChild(streamingCaret);
    } else if (event === 'session:streamChunkAppend') {
      // 追加 token
      if (streamingBubble) {
        const chunk = data?.content || '';
        if (chunk) {
          if (streamingCaret && streamingCaret.isConnected) {
            streamingCaret.insertAdjacentText('beforebegin', chunk);
          } else {
            streamingBubble.append(chunk);
          }
          scrollToBottom();
        }
      }
    } else if (event === 'session:streamComplete') {
      // 流式结束
      if (streamingCaret && streamingCaret.isConnected) streamingCaret.remove();
      streamingCaret = null;
      streamingBubble = null;
      scheduleFades();
    } else if (event === 'session:streamError') {
      // 流式错误
      if (streamingCaret && streamingCaret.isConnected) streamingCaret.remove();
      streamingCaret = null;
      if (streamingBubble) {
        streamingBubble.append('（' + (data?.message || '发送失败') + '）');
      } else {
        pushBubble('ai', '（' + (data?.message || '发送失败') + '）');
      }
      streamingBubble = null;
      scheduleFades();
    }
  });

  async function sendUser(text) {
    text = (text || '').trim();
    if (!text) return;
    pushBubble('user', text);
    inputEl.value = '';

    // 确保端口和会话就绪
    if (!portReady) connectPort();
    let sid;
    try {
      sid = await ensureSession();
    } catch (e) {
      pushBubble('ai', '（无法连接内核：' + (e?.message || e) + '）');
      scheduleFades();
      return;
    }
    if (!sid) {
      pushBubble('ai', '（创建会话失败）');
      scheduleFades();
      return;
    }

    // fire-and-forget：session.send 只触发编排，流式 token 经事件回调到达
    try {
      await rpcCall('session.send', [{ sessionId: sid, content: text }]);
    } catch (e) {
      // session.send 正常返回 null（fire-and-forget），超时不算错误
      // 只有真正的端口级错误才需要处理
      if (!streamingBubble) {
        pushBubble('ai', '（发送异常：' + (e?.message || e) + '）');
        scheduleFades();
      }
    }
  }

  /* ----------------------------------------------------- 开合 */
  function openChat() {
    root.hidden = false;
    if (launcher) launcher.hidden = true;
    // 懒连接：首次打开时建立 Port
    if (!portReady) connectPort();
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
})();
