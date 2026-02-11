import * as fs from 'fs';
import * as path from 'path';

const appJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../app.json'), 'utf-8')
);
const expo = appJson.expo;

// ---------------------------------------------------------------------------
// URL Scheme
// ---------------------------------------------------------------------------
describe('URL scheme', () => {
  it('expo.scheme equals "factsaday"', () => {
    expect(expo.scheme).toBe('factsaday');
  });
});

// ---------------------------------------------------------------------------
// iOS Associated Domains
// ---------------------------------------------------------------------------
describe('iOS Associated Domains', () => {
  it('contains applinks:factsaday.com', () => {
    expect(expo.ios.associatedDomains).toContain('applinks:factsaday.com');
  });
});

// ---------------------------------------------------------------------------
// Android Intent Filters
// ---------------------------------------------------------------------------
describe('Android Intent Filters', () => {
  const intentFilter = expo.android.intentFilters[0];

  it('has action VIEW with autoVerify', () => {
    expect(intentFilter.action).toBe('VIEW');
    expect(intentFilter.autoVerify).toBe(true);
  });

  it('data scheme is https and host is factsaday.com', () => {
    const data = intentFilter.data[0];
    expect(data.scheme).toBe('https');
    expect(data.host).toBe('factsaday.com');
  });

  it('pathPattern matches expected deep link paths', () => {
    expect(intentFilter.data[0].pathPattern).toBe('/.*/fact/.*');
  });

  it('categories include BROWSABLE and DEFAULT', () => {
    expect(intentFilter.category).toContain('BROWSABLE');
    expect(intentFilter.category).toContain('DEFAULT');
  });
});

// ---------------------------------------------------------------------------
// Pattern matching sanity checks
// ---------------------------------------------------------------------------
describe('pathPattern sanity checks', () => {
  const pattern = expo.android.intentFilters[0].data[0].pathPattern;
  // Convert Android pathPattern (where .* means regex .*) to a JS regex
  const regex = new RegExp('^' + pattern + '$');

  it('matches /en/fact/123', () => {
    expect(regex.test('/en/fact/123')).toBe(true);
  });

  it('matches /tr/fact/456/some-slug', () => {
    expect(regex.test('/tr/fact/456/some-slug')).toBe(true);
  });

  it('does NOT match /settings', () => {
    expect(regex.test('/settings')).toBe(false);
  });

  it('does NOT match /en/story/science', () => {
    expect(regex.test('/en/story/science')).toBe(false);
  });
});
