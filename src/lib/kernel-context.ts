/**
 * Kernel Context — Svelte Context 注入机制
 * 
 * 通过 Svelte 的 setContext/getContext 将 Kernel 实例注入到组件树中，
 * 避免全局变量和 prop drilling。
 */

import { getContext, setContext } from 'svelte';

/** Context key —— 使用 Symbol 确保唯一性 */
export const KERNEL_KEY = Symbol('kernel');

/**
 * 将 Kernel 实例注入到 Svelte context 树中。
 * 在 App.svelte 初始化时调用。
 */
export function provideKernel(kernel: unknown): void {
  setContext(KERNEL_KEY, kernel);
}

/**
 * 从 Svelte context 树中获取 Kernel 实例。
 * 在需要访问 Kernel 的任意子组件中调用。
 */
export function useKernel<T = unknown>(): T {
  return getContext<T>(KERNEL_KEY);
}

// ============== Navigation Context ==============

const NAVIGATE_KEY = Symbol('navigate');

export function provideNavigate(fn: (page: string) => void): void {
  setContext(NAVIGATE_KEY, fn);
}

export function useNavigate(): (page: string) => void {
  return getContext<(page: string) => void>(NAVIGATE_KEY);
}
