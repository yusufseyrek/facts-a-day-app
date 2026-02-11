const mockAppCheck = {};

export const getToken = jest.fn(
  (_instance: any, _forceRefresh?: boolean) =>
    Promise.resolve({ token: 'mock-app-check-token' })
);

export default function getAppCheck(_app?: any) {
  return mockAppCheck;
}
