import PostHog from 'posthog-react-native';

export const posthog = new PostHog('phc_tyEgTJkA94jLNlvCnUq5yKbT5krRiyyEiP9d81NQz9d', {
  host: 'https://eu.i.posthog.com',
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: false,
    maskAllImages: false,
  },
  errorTracking: {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      console: ['log', 'warn', 'error'],
    },
  },
});
