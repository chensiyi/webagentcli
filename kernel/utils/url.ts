/**
 * 拼接 base 与 path，自动规整尾部 / 头部多余的斜杠。
 *
 * 集中替换原先散落的 `endpoint.replace(/\/$/, '')` 写法
 * （OpenAIService / LMStudioService / OpenRouterService / listModels）。
 */
export function joinUrl(base: string, path = ''): string {
  const cleanBase = (base || '').replace(/\/+$/, '');
  const cleanPath = (path || '').replace(/^\/+/, '');
  return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
}
