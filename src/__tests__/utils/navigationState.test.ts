import { isFocusedScreenPushed, type NavigationStateLike } from '../../utils/navigationState';

// Realistic state shapes for this app's navigator tree: an (internal) root
// wrapper → root stack → '(tabs)' tab navigator → one stack per tab.

const tabRoot = (tabStack: NavigationStateLike): NavigationStateLike => ({
  // expo-router's internal slot navigator wrapping the app's root stack.
  type: 'stack',
  index: 0,
  routes: [
    {
      state: {
        type: 'stack',
        index: 0,
        routes: [{ state: { type: 'tab', index: 1, routes: [{}, { state: tabStack }] } }],
      },
    },
  ],
});

describe('isFocusedScreenPushed', () => {
  it('is false on a tab root (single-route tab stack)', () => {
    expect(
      isFocusedScreenPushed(tabRoot({ type: 'stack', index: 0, routes: [{}] }))
    ).toBe(false);
  });

  it('is true on a pushed second-level tab screen (e.g. trivia/profile)', () => {
    expect(
      isFocusedScreenPushed(tabRoot({ type: 'stack', index: 1, routes: [{}, {}] }))
    ).toBe(true);
  });

  it('is true on a root-stack push (e.g. /stats over the tabs)', () => {
    expect(
      isFocusedScreenPushed({
        type: 'stack',
        index: 0,
        routes: [{ state: { type: 'stack', index: 1, routes: [{}, {}] } }],
      })
    ).toBe(true);
  });

  it('treats the last route as focused when a partial state omits index', () => {
    expect(isFocusedScreenPushed({ type: 'stack', routes: [{}, {}] })).toBe(true);
  });

  it('ignores non-stack navigators sitting above the first route (tab index > 0)', () => {
    expect(
      isFocusedScreenPushed({ type: 'tab', index: 2, routes: [{}, {}, {}] })
    ).toBe(false);
  });

  it('is false for undefined / empty states (container not ready)', () => {
    expect(isFocusedScreenPushed(undefined)).toBe(false);
    expect(isFocusedScreenPushed({ type: 'stack', index: 0, routes: [] })).toBe(false);
  });
});
