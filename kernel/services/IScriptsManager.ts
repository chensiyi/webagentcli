import { UserScript } from '../models/Scripts.js';

export class BaseScriptsManager {
  constructor() {}
  async load(): Promise<void> {}
  getScripts(): UserScript[] { return []; }
  add(_script: UserScript): void {}
  remove(_id: string): void {}
  get(_id: string): UserScript | null { return null; }
  clear(): void {}
}
