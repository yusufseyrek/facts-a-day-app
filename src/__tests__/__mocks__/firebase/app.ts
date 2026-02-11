const mockApp = {
  name: '[DEFAULT]',
  options: {
    appId: 'mock-app-id',
    projectId: 'mock-project',
  },
};

export function getApp() {
  return mockApp;
}

export default function firebase() {
  return mockApp;
}
