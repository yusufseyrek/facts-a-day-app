import {
  AVATAR_CATALOG,
  AVATAR_TOKENS,
  avatarSignatureColor,
  avatarXmlFor,
  identityColor,
} from '../../config/avatars';
import { hexColors } from '../../theme/hexColors';
import { avatarColor } from '../../utils/colors';

// ---------------------------------------------------------------------------
// Catalog invariants — the tokens are stored server-side and rendered verbatim
// in other users' UIs, so the catalog must stay well-formed. The backend keeps
// a MIRROR of this list (facts-a-day-backend src/db/appUsers.ts); these tests
// pin the app-side contract that mirror relies on.
// ---------------------------------------------------------------------------

describe('AVATAR_CATALOG', () => {
  it('uses unique kebab-case tokens', () => {
    for (const token of AVATAR_TOKENS) {
      expect(token).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(AVATAR_TOKENS).size).toBe(AVATAR_TOKENS.length);
  });

  it('is all Open Peeps and fills the rail evenly', () => {
    for (const token of AVATAR_TOKENS) {
      expect(token.startsWith('peep-')).toBe(true);
    }
    // Columns of 3 with no ragged last column keeps the rail a clean grid.
    expect(AVATAR_CATALOG.length % 3).toBe(0);
  });

  it('ships react-native-svg-renderable art for every token', () => {
    // react-native-svg has no <filter>/<foreignObject>/<image>/<style>
    // support, and its Android <mask> pass clips masked art to half the
    // disc; a DiceBear style update that reintroduces one must fail here,
    // not silently render broken discs.
    for (const { token, xml } of AVATAR_CATALOG) {
      expect(xml.startsWith('<svg')).toBe(true);
      expect(avatarXmlFor(token)).toBe(xml);
      for (const bad of ['<filter', '<foreignObject', '<image', '<style', '<script', '<mask']) {
        expect(xml).not.toContain(bad);
      }
    }
    expect(new Set(AVATAR_CATALOG.map((e) => e.xml)).size).toBe(AVATAR_CATALOG.length);
  });

  it('resolves every token to a signature color in both themes', () => {
    for (const { token } of AVATAR_CATALOG) {
      for (const theme of ['light', 'dark'] as const) {
        expect(avatarSignatureColor(token, hexColors[theme])).toMatch(/^#/);
      }
    }
  });
});

describe('identityColor', () => {
  const palette = hexColors.light;

  it('uses the signature color when a catalog token is set', () => {
    expect(identityColor('SomeUser', 'peep-noor', palette)).toBe(
      avatarSignatureColor('peep-noor', palette)
    );
  });

  it('falls back to the name-hash color for legacy emoji and missing avatars', () => {
    const hash = avatarColor('SomeUser', palette);
    expect(identityColor('SomeUser', '🚀', palette)).toBe(hash);
    expect(identityColor('SomeUser', null, palette)).toBe(hash);
    expect(identityColor('SomeUser', undefined, palette)).toBe(hash);
  });
});
