/**
 * ChromeStorageAdapter — chrome.storage.local 的适配器
 *
 * 实现 IStorageManager 接口，供 Kernel 服务层使用
 * 运行在 Service Worker 中，直接调用 chrome.storage API
 */

import { Kernel } from 'kernel/Kernel.js';

export class ChromeStorageAdapter {
    private kernel: Kernel;

    constructor(kernel: Kernel) {
        this.kernel = kernel;
    }

    async get(key: string): Promise<any> {
        const result = await chrome.storage.local.get(key);
        return result[key];
    }

    async set(key: string, value: any): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
    }

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key);
    }

    async clear(): Promise<void> {
        await chrome.storage.local.clear();
    }

    async getAll(): Promise<Record<string, any>> {
        return await chrome.storage.local.get(null);
    }
}