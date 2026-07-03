/**
 * Toast 通知 store
 * 简单的全局提示队列。
 */

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
}

let toasts = $state<ToastItem[]>([]);

export function useToast() {
  function add(message: string, type: ToastItem['type'] = 'info', duration = 3000) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: ToastItem = { id, message, type, duration };
    toasts = [...toasts, toast];

    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }

    return id;
  }

  function remove(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function success(message: string, duration?: number) {
    return add(message, 'success', duration);
  }

  function error(message: string, duration?: number) {
    return add(message, 'error', duration);
  }

  function warning(message: string, duration?: number) {
    return add(message, 'warning', duration);
  }

  function info(message: string, duration?: number) {
    return add(message, 'info', duration);
  }

  return {
    get toasts() {
      return toasts;
    },
    add,
    remove,
    success,
    error,
    warning,
    info,
  };
}
