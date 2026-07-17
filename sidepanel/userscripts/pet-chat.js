// ==UserScript==
// @name         网页宠物聊天浮窗 Pet Chat
// @namespace    https://github.com/chensiyi/webagentcli
// @version      2.0.0
// @description  点宠物 → 弹出玻璃输入框，工具清单与侧栏同步、聊天气泡流式返回并自动淡化保留最新两条。经 USER_SCRIPT 世界 Port 直连内核 RPC。
// @author       chensiyi
// @match        *://*/*
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
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
   * 按当前扩展版本号拼 tag（@<version>），与 preset-installer 拉取本脚本的 tag 一致，
   * 避免 @latest 漂移导致 .js 与 .css 版本脱节。非扩展环境回退 @latest。
   * ========================================================================== */
  function cdnBase() {
    let tag = 'latest';
    try {
      const v = chrome.runtime.getManifest()?.version;
      if (v) tag = v;
    } catch (e) { /* 非扩展环境，回退 @latest */ }
    return `https://cdn.jsdelivr.net/gh/chensiyi/webagentcli@${tag}/sidepanel/userscripts`;
  }
  const CSS_CDN_URL = cdnBase() + '/pet-chat.css';
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

  /* =============================================================================
   * Markdown 渲染 —— 外部库（marked + DOMPurify）经 @require 前置注入
   * -----------------------------------------------------------------------------
   * 库源固定为 npm CDN 精确版本（marked@12.0.2 / dompurify@3.1.6）。
   * 安装期由 ScriptsManager._resolveIncludes 拉取源码、拼接为 requireCode，
   * 经 wrapWithGM 前置进本 user script（与用户代码同处 USER_SCRIPT 世界），
   * 因此脚本一开始运行 window.marked / window.DOMPurify 即就绪，无需运行时 fetch/eval。
   *
   * ⚠️ 早期版本用「运行时 fetch + 间接 eval」注入，但 USER_SCRIPT 世界受扩展默认
   * CSP（script-src 'self'）约束，eval 被拦截，window.marked 永远挂不上，markdown
   * 静默降级纯文本（CSS 走 textContent 不受影响，故只有 markdown 没渲染）。
   * @require 前置是本项目既有可靠方式（见 page_to_markdown），故改回此路。
   *
   * 安全兜底：库万一未就绪（如安装期离线拉取失败），renderMarkdown 返回 null，
   * 调用方降级纯文本，不抛错。
   * ========================================================================== */
  // 渲染文本为安全 HTML；库未就绪时返回 null（调用方降级 textContent）
  function renderMarkdown(text) {
    if (!window.marked) return null;
    let html = window.marked.parse(text || '', { breaks: true, gfm: true });
    if (window.DOMPurify) html = window.DOMPurify.sanitize(html);
    return html;
  }

  /* ============================================ Port RPC 客户端 */
  const PORT_NAME = 'webagent-us-rpc';
  let port = null;
  let portReady = false;
  let reconnectTimer = null;
  let reconnectBackoff = 1000; // 指数退避起始值（ms）
  const MAX_RECONNECT_BACKOFF = 8000;
  const pendingRpc = new Map(); // id → {resolve, reject, timer}
  // 端口未就绪时的待发送队列：[{method, params, resolve, reject}]
  const sendQueue = [];
  let rpcSeq = 0;
  // session 事件监听器（由 onSessionEvent 注册）
  const sessionEventListeners = new Set();

  function connectPort() {
    if (port && portReady) return port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
      portReady = true;
      reconnectBackoff = 1000; // 连接成功，重置退避
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      // 断线重连后新 Port 无绑定态：若已有会话，立即重新上报绑定，
      // 否则 bridge 会退回全量转发（跨会话串流）。首次连接时 sessionId 尚为空，静默跳过。
      bindSession();

      // 连接建立成功后，刷出排队的待发送请求
      drainSendQueue();

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
        // 指数退避重连（SW 可能被回收，下次 connect 会唤醒）
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => { reconnectTimer = null; connectPort(); }, reconnectBackoff);
          reconnectBackoff = Math.min(reconnectBackoff * 2, MAX_RECONNECT_BACKOFF);
        }
      });
    } catch (e) {
      port = null;
      portReady = false;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connectPort(); }, reconnectBackoff);
        reconnectBackoff = Math.min(reconnectBackoff * 2, MAX_RECONNECT_BACKOFF);
      }
    }
    return port;
  }

  /**
   * 刷出排队等待端口的发送请求。
   * 在 connectPort() 成功建立新连接后调用，把 sendQueue 中积压的
   * 请求逐一通过 rpcCall 发出（此时端口已就绪，不会再次入队）。
   */
  function drainSendQueue() {
    if (!sendQueue.length || !portReady) return;
    const queue = sendQueue.splice(0);
    for (const item of queue) {
      try {
        rpcCall(item.method, item.params).then(item.resolve).catch(item.reject);
      } catch (e) {
        item.reject(e);
      }
    }
  }

  function rpcCall(method, params, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      // 端口未就绪：先尝试连一次；若仍失败，入队等下次 connectPort() 成功后刷出
      if (!portReady) {
        connectPort();
        if (!portReady) {
          sendQueue.push({ method, params, resolve, reject });
          return;
        }
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
  // 会话思考强度：session.create 返回的 sessionView 已带 reasoningEffort（创建时取自全局配置），
  // 捕获后随 session.send 透传，与侧栏行为一致。会话创建后独立跟随自身值，不再随全局设置变动。
  let sessionReasoning = null;
  // 本会话工具开关覆盖表（session.toolEnabled）：与侧栏一致，宠物开关只写这一层（会话级），
  // 不碰全局 tools.toggle。全局 enabled 是天花板，覆盖仅能在该会话内收窄/开启（全局关则锁定）。
  let sessionToolEnabled = null;

  async function ensureSession() {
    if (sessionId) return sessionId;
    const resp = await rpcCall('session.create', []);
    sessionId = resp?.session?.id || null;
    // sessionView 顶层即带 reasoningEffort（会话级→全局配置→'off' 的回退结果）
    sessionReasoning = resp?.reasoningEffort ?? null;
    // 会话视图已带 toolEnabled 覆盖表（新建为 null），缓存供工具面板三层合并显示
    sessionToolEnabled = resp?.session?.toolEnabled ?? null;
    // 向内核桥接上报本 Port 绑定的会话：bridge 据此仅向本 Port 定向转发本会话的
    // 流式/消息/确认事件（多会话并行时消除跨会话广播）。
    bindSession();
    return sessionId;
  }

  /**
   * 上报 {__bind, sessionId} 控制消息，把当前 Port 绑定到本脚本会话。
   * 在 ensureSession 拿到 sessionId 后调用；Port 断线重连后也需重发（新 Port 无绑定态）。
   * 无 sessionId 或 Port 未就绪时静默跳过（重连成功或建会话后会再次触发）。
   */
  function bindSession() {
    if (!sessionId || !portReady || !port) return;
    try {
      port.postMessage({ __bind: true, sessionId });
    } catch (e) {
      /* Port 可能已断开，重连后会再次上报 */
    }
  }

  /* ============================================ DOM */
  let root, bubblesEl, inputEl, panelEl, toolsBtn, launcher, box;

  function svgGrid() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
  }

  function buildDOM() {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.hidden = true;

    bubblesEl = document.createElement('div');
    bubblesEl.className = 'pc-bubbles';

    box = document.createElement('div');
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
      // 打开工具面板时若尚无会话，先建一个（transient，首条消息落盘），
      // 否则没有 sessionId 可写本会话的 toolEnabled 覆盖——与侧栏一致：会话恒存在。
      if (!sessionId) { try { await ensureSession(); } catch { /* 忽略，tools.list 仍可取全局 */ } }
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

  /**
   * 计算单个工具在「全局 enabled 为上限 + 会话 toolEnabled 覆盖」下的三态视图。
   * 与侧栏 ToolPanel.svelte 合并逻辑一致：
   *   - 全局已禁用 → locked（本会话无法开启，开关置灰锁定）
   *   - override === true  → 'on'（本会话开启）
   *   - override === false → 'off'（本会话禁用）
   *   - override 未定义     → 'inherit'（继承全局：全局开则生效）
   */
  function toolStateOf(t) {
    const globalOn = !!t.enabled;
    const override = sessionToolEnabled ? sessionToolEnabled[t.name] : undefined;
    if (!globalOn) return { locked: true, effectiveOn: false, state: 'locked' };
    if (override === true) return { locked: false, effectiveOn: true, state: 'on' };
    if (override === false) return { locked: false, effectiveOn: false, state: 'off' };
    return { locked: false, effectiveOn: globalOn, state: 'inherit' };
  }

  const TOOL_STATE_LABEL = {
    inherit: '继承全局',
    on: '本会话开启',
    off: '本会话禁用',
    locked: '全局禁用',
  };

  function renderTools(tools) {
    panelEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'pc-panel-head';
    head.innerHTML = '<span class="pc-panel-title">工具</span><span class="pc-panel-hint">本会话开关（全局为上限）</span>';
    panelEl.appendChild(head);

    if (!tools.length) {
      const empty = document.createElement('div');
      empty.className = 'pc-panel-hint';
      empty.textContent = '暂无工具';
      panelEl.appendChild(empty);
      return;
    }

    tools.forEach((t) => {
      const st = toolStateOf(t);
      const row = document.createElement('div');
      row.className = 'pc-tool' + (st.locked ? ' locked' : '');

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
      // 三态标签：继承全局 / 本会话开启 / 本会话禁用 / 全局禁用
      const stateLabel = document.createElement('span');
      stateLabel.className = 'pc-tool-state state-' + st.state;
      stateLabel.textContent = TOOL_STATE_LABEL[st.state];
      meta.appendChild(stateLabel);
      info.append(name, meta);

      const sw = document.createElement('button');
      sw.className = 'pc-switch' + (st.effectiveOn ? ' on' : '') + (st.locked ? ' locked' : '');
      sw.setAttribute('aria-pressed', String(st.effectiveOn));
      sw.title = st.locked ? '已被全局禁用，无法在本会话启用'
        : st.state === 'inherit' ? '点击：在本会话开启'
        : st.state === 'on' ? '点击：在本会话禁用'
        : '点击：恢复继承全局';
      if (!st.locked) {
        // 三态循环：undefined（继承）→ true（本会话开）→ false（本会话禁）→ undefined（恢复继承）
        // 仅写本会话 toolEnabled 覆盖表，不动全局 tools.toggle（全局是天花板，会话层只能收窄/开启）。
        sw.addEventListener('click', async () => {
          const override = sessionToolEnabled ? sessionToolEnabled[t.name] : undefined;
          let next;
          if (override === undefined) next = true;
          else if (override === true) next = false;
          else next = undefined;
          const base = Object.assign({}, sessionToolEnabled || {});
          if (next === undefined) delete base[t.name];
          else base[t.name] = next;
          const normalized = Object.keys(base).length ? base : null;
          // 乐观即时反馈：先刷新本地覆盖表与 UI，再写回内核
          sessionToolEnabled = normalized;
          const ns = toolStateOf(t);
          sw.classList.toggle('on', ns.effectiveOn);
          sw.setAttribute('aria-pressed', String(ns.effectiveOn));
          sw.title = ns.locked ? '已被全局禁用，无法在本会话启用'
            : ns.state === 'inherit' ? '点击：在本会话开启'
            : ns.state === 'on' ? '点击：在本会话禁用'
            : '点击：恢复继承全局';
          stateLabel.className = 'pc-tool-state state-' + ns.state;
          stateLabel.textContent = TOOL_STATE_LABEL[ns.state];
          try {
            const resp = await rpcCall('session.update', [{ sessionId, data: { toolEnabled: normalized } }]);
            // 用返回权威视图刷新覆盖表（零额外 RPC）
            if (resp?.session) sessionToolEnabled = resp.session.toolEnabled ?? null;
          } catch { /* 忽略 */ }
        });
      }

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
  const FADE_DELAY = 6000;
  const FADE_MS = 1200;

  function pushBubble(kind, text) {
    const el = document.createElement('div');
    el.className = 'pc-bubble ' + kind;
    // Markdown 渲染；库未就绪时降级纯文本
    const html = renderMarkdown(text);
    if (html !== null) el.innerHTML = html; else el.textContent = text || '';
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

  /* ----------------------------------------------------- 危险工具确认卡片 */
  // 与内核 ToolsManager._confirmTimeoutMs（120000ms）对齐：内核超时后会自动拒绝并广播
  // session:confirmResolved，这里作为兜底同步清理 UI，避免极端情况下卡片残留。
  const CONFIRM_TIMEOUT = 120_000;
  let confirmCard = null; // 当前挂起的确认卡片 DOM
  let confirmTimer = null; // 自动超时清理计时器

  function showConfirm(req) {
    const requestId = req?.requestId;
    if (!requestId) return;
    // 安全起见：先清掉任何已有卡片（内核同一会话同一时刻只挂起一个请求，但保险）
    clearConfirm();

    // 危险操作提示优先于关闭态：自动展开聊天窗，确保用户能看见确认卡片
    if (root.hidden) openChat();

    const card = document.createElement('div');
    card.className = 'pc-confirm';
    card.dataset.requestId = requestId;

    const head = document.createElement('div');
    head.className = 'pc-confirm-head';
    head.textContent = '⚠️ 危险操作确认';

    const body = document.createElement('div');
    body.className = 'pc-confirm-body';

    const toolName = document.createElement('div');
    toolName.className = 'pc-confirm-tool';
    toolName.textContent = req?.toolName || '未知工具';

    const reason = document.createElement('div');
    reason.className = 'pc-confirm-reason';
    reason.textContent = req?.reason || '该工具被标记为危险操作，执行前需人工确认';

    body.append(toolName, reason);

    // 参数摘要（可选）：args 可能是对象，紧凑展示为 JSON，过长截断
    const argsSummary = summarizeArgs(req?.args);
    if (argsSummary) {
      const argsEl = document.createElement('pre');
      argsEl.className = 'pc-confirm-args';
      argsEl.textContent = argsSummary;
      body.appendChild(argsEl);
    }

    const actions = document.createElement('div');
    actions.className = 'pc-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'pc-confirm-btn cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => resolveConfirm(requestId, false));

    const allowBtn = document.createElement('button');
    allowBtn.className = 'pc-confirm-btn allow';
    allowBtn.textContent = '允许执行';
    allowBtn.addEventListener('click', () => resolveConfirm(requestId, true));

    actions.append(cancelBtn, allowBtn);
    card.append(head, body, actions);

    // 插入到气泡栈与输入框之间
    root.insertBefore(card, box);
    confirmCard = card;

    // 兜底超时：内核 120s 后会广播 session:confirmResolved 并再次清理，这里同步移除
    confirmTimer = setTimeout(() => clearConfirm(), CONFIRM_TIMEOUT);
  }

  function resolveConfirm(requestId, approved) {
    if (!requestId) return;
    // 乐观移除 UI，内核随后广播 resolve 会再次确保清理（幂等）
    clearConfirm();
    rpcCall('session.confirmResolve', [{ requestId, approved }]).catch(() => {
      pushBubble('ai', '（确认提交失败，工具未执行）');
      scheduleFades();
    });
  }

  function clearConfirm() {
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
    if (confirmCard && confirmCard.isConnected) confirmCard.remove();
    confirmCard = null;
  }

  /* ----------------------------------------------------- 工具调用卡片 */
  // 与危险确认卡片不同：工具调用卡片是「执行状态」展示，按 toolCallId 跟踪、回合内常驻，
  // 不进气泡栈（不参与自动淡出），回合开始（streamStart）时整体清空。
  // 数据来源：内核经桥接层转发 tool:executing / tool:completed（tool 通道）+ session:messageAdded（tool 结果消息）。
  const toolCards = new Map(); // toolCallId -> { el, body, badge, icon }

  function extractToolText(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content.map((b) => (b && b.type === 'text' ? (b.text || '') : '')).join('').trim();
    }
    return '';
  }

  function showToolCard(toolCallId, toolName) {
    if (!toolCallId) return null;
    let card = toolCards.get(toolCallId);
    if (card) return card;
    const el = document.createElement('div');
    el.className = 'pc-tool-card';
    el.dataset.toolCallId = toolCallId;
    const head = document.createElement('div');
    head.className = 'pc-tool-head';
    const icon = document.createElement('span');
    icon.className = 'pc-tool-icon spin';
    icon.textContent = '🔄';
    const name = document.createElement('span');
    name.className = 'pc-tool-name';
    name.textContent = '🔧 ' + (toolName || '工具');
    const badge = document.createElement('span');
    badge.className = 'pc-tool-badge running';
    badge.textContent = '执行中';
    head.append(icon, name, badge);
    const body = document.createElement('div');
    body.className = 'pc-tool-body';
    el.append(head, body);
    // 插入到气泡栈与输入框之间（与确认卡片同位置）
    root.insertBefore(el, box);
    card = { el, body, badge, icon };
    toolCards.set(toolCallId, card);
    return card;
  }

  function updateToolCard(toolCallId, status) {
    const card = toolCards.get(toolCallId);
    if (!card) return;
    const failed = status === 'failed' || status === 'rejected';
    card.icon.classList.remove('spin');
    card.icon.textContent = failed ? '⛔' : '✅';
    card.badge.className = 'pc-tool-badge ' + (failed ? 'error' : 'done');
    card.badge.textContent = failed ? '失败' : '已完成';
  }

  function appendToolResult(toolCallId, text) {
    const card = toolCards.get(toolCallId);
    if (!card || !text) return;
    const pre = document.createElement('pre');
    pre.className = 'pc-tool-result';
    pre.textContent = text.length > 500 ? text.slice(0, 500) + '\n…(已截断)' : text;
    card.body.appendChild(pre);
  }

  function clearToolCards() {
    for (const [, card] of toolCards) {
      if (card.el && card.el.isConnected) card.el.remove();
    }
    toolCards.clear();
  }

  function summarizeArgs(args) {
    if (args === undefined || args === null) return '';
    try {
      const s = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
      if (!s) return '';
      return s.length > 600 ? s.slice(0, 600) + '\n…(已截断)' : s;
    } catch {
      return String(args);
    }
  }

  /* ----------------------------------------------------- 对话发送 + 流式接收 */
  // 当前正在流式接收的气泡（用于事件回调渲染）
  let streamingBubble = null;
  let streamingText = '';          // 流式累加的原文，每个 chunk 重新 markdown 渲染
  // 把累加原文渲染进气泡（含打字光标）；库未就绪时降级纯文本
  function renderStreaming(showCaret) {
    if (!streamingBubble) return;
    const html = renderMarkdown(streamingText);
    if (html !== null) {
      streamingBubble.innerHTML = html;
      if (showCaret) {
        const caret = document.createElement('span');
        caret.className = 'pc-caret';
        streamingBubble.appendChild(caret);
      }
    } else {
      streamingBubble.textContent = streamingText;
    }
  }

  // 注册 session 事件监听：处理流式 token 与危险工具确认
  onSessionEvent((event, data) => {
    // 只处理当前会话的事件
    if (!sessionId || data?.sessionId !== sessionId) return;

    // —— 危险工具人工确认闸门（与 STREAM_* 同走 session 通道）——
    if (event === 'session:confirmRequest') {
      // 内核 invoke 危险工具前广播，弹出「允许/取消」卡片
      showConfirm(data);
      return;
    } else if (event === 'session:confirmResolved') {
      // 内核已决策（或超时自动拒绝）后广播，移除残留确认卡片
      clearConfirm();
      return;
    } else if (event === 'tool:executing') {
      // 工具开始执行：弹出「执行中」卡片（按 toolCallId 跟踪，回合内常驻）
      showToolCard(data?.toolCallId, data?.toolName);
      return;
    } else if (event === 'tool:completed') {
      // 工具执行结束：卡片标记完成/失败（结果文本经 session:messageAdded 的 tool 消息附加上来）
      updateToolCard(data?.toolCallId, data?.status);
      return;
    } else if (event === 'session:messageAdded') {
      // 工具结果消息（role='tool'）：把结果文本追加到对应工具卡片
      const m = data?.message;
      if (m && m.role === 'tool' && m.toolCallId) {
        appendToolResult(m.toolCallId, extractToolText(m.content));
      }
      return;
    }

    if (event === 'session:streamStart') {
      // 回合开始：清空上一回合残留的工具卡片
      clearToolCards();
      // 创建 AI 气泡，准备累加渲染
      streamingBubble = pushBubble('ai', '');
      streamingText = '';
    } else if (event === 'session:streamChunkAppend') {
      // 追加 token 并重新 markdown 渲染（含光标）
      if (streamingBubble) {
        const chunk = data?.content || '';
        if (chunk) {
          streamingText += chunk;
          renderStreaming(true);
          scrollToBottom();
        }
      }
    } else if (event === 'session:streamComplete') {
      // 流式结束：最终渲染（去光标）
      renderStreaming(false);
      streamingBubble = null;
      streamingText = '';
      scheduleFades();
    } else if (event === 'session:streamError') {
      // 流式错误
      const msg = '（' + (data?.message || '发送失败') + '）';
      if (streamingBubble) {
        const html = renderMarkdown(msg);
        if (html !== null) streamingBubble.innerHTML = html; else streamingBubble.textContent = msg;
      } else {
        pushBubble('ai', msg);
      }
      streamingBubble = null;
      streamingText = '';
      scheduleFades();
    }
  });

  async function sendUser(text) {
    text = (text || '').trim();
    if (!text) return;
    // markdown 库经 @require 前置已随脚本就绪；renderMarkdown 内部再做兜底降级
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

    // fire-and-forget：session.send 只触发编排，流式 token 经事件回调到达。
    // 显式带上会话创建时捕获的思考强度（取自全局配置并烤进会话），使宠物与侧栏一致：
    // 创建时默认「关」即不返回思考过程；创建后该会话独立跟随自身值，不随全局设置变动。
    try {
      await rpcCall('session.send', [{ sessionId: sid, content: text, reasoningEffort: sessionReasoning || undefined }]);
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
    // 拉取初始化数据（= 内核启动完成）；到手即通知宠物加速奔向聊天窗左侧。
    // ensureSession 幂等：会话已存在则瞬间返回（热路径），SW 被回收时则需唤醒 + boot（冷路径，较慢）。
    ensureSession()
      .then(() => window.dispatchEvent(new CustomEvent('mini-pet:kernel-ready')))
      .catch(() => { /* 连不上内核则宠物保持慢速，无妨 */ });
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
  // 启动即建立长连接：USER_SCRIPT 世界的 Port 在打开期间让 SW 保持存活（与 sidepanel 的
  // IPCTransport 保活同源）。这样宠物作为独立入口时，即便侧栏关闭也能让 kernel 常驻、避免冷启动；
  // 断开后 connectPort 内部会自动重连，保证保活连续性。
  connectPort();
  injectStyles();
  // marked + DOMPurify 经 @require 前置，安装期已注入本 user script 世界，
  // 脚本运行即 window.marked / window.DOMPurify 就绪，无需运行时加载。
  buildDOM();
})();
