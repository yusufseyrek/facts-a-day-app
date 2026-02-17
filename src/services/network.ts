let _isConnected = true;
let _intervalId: ReturnType<typeof setInterval> | null = null;

async function probe(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function startNetworkMonitoring() {
  if (_intervalId) return;

  probe().then((online) => {
    _isConnected = online;
  });

  _intervalId = setInterval(async () => {
    _isConnected = await probe();
  }, 10000);
}

export function stopNetworkMonitoring() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

export function getIsConnected(): boolean {
  return _isConnected;
}
