export interface CacheOptions {
  enabled: boolean;
  sessionCacheKey?: string;
}

import { Settings } from '../models/Settings.js';

export class BaseProviderAPIService {
  name: string;
  config: Settings;
  cacheOptions: CacheOptions;
  abortController: AbortController | null;

  constructor() {
    this.name = '';
    this.config = new Settings();
    this.cacheOptions = { enabled: false };
    this.abortController = null;
  }

  configure(settings: Settings): void {
    this.config = settings;
  }

  async chat(request: any, onChunk?: (chunk: any) => void): Promise<any> { throw new Error('Not implemented'); }
  async chatStream(request: any, onChunk?: (chunk: any) => void): Promise<any> { throw new Error('Not implemented'); }
  shouldApplyCache(request: any): boolean { return false; }
  cancel(): void {}
}
export default BaseProviderAPIService;