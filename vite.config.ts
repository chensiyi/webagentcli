import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

// 唯一版本源：package.json
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const VERSION = pkg.version;

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(VERSION),
  },
  resolve: {
    alias: {
      kernel: resolve(__dirname, 'kernel'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        // 旧 UI 入口——保持不变
        sidepanel: resolve(__dirname, 'sidepanel/js/app.js'),
        // 新 UI 入口——Svelte 5
        'svelte-app': resolve(__dirname, 'src/main.ts'),
      },
      output: {
        entryFileNames: '[name].bundle.js',
        format: 'es',
      },
    },
  },
  plugins: [
    svelte({
      compilerOptions: {
        // Svelte 5 runes 模式（默认开启，显式声明）
        runes: true,
      },
    }),
    {
      name: 'sync-manifest-version',
      writeBundle() {
        const manifestPath = resolve(__dirname, 'manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        if (manifest.version !== VERSION) {
          manifest.version = VERSION;
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          console.log(`  ✓ manifest.json → ${VERSION}`);
        }
      },
    },
  ],
});
