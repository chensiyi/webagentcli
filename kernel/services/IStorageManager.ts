/**
 * IStorageManager — 内核存储抽象接口
 *
 * 内核服务层只依赖此接口，不直接触碰 chrome.*。
 * 具体实现由组装根（background 启动）通过 createChromeStorage() 提供并注入，
 * 做到「shell 提供存储实例、内核不中转」。
 */
export interface IStorageManager {
  /** 读取单个键的值（不存在返回 undefined）。 */
  get(key: string): Promise<unknown>;
  /**
   * 写入单个键值。
   * @param opts.silent 高频率批量写（如流式增量落盘）置 true，避免刷屏：
   *        此时存储层以 debug 级别记录，而非默认的 info。
   */
  set(key: string, value: unknown, opts?: { silent?: boolean }): Promise<void>;
  /** 删除单个键。 */
  remove(key: string): Promise<void>;
  /** 清空全部存储。 */
  clear(): Promise<void>;
  /** 读取全部键值对（Record）。 */
  getAll(): Promise<Record<string, unknown>>;
}
