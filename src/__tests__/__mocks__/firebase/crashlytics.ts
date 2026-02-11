const mockCrashlytics = {
  log: jest.fn(),
  recordError: jest.fn(),
  setAttributes: jest.fn(),
  setAttribute: jest.fn(),
  setUserId: jest.fn(),
  crash: jest.fn(),
};

export default function crashlytics() {
  return mockCrashlytics;
}
