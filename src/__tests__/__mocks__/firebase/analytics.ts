const mockAnalytics = {
  logEvent: jest.fn(),
  setUserProperties: jest.fn(),
  setUserId: jest.fn(),
  setCurrentScreen: jest.fn(),
};

export default function analytics() {
  return mockAnalytics;
}
