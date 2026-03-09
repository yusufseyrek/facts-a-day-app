import * as Network from 'expo-network';

let _isConnected = true;
let _subscription: { remove: () => void } | null = null;

type NetworkListener = (isConnected: boolean) => void;
const _listeners = new Set<NetworkListener>();

export function startNetworkMonitoring() {
  if (_subscription) return;

  // Get initial state
  Network.getNetworkStateAsync().then((state) => {
    _isConnected = state.isInternetReachable ?? state.isConnected ?? true;
  });

  // Subscribe to native network state changes (instant detection)
  _subscription = Network.addNetworkStateListener((state) => {
    const connected = state.isInternetReachable ?? state.isConnected ?? true;
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
