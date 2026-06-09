import * as Network from 'expo-network';

let _isConnected = true;
let _subscription: { remove: () => void } | null = null;

type NetworkListener = (isConnected: boolean) => void;
const _listeners = new Set<NetworkListener>();

/**
 * Derive connectivity from a network state.
 *
 * We key off `isConnected` (an interface is up), NOT `isInternetReachable`.
 * On Android `isInternetReachable` is an active reachability probe that
 * frequently reports `false` even on a perfectly good connection (slow/failed
 * probe, certain networks) — and because we use connectivity to GATE remote
 * image loads, a false negative there hid every fact image. `isConnected` is
 * the reliable signal for "we have a network"; treat unknown as online.
 */
function deriveConnected(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  return state.isConnected ?? true;
}

export function startNetworkMonitoring() {
  if (_subscription) return;

  // Get initial state
  Network.getNetworkStateAsync().then((state) => {
    _isConnected = deriveConnected(state);
  });

  // Subscribe to native network state changes (instant detection)
  _subscription = Network.addNetworkStateListener((state) => {
    const connected = deriveConnected(state);
    if (connected !== _isConnected) {
      _isConnected = connected;
      _listeners.forEach((listener) => listener(connected));
    }
  });
}

export function stopNetworkMonitoring() {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
}

export function getIsConnected(): boolean {
  return _isConnected;
}

/**
 * Subscribe to network connectivity changes.
 * Returns an unsubscribe function.
 */
export function onNetworkChange(listener: NetworkListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
