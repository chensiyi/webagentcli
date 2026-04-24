// ==================== Preact Setup ====================
// 初始化 Preact 并暴露到 window

(function() {
  if (typeof self !== 'undefined' && self.preact) {
    window.React = {
      ...self.preact,
      useState: (self.preactHooks && self.preactHooks.useState) || function() { return [undefined, function() {}]; },
      useEffect: (self.preactHooks && self.preactHooks.useEffect) || function() {},
      createElement: self.preact.h
    };
    console.log('[PreactSetup] Preact initialized successfully');
  } else {
    console.error('[PreactSetup] Preact not loaded');
  }
})();
