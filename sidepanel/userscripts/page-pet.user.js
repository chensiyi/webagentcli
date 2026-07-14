// ==UserScript==
// @name         迷你网页宠物 Mini Page Pet
// @namespace    https://github.com/webagentcli
// @version      1.0.0
// @description  在任意网页挂一只会跟随鼠标、点击互动的迷你宠物（零依赖、零素材，emoji 实现）
// @author       Senior Developer
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

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.id = ROOT_ID + '-style';
  style.textContent = `
    #${ROOT_ID} {
      position: fixed; left: 0; top: 0; z-index: 2147483647;
      font-size:28px; line-height: 1; cursor: pointer; user-select: none;
      filter: drop-shadow(0 6px 6px rgba(0,0,0,.18));
      transform: translate(40px,40px) scaleX(1);
      transition: transform .12s cubic-bezier(.22,1,.36,1);
      will-change: transform;
    }
    #${ROOT_ID}.idle  { animation: mp-bob 2.4s ease-in-out infinite; }
    @keyframes mp-bob { 0%,100%{ margin-top:0 } 50%{ margin-top:-6px } }
    #${ROOT_ID}.happy { animation: mp-hop .6s cubic-bezier(.28,.84,.42,1); }
    @keyframes mp-hop {
      0%   { transform: translate(var(--x),var(--y)) scaleX(var(--f)) scale(1) }
      40%  { transform: translate(var(--x),calc(var(--y) - 34px)) scaleX(var(--f)) scale(1.25) }
      100% { transform: translate(var(--x),var(--y)) scaleX(var(--f)) scale(1) }
    }
    #${ROOT_ID}.blink { animation: mp-blink .18s ease; }
    @keyframes mp-blink { 50% { transform: translate(var(--x),var(--y)) scaleX(var(--f)) scaleY(.1) } }
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
  pet.className = 'idle';
  pet.textContent = PET;
  document.body.appendChild(pet);

  // 测量宠物真实尺寸（用布局盒 offset 尺寸，忽略动画 transform 的瞬时缩放）
  // 光标与盒子的距离按宽/高分别计，保证每个方向都留出 GAP
  const HALF_W = pet.offsetWidth / 2 || 14;
  const HALF_H = pet.offsetHeight / 2 || 14;

  const bubble = document.createElement('div');
  bubble.id = ROOT_ID + '-bubble';
  document.body.appendChild(bubble);

  // ---------- 状态 ----------
  let x = 100, y = 100, tx = x, ty = y, facing = 1, reacting = false, hidden = false, chatOpen = false;

  document.addEventListener('mousemove', (e) => { if (!hidden && !chatOpen) { tx = e.clientX; ty = e.clientY; } });

  pet.addEventListener('click', () => {
    if (reacting || hidden) return;
    reacting = true;
    pet.classList.remove('idle');
    pet.classList.add('happy');
    // 唤醒聊天浮窗（pet-chat.js）：宠物停止运动并停在当前位置，直至聊天关闭才恢复
    chatOpen = true;
    pet.classList.remove('idle');
    window.dispatchEvent(new CustomEvent('mini-pet:open-chat'));
    setTimeout(() => {
      pet.classList.remove('happy');
      if (!chatOpen) pet.classList.add('idle');   // 仅当聊天未开时才恢复浮动
      reacting = false;
    }, 620);
  });

  // 聊天关闭时恢复宠物运动（由 pet-chat.js 在关闭时派发）
  window.addEventListener('mini-pet:chat-closed', () => {
    chatOpen = false;
    pet.classList.add('idle');
  });

  // 偶尔眨眼
  setInterval(() => {
    if (reacting || hidden || chatOpen) return;
    pet.classList.add('blink');
    setTimeout(() => pet.classList.remove('blink'), 200);
  }, 4200);

  // ---------- 主循环 ----------
  function loop() {
    if (!hidden && !chatOpen) {
      const dx = tx - x, dy = ty - y;
      // 光标到宠物包围盒（按真实宽/高）的距离：X/Y 方向分别减去半宽半高再取正
      const bx = Math.max(0, Math.abs(dx) - HALF_W);
      const by = Math.max(0, Math.abs(dy) - HALF_H);
      const boxDist = Math.hypot(bx, by);
      if (boxDist > GAP + 2 && !reacting) {
        // 朝光标靠近，但停在盒子外缘距光标 GAP 处（每个方向都留 25px），鼠标一动就继续追
        const step = Math.min((boxDist - GAP) * 0.08, 14);
        const len = Math.hypot(dx, dy) || 1;
        x += dx / len * step; y += dy / len * step;
        if (Math.abs(dx) > 1) facing = dx < 0 ? -1 : 1;
        pet.classList.remove('idle');
      } else if (!reacting) {
        pet.classList.add('idle');
      }
      // 以宠物中心对齐鼠标（减去真实半宽/半高），消除「左上角到达即停」的偏移
      const ox = x - HALF_W, oy = y - HALF_H;
      pet.style.setProperty('--x', ox + 'px');
      pet.style.setProperty('--y', oy + 'px');
      pet.style.setProperty('--f', facing);
      if (!reacting && !pet.classList.contains('blink')) {
        pet.style.transform = `translate(${ox}px, ${oy}px) scaleX(${facing})`;
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
