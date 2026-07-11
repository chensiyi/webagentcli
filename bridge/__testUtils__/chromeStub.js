/**
 * 测试用 chrome.runtime 内存桩：模拟 Port 长连接（无真实扩展环境）。
 *
 * - shell 调 chrome.runtime.connect({ name }) 拿到 shellPort（同步返回）。
 * - 内核注册的 chrome.runtime.onConnect 监听会异步收到与之配对的 kernelPort。
 * - 两个端口配对：一端 postMessage 会送达对端的 onMessage（异步，模拟真实端口时序）。
 * - 提供 chrome.runtime.lastError（内核 onDisconnect 处理会读取）。
 *
 * 使用：在测试 beforeEach 中调用 installChromeStub() 即可。
 */

function createListenerBag() {
  const listeners = [];
  return {
    addListener(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    removeListener(fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    _fire(...args) {
      // 复制一份，避免监听器内 removeListener 影响当前遍历
      for (const fn of listeners.slice()) {
        try {
          fn(...args);
        } catch (e) {
          console.error('[chromeStub] listener error', e);
        }
      }
    },
  };
}

function createPort(name) {
  const port = {
    name,
    onMessage: createListenerBag(),
    onDisconnect: createListenerBag(),
    __peer: null,
    postMessage(msg) {
      const peer = port.__peer;
      if (!peer) return;
      setTimeout(() => peer.onMessage._fire(msg), 0);
    },
    disconnect() {
      const peer = port.__peer;
      if (!peer) return;
      setTimeout(() => peer.onDisconnect._fire(), 0);
    },
  };
  return port;
}

export function installChromeStub() {
  const onConnect = createListenerBag();

  globalThis.chrome = {
    runtime: {
      lastError: null,
      onConnect,
      connect(opts) {
        const name = (opts && opts.name) || 'port';
        const kernelPort = createPort(name);
        const shellPort = createPort(name);
        kernelPort.__peer = shellPort;
        shellPort.__peer = kernelPort;
        // 内核收到连接（异步，模拟真实扩展 onConnect 时序，确保 shell 先 attach 再收包）
        setTimeout(() => onConnect._fire(kernelPort), 0);
        return shellPort;
      },
    },
  };

  return {
    uninstall() {
      // @ts-ignore
      delete globalThis.chrome;
    },
  };
}
