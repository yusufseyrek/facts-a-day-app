import { generateScreenName } from '../../utils/screenNameGenerator';

// Mirrors userService.SCREEN_NAME_RE without dragging the whole user service
// (notifications, localization) into a pure-util test.
const SCREEN_NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

describe('generateScreenName', () => {
  it('always produces names the backend accepts', () => {
    for (let i = 0; i < 500; i++) {
      const name = generateScreenName();
      expect(name).toMatch(SCREEN_NAME_RE);
      expect(name.length).toBeLessThanOrEqual(20);
      expect(name.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('varies across draws', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateScreenName()));
    expect(names.size).toBeGreaterThan(10);
  });
});
