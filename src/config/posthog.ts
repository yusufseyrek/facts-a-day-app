import PostHog from 'posthog-react-native';

export const posthog = new PostHog('phc_tyEgTJkA94jLNlvCnUq5yKbT5krRiyyEiP9d81NQz9d', {
  host: 'https://eu.i.posthog.com',
  disabled: __DEV__,
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: false,
    maskAllImages: false,
    maskAllSandboxedViews: false,
    throttleDelayMs: 2500,
    captureNetworkTelemetry: false,
    captureLog: false,
  },
  errorTracking: {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      console: ['log', 'warn', 'error'],
    },
  },
});
