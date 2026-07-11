/**
 * sanitizeForClone — 把任意 JS 值转换为 chrome.runtime.sendMessage 可结构化克隆的安全值。
 *
 * 为什么需要它：
 * - chrome.runtime.sendMessage 使用结构化克隆，遇到 函数 / DOM 节点 / Symbol / WeakMap 等会
 *   同步抛 "Could not serialize message"。
 * - JSON.parse(JSON.stringify()) 能去掉函数，但遇到【循环引用】会直接抛异常，且会丢失 Date/Map/Set/undefined。
 *
 * 本函数保证：
 * 1. 永不抛异常（循环引用用 WeakSet 追踪，降级为 '[Circular]'）。
 * 2. 函数 / symbol 降级为 null（而非抛出）。
 * 3. Date / Map / Set / Error / RegExp 转为可还原的纯对象。
 * 4. 类实例优先用其 toJSON()，否则拷贝自有可枚举属性。
 *
 * 这是传输边界（IPCTransport）的唯一序列化入口，确保任何 handler 返回的数据都能安全跨进程。
 */
export function sanitizeForClone(value: any, seen = new WeakSet()): any {
  const t = typeof value;

  if (value === null || value === undefined) return null;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'bigint') return Number(value); // 结构化克隆不支持 bigint，降级为 number
  if (t === 'function' || t === 'symbol') return null; // 不可克隆类型降级

  if (t === 'object') {
    // 循环引用检测
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    let out: any;
    try {
      if (Array.isArray(value)) {
        out = value.map((v) => sanitizeForClone(v, seen));
      } else if (value instanceof Date) {
        out = { __type: 'Date', value: value.toISOString() };
      } else if (value instanceof Map) {
        out = {
          __type: 'Map',
          value: Array.from(value.entries()).map(([k, v]) => [
            sanitizeForClone(k, seen),
            sanitizeForClone(v, seen),
          ]),
        };
      } else if (value instanceof Set) {
        out = { __type: 'Set', value: Array.from(value).map((v) => sanitizeForClone(v, seen)) };
      } else if (value instanceof Error) {
        out = { __type: 'Error', name: value.name, message: value.message, stack: value.stack };
      } else if (value instanceof RegExp) {
        out = { __type: 'RegExp', source: value.source, flags: value.flags };
      } else if (typeof value.toJSON === 'function') {
        // 类实例（如 Tool）自带 toJSON，优先使用
        out = sanitizeForClone(value.toJSON(), seen);
      } else {
        out = {};
        // 仅拷贝自有可枚举字符串键（足够覆盖普通数据对象 / Settings 等）
        for (const key of Object.keys(value)) {
          out[key] = sanitizeForClone(value[key], seen);
        }
      }
    } catch {
      out = null;
    }

    seen.delete(value);
    return out;
  }

  return null;
}
