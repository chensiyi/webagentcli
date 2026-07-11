/**
 * 深拷贝为纯 JS 对象（JSON 往返）。
 *
 * 集中替换 SettingsManager 中多次出现的 `JSON.parse(JSON.stringify(x))`，
 * 用于剥离 Svelte $state Proxy（避免代理内部属性被注入序列化目标）。
 */
export function clonePlain<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
