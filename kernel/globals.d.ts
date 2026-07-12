/**
 * 全局构建时常量声明
 *
 * __VERSION__ — 由 vite.config.ts 从 package.json 注入（唯一版本源）
 * __DEV__     — 由 vite.config.ts 按 build mode 注入：
 *               `vite build --mode development` → true（开发分支，全量日志）
 *               `vite build`（默认 production）  → false（main 分支，warn 级日志）
 */
declare const __DEV__: boolean;
declare const __VERSION__: string;
