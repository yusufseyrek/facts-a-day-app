/**
 * Lightweight network connectivity check.
 * Uses a HEAD request to a reliable endpoint to determine if the device is online.
 * No external dependencies required.
 */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

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
