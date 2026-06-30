export class IStorageManager {
  async get(key: string): Promise<unknown> { throw new Error('Not implemented'); }
  async set(key: string, value: unknown): Promise<void> { throw new Error('Not implemented'); }
  async remove(key: string): Promise<void> { throw new Error('Not implemented'); }
  async clear(): Promise<void> { throw new Error('Not implemented'); }
  async keys(): Promise<string[]> { throw new Error('Not implemented'); }
  async getAll(): Promise<Array<[string, unknown]>> { throw new Error('Not implemented'); }
}