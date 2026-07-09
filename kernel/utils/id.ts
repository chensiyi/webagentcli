/**
 * 生成带前缀的唯一 ID。
 *
 * 集中替换原先散落在 BaseModel / ToolCall / ScriptsManager / IPC /
 * CapabilityManager / Process 中的 `prefix_${Date.now()}_${random}` 内联实现，
 * 消除重复并统一随机串长度。
 */
export function genId(prefix: string, randLength = 9): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 2 + randLength)}`;
}
