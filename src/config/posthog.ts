import PostHog from 'posthog-react-native';

export const posthog = new PostHog('phc_tyEgTJkA94jLNlvCnUq5yKbT5krRiyyEiP9d81NQz9d', {
  host: 'https://eu.i.posthog.com',
  disabled: __DEV__, // Disable PostHog for now, can be enabled later for analytics
  // Don't autocapture the SDK's app-lifecycle events ("Application Opened" /
  // "Application Became Active" / "Application Backgrounded"). They fire on
  // every AppState change (and full-screen ads cause extra ad-induced
  // transitions), which floods PostHog with low-signal events. GA4/Firebase
  // already auto-collects app_open/session_start independently. Must be set on
  // the constructor — PostHogProvider ignores it when given a prebuilt client.
  captureAppLifecycleEvents: false,
  // Create a person profile for EVERY install, not just identified ones. This
  // app is anonymous-first (only a minority ever claim a screen name), so the
  // default 'identified_only' would leave almost all users without person
  // properties — making it impossible to slice behavior by theme/categories/
  // premium/etc. When a screen name IS claimed, identify() merges the
  // anonymous person into one keyed by the backend user_id (see
  // services/analytics.ts → identifyUser).
  personProfiles: 'always',
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
