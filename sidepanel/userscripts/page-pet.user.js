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

  // ---------- 样式（外置 CDN，与 pet-chat 同模式）----------
  // page-pet 在 MAIN 世界 @grant none，无法读 chrome.runtime 版本，故写死与扩展同版本 tag
  // （每次发版需同步，与 namespace 写死同理）。库未加载成功则宠物短暂无样式（FOUC）。
  const PET_CSS_TAG = '0.7.7';
  const PET_CSS_URL = `https://cdn.jsdelivr.net/gh/chensiyi/webagentcli@${PET_CSS_TAG}/sidepanel/userscripts/page-pet.css`;
  let _petCssLoaded = false;
  async function injectPetStyles() {
    if (_petCssLoaded || document.getElementById(ROOT_ID + '-style')) return;
    try {
      const resp = await fetch(PET_CSS_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const css = await resp.text();
      const style = document.createElement('style');
      style.id = ROOT_ID + '-style';
      style.textContent = css;
      document.head.appendChild(style);
      _petCssLoaded = true;
    } catch (e) {
      console.warn('[page-pet] CSS 加载失败，宠物将无样式:', e);
    }
  }

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

  // 运行时从 CDN 拉取外置样式（写死版本 tag）
  injectPetStyles();

  // ---------- 状态 ----------
  let x = 100, y = 100, tx = x, ty = y, facing = 1, reacting = false, hidden = false, chatOpen = false, fastMode = false;

  document.addEventListener('mousemove', (e) => { if (!hidden && !chatOpen) { tx = e.clientX; ty = e.clientY; } });

  pet.addEventListener('click', () => {
    if (reacting || hidden) return;
    const chatRoot = document.getElementById('pet-chat-root');
    // 无宠物聊天浮窗时（pet-chat.js 未注入）保持原互动行为
    if (!chatRoot) {
      reacting = true;
      pet.classList.remove('idle');
      pet.classList.add('happy');
      setTimeout(() => {
        pet.classList.remove('happy');
        if (!chatOpen) pet.classList.add('idle');
        reacting = false;
      }, 620);
      return;
    }
    reacting = true;
    pet.classList.remove('idle');
    pet.classList.add('happy');
    // 唤醒聊天浮窗（pet-chat.js）：宠物不再停在原地，而是奔向聊天窗左侧；
    // 内核冷暖由 pet-chat 拉取初始化数据的快慢决定（收到 mini-pet:kernel-ready 即加速）。
    chatOpen = true;
    window.dispatchEvent(new CustomEvent('mini-pet:open-chat'));
    setTimeout(() => {
      pet.classList.remove('happy');
      if (!chatOpen) pet.classList.add('idle');
      reacting = false;
    }, 620);
  });

  // 聊天关闭：恢复跟随鼠标，并复位加速档（下次打开重新判定内核冷暖）
  window.addEventListener('mini-pet:chat-closed', () => {
    chatOpen = false;
    fastMode = false;
    pet.classList.add('idle');
  });

  // 聊天浮窗初始化数据到手（= 内核已启动）：宠物加速冲刺到聊天窗左侧
  window.addEventListener('mini-pet:kernel-ready', () => { fastMode = true; });

  // 偶尔眨眼
  setInterval(() => {
    if (reacting || hidden || chatOpen) return;
    pet.classList.add('blink');
    setTimeout(() => pet.classList.remove('blink'), 200);
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
            pet.classList.remove('idle');
          } else {
            pet.classList.add('idle');   // 已到位，原地轻晃
          }
          const ox = x - HALF_W, oy = y - HALF_H;
          pet.style.setProperty('--x', ox + 'px');
          pet.style.setProperty('--y', oy + 'px');
          pet.style.setProperty('--f', facing);
          if (!reacting && !pet.classList.contains('blink')) {
            pet.style.transform = `translate(${ox}px, ${oy}px) scaleX(${facing})`;
          }
        }
      }
    } else {
      // —— 跟随鼠标（原行为）——
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
