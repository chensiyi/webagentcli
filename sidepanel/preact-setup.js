// ==================== Preact Setup ====================
// 初始化 Preact 并暴露到 window

console.log('[PreactSetup] Script loaded');
console.log('[PreactSetup] self.preact:', typeof self.preact);
console.log('[PreactSetup] self.preactHooks:', typeof self.preactHooks);

(function() {
  if (typeof self !== 'undefined' && self.preact) {
    window.React = {
      ...self.preact,
      useState: (self.preactHooks && self.preactHooks.useState) || function() { return [undefined, function() {}]; },
      useEffect: (self.preactHooks && self.preactHooks.useEffect) || function() {},
      createElement: self.preact.h
    };
    console.log('[PreactSetup] Preact initialized successfully');
    console.log('[PreactSetup] window.React:', window.React);
  } else {
    console.error('[PreactSetup] Preact not loaded');
    console.error('[PreactSetup] self:', typeof self);
    console.error('[PreactSetup] self.preact:', self.preact);
  }
})();
