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
        assetFileNames: (assetInfo) => {
          // 为 CSS 输出固定名称（无 hash），方便 HTML 入口直接引用
          if (assetInfo.names?.some(n => n.endsWith('.css'))) {
            return 'assets/[name][extname]';
          }
          // 其他资源（图片、字体等）保留 hash
          return 'assets/[name]-[hash][extname]';
        },
        format: 'es',
      },
    },
  },
  plugins: [
    svelte(),
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
