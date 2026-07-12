import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// 唯一版本源：package.json
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const VERSION = pkg.version;

// 按 git branch 自动区分环境：main 分支 = production（warn 日志），
// 其他分支（dev/feature/* 等）= development（debug 日志）。
// CI release 构建通常是 detached HEAD（checkout tag），按 production 处理。
function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
const GIT_BRANCH = getGitBranch();
const IS_DEV = GIT_BRANCH !== 'main' && GIT_BRANCH !== 'HEAD';

export default defineConfig({
  base: '',
  define: {
    __VERSION__: JSON.stringify(VERSION),
    __DEV__: JSON.stringify(IS_DEV),
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
        // 侧边栏 HTML 入口（manifest 的 side_panel.default_path 指向 dist/sidepanel/index.html）
        // 其 <script src="./main.ts"> 会由 Vite 自动打包注入
        'sidepanel/index': resolve(__dirname, 'sidepanel/index.html'),
        // Service Worker 入口——Kernel 后台
        'background': resolve(__dirname, 'background/main.ts'),
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
