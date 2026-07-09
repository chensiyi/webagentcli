/**
 * kernel-ready.ts — Shell 侧「内核就绪」门控（最小实现）
 *
 * 内核 boot 完成会抛 kernel:bootComplete；这里订阅并 await 它，时序就对齐了。
 * 不引入任何框架：没有 Set、没有 ready 标志、没有模块级状态。
 */
import { KernelEvents } from 'kernel/Events.js';

/**
 * 等待内核启动完成（或启动失败）后 resolve。
 * - 订阅 bootComplete / bootError；二者任一到达即结束等待。
 * - 订阅后发一次 ping：内核可能在我们挂载前就已就绪并广播过 bootComplete，
 *   ping 触发 transport 的 ensureBoot，已就绪则重新广播一次，避免永久挂起。
 */
export function waitKernelReady(ipc: any): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      unsubBoot();
      unsubErr();
      resolve();
    };
    const unsubBoot = ipc.on(KernelEvents.KERNEL.BOOT_COMPLETE, done);
    const unsubErr = ipc.on(KernelEvents.KERNEL.BOOT_ERROR, done);
    ipc.emit(KernelEvents.KERNEL.PING, {});
  });
}
