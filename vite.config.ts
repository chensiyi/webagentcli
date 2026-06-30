import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'kernel/index.ts'),
      name: 'webagent',
      formats: ['iife'],
      fileName: 'kernel.bundle'
    }
  },
  plugins: [{
    name: 'kernel-window-expose',
    closeBundle() {
      const p = resolve(__dirname, 'dist/kernel.bundle.iife.js');
      const src = readFileSync(p, 'utf-8');
      if (!src.includes('webagent')) return;
      const trailer = "\n;;(function(){try{for(var k in webagent){if(webagent.hasOwnProperty(k)){window[k]=webagent[k];}}}catch(e){console.warn('[kernel-window]',e.message);}})();";
      const out = src.includes('for(var k in webagent)') ? src : src + trailer;
      writeFileSync(p, out, 'utf-8');
    }
  }]
});