// ==UserScript==
// @name         迷你网页宠物 Mini Page Pet
// @namespace    https://github.com/chensiyi/webagentcli
// @version      1.0.0
// @description  在任意网页挂一只会跟随鼠标、点击互动的迷你宠物（零依赖、零素材，emoji 实现）
// @author       chensiyi
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 防重复注入（SPA 热替换 / 多实例）
  if (document.getElementById('mini-pet-root')) return;

  const PET = '🐱';          // 想换宠物改这里：🐶 🐰 🐤 🐲 …
  const ROOT_ID = 'mini-pet-root';
  const GAP = 25;           // 宠物包围盒每边与光标保持的空隙（px），可酌情调大/调小
  const SLOW_STEP = 0.03;   // 冷内核（初始化数据未到手）：慢慢挪向聊天窗左侧
  const FAST_STEP = 0.12;   // 热内核（初始化数据已到手）：加速冲刺到聊天窗左侧
  const CHAT_GAP = 4;       // 宠物与聊天窗左缘的间隙（px），2~5

  // ---------- 样式（内联，同步生效）----------
  // 注意：page-pet 跑在 MAIN 世界（@grant none），fetch 受页面 CSP connect-src 约束，
  // 若走 CDN 外置，严格 CSP 站点会拉取失败导致 position:fixed 缺失、宠物掉文档流跑偏。
  // 故整段内联、脚本执行即生效，零失败路径。
  const style = document.createElement('style');
  style.id = ROOT_ID + '-style';
  style.textContent = `
    #${ROOT_ID} {
      position: fixed; left: 0; top: 0; z-index: 2147483647;
      font-size:28px; line-height: 1; cursor: pointer; user-select: none;
      filter: drop-shadow(0 6px 6px rgba(0,0,0,.18));
      transform: translate(40px,40px) scaleX(1);
      /* 注意：位置位移完全由 rAF 主循环的 lerp 驱动，这里不要加 transition。
         否则每帧重写 transform 都会打断上一段 .12s 过渡，产生「追帧式」抖动闪烁。 */
      will-change: transform;
    }
    /* 内层字形：承载 idle/happy/blink 动画，与外层定位 transform 解耦。
       这样动画只是叠加在定位之上（不会覆盖位置），也不会去读 stale 的 --x/--y/--f 变量，
       从而避免点击后冻结再「瞬移」到角落的闪烁感。 */
    #${ROOT_ID} .mp-glyph {
      display: inline-block;
      transform-origin: 50% 100%;
    }
    #${ROOT_ID} .mp-glyph.idle  { animation: mp-bob 2.4s ease-in-out infinite; }
    @keyframes mp-bob { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-6px) } }
    #${ROOT_ID} .mp-glyph.happy { animation: mp-hop .6s cubic-bezier(.28,.84,.42,1); }
    @keyframes mp-hop {
      0%   { transform: translateY(0) scale(1) }
      40%  { transform: translateY(-34px) scale(1.25) }
      100% { transform: translateY(0) scale(1) }
    }
    #${ROOT_ID} .mp-glyph.blink { animation: mp-blink .18s ease; }
    @keyframes mp-blink { 50% { transform: scaleY(.1) } }
    #${ROOT_ID}-bubble {
      position: fixed; z-index: 2147483646; padding: 6px 12px; border-radius: 14px;
      background: rgba(255,255,255,.85); backdrop-filter: blur(8px);
      border: 1px solid rgba(0,0,0,.06); box-shadow: 0 8px 24px rgba(0,0,0,.12);
      font: 14px/1.2 system-ui, sans-serif; color: #333;
      opacity: 0; transform: translateY(6px);
      transition: opacity .2s, transform .2s; pointer-events: none;
    }
    #${ROOT_ID}-bubble.show { opacity: 1; transform: translateY(0); }
  `;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const pet = document.createElement('div');
  pet.id = ROOT_ID;
  document.body.appendChild(pet);

  // 内层字形：位置由外层 pet 的 transform 控制，idle/happy/blink 动画只作用在这一层，
  // 互相叠加而不覆盖，消除点击奔向角落 / 返回时的闪烁。
  const glyph = document.createElement('span');
  glyph.className = 'mp-glyph idle';
  glyph.textContent = PET;
  pet.appendChild(glyph);

  // 测量宠物真实尺寸（用布局盒 offset 尺寸，忽略动画 transform 的瞬时缩放）
  // 光标与盒子的距离按宽/高分别计，保证每个方向都留出 GAP
  const HALF_W = pet.offsetWidth / 2 || 14;
  const HALF_H = pet.offsetHeight / 2 || 14;

  const bubble = document.createElement('div');
  bubble.id = ROOT_ID + '-bubble';
  document.body.appendChild(bubble);

  // ---------- 状态 ----------
  let x = 100, y = 100, tx = x, ty = y, facing = 1, reacting = false, hidden = false, chatOpen = false, fastMode = false, following = true;

  // 鼠标跟随开关：点击进入聊天（奔向角落）的瞬间立即关掉，关闭聊天恢复时再开。
  // 用独立 flag 而非仅依赖 !chatOpen，确保「点击即停跟」在事件时序上绝对优先。
  document.addEventListener('mousemove', (e) => { if (following && !hidden) { tx = e.clientX; ty = e.clientY; } });

  pet.addEventListener('click', () => {
    if (reacting || hidden) return;
    const chatRoot = document.getElementById('pet-chat-root');
    // 无宠物聊天浮窗时（pet-chat.js 未注入）保持原互动行为
    if (!chatRoot) {
      reacting = true;
      glyph.classList.add('happy');
      setTimeout(() => {
        glyph.classList.remove('happy');
        reacting = false;
      }, 620);
      return;
    }
    reacting = true;
    glyph.classList.add('happy');
    // 点击即立即关闭鼠标跟随（避免后续 mousemove 把目标 tx/ty 刷新走，导致奔向角落途中被拉回闪烁），
    // 然后再唤醒聊天浮窗、奔向聊天窗左侧。
    following = false;
    chatOpen = true;
    window.dispatchEvent(new CustomEvent('mini-pet:open-chat'));
    setTimeout(() => {
      glyph.classList.remove('happy');
      reacting = false;
    }, 620);
  });

  // 聊天关闭：恢复跟随鼠标，并复位加速档（下次打开重新判定内核冷暖）
  window.addEventListener('mini-pet:chat-closed', () => {
    chatOpen = false;
    fastMode = false;
    glyph.classList.remove('happy');
    // 恢复鼠标跟随：把目标复位到宠物当前位置，避免复用「点击前」残留的 tx/ty 而导致
    // 关闭瞬间宠物朝旧光标位置猛冲一下再折返的闪烁。
    following = true;
    tx = x; ty = y;
  });

  // 聊天浮窗初始化数据到手（= 内核已启动）：宠物加速冲刺到聊天窗左侧
  window.addEventListener('mini-pet:kernel-ready', () => { fastMode = true; });

  // 偶尔眨眼
  setInterval(() => {
    if (reacting || hidden || chatOpen) return;
    glyph.classList.add('blink');
    setTimeout(() => glyph.classList.remove('blink'), 200);
  }, 4200);

  // ---------- 主循环 ----------
  function loop() {
    if (hidden) { requestAnimationFrame(loop); return; }
    if (chatOpen) {
      // —— 奔向聊天窗左侧（垂直居中、留 CHAT_GAP 间隙）——
      const box = document.getElementById('pet-chat-root');
      if (box && !box.hidden) {
        const r = box.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // 宠物中心目标：聊天窗左缘往左一个宠物半宽 + 间隙；垂直方向居中
          const tgX = r.left - CHAT_GAP - HALF_W;
          const tgY = r.top + r.height / 2;
          const dx = tgX - x, dy = tgY - y;
          const dist = Math.hypot(dx, dy);
          if (dist > 2) {
            // 内核冷热决定步长：冷（初始化数据未到手）慢挪，热（已到手）冲刺
            const step = dist * (fastMode ? FAST_STEP : SLOW_STEP);
            x += dx / (dist || 1) * step;
            y += dy / (dist || 1) * step;
            if (Math.abs(dx) > 1) facing = dx < 0 ? -1 : 1;
          }
          // 位置每帧由 lerp 直接写出（无 CSS transition，无闪烁）。
          // idle 呼吸动画恒定挂在 glyph 上，叠加在此定位之上，不再每帧切换 class。
          const ox = x - HALF_W, oy = y - HALF_H;
          pet.style.transform = `translate(${ox}px, ${oy}px) scaleX(${facing})`;
        }
      }
    } else {
      // —— 跟随鼠标（原行为）——
      const dx = tx - x, dy = ty - y;
      // 光标到宠物包围盒（按真实宽/高）的距离：X/Y 方向分别减去半宽半高再取正
      const bx = Math.max(0, Math.abs(dx) - HALF_W);
      const by = Math.max(0, Math.abs(dy) - HALF_H);
      const boxDist = Math.hypot(bx, by);
      if (boxDist > GAP + 2) {
        // 朝光标靠近，但停在盒子外缘距光标 GAP 处（每个方向都留 25px），鼠标一动就继续追
        const step = Math.min((boxDist - GAP) * 0.08, 14);
        const len = Math.hypot(dx, dy) || 1;
        x += dx / len * step; y += dy / len * step;
        if (Math.abs(dx) > 1) facing = dx < 0 ? -1 : 1;
      }
      // 以宠物中心对齐鼠标（减去真实半宽/半高），消除「左上角到达即停」的偏移
      const ox = x - HALF_W, oy = y - HALF_H;
      pet.style.transform = `translate(${ox}px, ${oy}px) scaleX(${facing})`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
