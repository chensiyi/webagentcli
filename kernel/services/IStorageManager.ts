export class IStorageManager {
  async get(_key: string): Promise<unknown> { throw new Error('Not implemented'); }
  async set(_key: string, _value: unknown): Promise<void> { throw new Error('Not implemented'); }
  async remove(_key: string): Promise<void> { throw new Error('Not implemented'); }
  async clear(): Promise<void> { throw new Error('Not implemented'); }
  async keys(): Promise<string[]> { throw new Error('Not implemented'); }
  async getAll(): Promise<Array<[string, unknown]>> { throw new Error('Not implemented'); }
}