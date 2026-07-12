/**
 * Toast 通知 store
 *
 * 采用 Svelte 5 推荐的「class + $state 字段」单例模式：
 * - `toasts` 是 class 的 `$state` 字段，组件模板直接读取 `toast.toasts` 即可建立响应式订阅，
 *   不依赖 getter 间接访问（避免模块级 $state 经 getter 返回时偶发的响应式失灵）。
 * - 全局唯一实例 `toastStore`，所有页面调用 `useToast()` 拿到的是同一实例，
 *   任意页面调用 `toast.success/error/...` 都会更新同一个 `toasts` 队列，由挂载一次的
 *   <ToastContainer> 统一渲染。
 * - `remove` 用箭头字段定义，绑定实例 `this`，作为回调透传给 <Toast> 的 ondismiss 时不会丢失上下文。
 */

export interface ToastAction {
  label: string;
  variant?: 'primary' | 'danger' | 'default';
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
  /** 操作按钮（如危险操作确认的「允许/取消」）。点击任一按钮后自动关闭。 */
  actions?: ToastAction[];
}

class ToastStore {
  toasts = $state<ToastItem[]>([]);

  private add(message: string, type: ToastItem['type'], duration = 3000): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.toasts = [...this.toasts, { id, message, type, duration }];
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    return id;
  }

  remove = (id: string): void => {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  };

  success = (message: string, duration?: number) => this.add(message, 'success', duration);
  error = (message: string, duration?: number) => this.add(message, 'error', duration);
  warning = (message: string, duration?: number) => this.add(message, 'warning', duration);
  info = (message: string, duration?: number) => this.add(message, 'info', duration);

  /**
   * 带操作按钮的 toast（如危险操作确认）。
   * 点击任一按钮后自动关闭；duration=0 表示不自动关闭（由按钮或 ✕ 关闭）。
   */
  action(message: string, actions: ToastAction[], type: ToastItem['type'] = 'warning', duration = 0): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const wrapped = actions.map((a) => ({
      ...a,
      onClick: () => {
        try { a.onClick(); } finally { this.remove(id); }
      },
    }));
    this.toasts = [...this.toasts, { id, message, type, duration, actions: wrapped }];
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    return id;
  }
}

export const toastStore = new ToastStore();

/** 返回全局唯一的 ToastStore 单例。 */
export function useToast() {
  return toastStore;
}
