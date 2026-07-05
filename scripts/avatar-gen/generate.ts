/**
 * Generates src/config/avatarArt.ts — the vendored DiceBear avatar catalog.
 *
 * Standalone on purpose: DiceBear is a DEV-TIME dependency only (the app
 * ships pre-rendered SVG strings, no runtime generation), so its packages
 * live in this folder's own package.json instead of the app tree.
 *
 *   cd scripts/avatar-gen && bun install && bun run generate.ts
 *
 * 42 hand-curated Open Peeps (https://openpeeps.com, Pablo Stanley, CC0 1.0),
 * tuned for the app's mostly North-America/Europe audience. Options are
 * FORCED per avatar (not seed-random) so every variant is visibly distinct.
 *
 * The catalog is SYMMETRIC by construction — the QA gates below enforce it:
 *   - 7 hue groups of 6 (2 rail columns × 3 rows each), one per neon hue in
 *     the picker's rainbow sweep (config/avatars HUE_SWEEP), left→right.
 *   - Every group has the same skin mix: 2 light + 2 light-tan + 1 tan +
 *     1 deep (deep alternates the two darkest tones group by group).
 *   - Every group is 3 feminine + 3 masculine silhouettes.
 *   - Every group has exactly one glasses/sunglasses wearer and exactly one
 *     facial-hair wearer, and 6 distinct faces (friendly set only).
 *   - Every group wears the 6 clothing colors that are NOT its own disc hue,
 *     one each — clothes always contrast with the gradient disc behind them,
 *     and each clothing color appears exactly 6 times catalog-wide.
 *   - All 42 head silhouettes are distinct.
 *
 * The token is the stored wire value (mirrored in the backend allowlist —
 * src/db/appUsers.ts AVATAR_TOKENS); keep additions backward-safe and never
 * rename/remove a shipped token (existing rows keep the value).
 *
 * RN constraint: react-native-svg renders these via SvgXml and does NOT
 * support <filter>/<foreignObject>/<image>/<style>; the QA step below fails
 * the build if a style update ever introduces one.
 */
import { openPeeps } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Entry = { token: string; family: string; xml: string };

/** Light → deep; indices are what PEEPS entries reference. */
const SKIN = ['ffdbb4', 'edb98a', 'd08b5b', 'ae5d29', '694d3d'];
/** Pastel rainbow, hue-aligned 1:1 with the picker's HUE_SWEEP (red, orange,
 * yellow, green, cyan, purple, magenta) — the QA gate leans on this alignment
 * to forbid clothes that melt into their own disc hue. */
const CLOTHES = ['e78276', 'ffcf77', 'fdea6b', '78e185', '9ddadb', '8fa7df', 'e279a9'];

const GROUP_SIZE = 6; // 2 rail columns × 3 rows share one hue
const HUES = 7;

/** One entry per avatar, in DISPLAY ORDER (rail left→right, columns of 3):
 * entries 0–5 are the red group, 6–11 orange, … 36–41 magenta. */
const PEEPS: {
  name: string;
  head: string;
  face: string;
  /** 'f' | 'm' — how the silhouette reads, for the per-group balance gate. */
  reads: 'f' | 'm';
  skin: number;
  clothes: number;
  accessory?: string;
  facialHair?: string;
}[] = [
  // — red —
  { name: 'finn', head: 'short2', face: 'smileBig', reads: 'm', skin: 0, clothes: 4, accessory: 'glasses4' },
  { name: 'ivy', head: 'longBangs', face: 'smile', reads: 'f', skin: 0, clothes: 3 },
  { name: 'luca', head: 'short3', face: 'cheeky', reads: 'm', skin: 1, clothes: 2, facialHair: 'goatee1' },
  { name: 'mila', head: 'mediumStraight', face: 'cute', reads: 'f', skin: 1, clothes: 5 },
  { name: 'theo', head: 'bear', face: 'smileTeethGap', reads: 'm', skin: 2, clothes: 6 },
  { name: 'amara', head: 'twists', face: 'lovingGrin1', reads: 'f', skin: 3, clothes: 1 },
  // — orange —
  { name: 'ruby', head: 'mediumBangs', face: 'smileLOL', reads: 'f', skin: 0, clothes: 4 },
  { name: 'otis', head: 'pomp', face: 'awe', reads: 'm', skin: 0, clothes: 3, accessory: 'sunglasses' },
  { name: 'juno', head: 'bun', face: 'calm', reads: 'f', skin: 1, clothes: 6 },
  { name: 'ezra', head: 'short5', face: 'smile', reads: 'm', skin: 1, clothes: 5, facialHair: 'chin' },
  { name: 'lena', head: 'medium1', face: 'eatingHappy', reads: 'f', skin: 2, clothes: 0 },
  { name: 'kofi', head: 'dreads2', face: 'smileBig', reads: 'm', skin: 4, clothes: 2 },
  // — yellow —
  { name: 'wren', head: 'bangs', face: 'calm', reads: 'f', skin: 0, clothes: 5, accessory: 'glasses2' },
  { name: 'milo', head: 'short4', face: 'smileTeethGap', reads: 'm', skin: 0, clothes: 3 },
  { name: 'pearl', head: 'grayBun', face: 'smile', reads: 'f', skin: 1, clothes: 6 },
  { name: 'gus', head: 'grayShort', face: 'smileLOL', reads: 'm', skin: 1, clothes: 4, facialHair: 'moustache1' },
  { name: 'rosa', head: 'medium2', face: 'smileBig', reads: 'f', skin: 2, clothes: 0 },
  { name: 'remy', head: 'dreads1', face: 'cheeky', reads: 'm', skin: 3, clothes: 1 },
  // — green —
  { name: 'isla', head: 'long', face: 'cute', reads: 'f', skin: 0, clothes: 6 },
  { name: 'kai', head: 'hatBeanie', face: 'smileLOL', reads: 'm', skin: 0, clothes: 4 },
  { name: 'noor', head: 'hijab', face: 'calm', reads: 'f', skin: 1, clothes: 5 },
  { name: 'nico', head: 'short1', face: 'smile', reads: 'm', skin: 1, clothes: 2, accessory: 'glasses3' },
  { name: 'omar', head: 'shaved2', face: 'driven', reads: 'm', skin: 2, clothes: 0, facialHair: 'full2' },
  { name: 'zola', head: 'longAfro', face: 'smileBig', reads: 'f', skin: 4, clothes: 1 },
  // — cyan —
  { name: 'faye', head: 'mediumBangs3', face: 'awe', reads: 'f', skin: 0, clothes: 5 },
  { name: 'hugo', head: 'noHair1', face: 'cheeky', reads: 'm', skin: 0, clothes: 3, facialHair: 'full4' },
  { name: 'mona', head: 'medium3', face: 'cute', reads: 'f', skin: 1, clothes: 6 },
  { name: 'rex', head: 'mohawk', face: 'smileLOL', reads: 'm', skin: 1, clothes: 0, accessory: 'sunglasses2' },
  { name: 'tess', head: 'bun2', face: 'smileBig', reads: 'f', skin: 2, clothes: 1 },
  { name: 'sol', head: 'afro', face: 'smile', reads: 'm', skin: 3, clothes: 2 },
  // — purple —
  { name: 'nell', head: 'mediumBangs2', face: 'smile', reads: 'f', skin: 0, clothes: 4, accessory: 'glasses5' },
  { name: 'saul', head: 'noHair3', face: 'smileBig', reads: 'm', skin: 0, clothes: 2, facialHair: 'full3' },
  { name: 'vera', head: 'grayMedium', face: 'calm', reads: 'f', skin: 1, clothes: 6 },
  { name: 'cole', head: 'shaved3', face: 'smileTeethGap', reads: 'm', skin: 1, clothes: 3 },
  { name: 'romy', head: 'hatHip', face: 'lovingGrin2', reads: 'f', skin: 2, clothes: 0 },
  { name: 'kito', head: 'flatTopLong', face: 'awe', reads: 'm', skin: 4, clothes: 1 },
  // — magenta —
  { name: 'lulu', head: 'bangs2', face: 'smileLOL', reads: 'f', skin: 0, clothes: 4 },
  { name: 'eli', head: 'shaved1', face: 'smile', reads: 'm', skin: 0, clothes: 3, accessory: 'glasses' },
  { name: 'cleo', head: 'buns', face: 'cute', reads: 'f', skin: 1, clothes: 5 },
  { name: 'otto', head: 'noHair2', face: 'cheeky', reads: 'm', skin: 1, clothes: 2, facialHair: 'goatee2' },
  { name: 'dre', head: 'flatTop', face: 'driven', reads: 'm', skin: 2, clothes: 1 },
  { name: 'maya', head: 'longCurly', face: 'smileBig', reads: 'f', skin: 3, clothes: 0 },
];

/** Strip license metadata + comments and collapse inter-tag whitespace.
 * Also removes DiceBear's viewboxMask wrapper: it's a full-canvas white rect
 * (a visual no-op — the root svg viewport already clips overflowing art),
 * but react-native-svg's Android mask pass renders masked content through an
 * offscreen bitmap that clips the avatars to half. */
function clean(svg: string): string {
  return svg
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<mask id="viewboxMask">.*?<\/mask>/g, '')
    .replace(/ mask="url\(#viewboxMask\)"/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

const entries: Entry[] = [];

for (const p of PEEPS) {
  const xml = createAvatar(openPeeps, {
    seed: p.name,
    head: [p.head as never],
    face: [p.face as never],
    skinColor: [SKIN[p.skin]],
    clothingColor: [CLOTHES[p.clothes]],
    accessories: p.accessory ? [p.accessory as never] : [],
    accessoriesProbability: p.accessory ? 100 : 0,
    facialHair: p.facialHair ? [p.facialHair as never] : [],
    facialHairProbability: p.facialHair ? 100 : 0,
    maskProbability: 0,
  }).toString();
  entries.push({ token: `peep-${p.name}`, family: 'open-peeps', xml: clean(xml) });
}

// --- QA gates ---
// <mask> is banned alongside the outright-unsupported features: Android's
// react-native-svg mask implementation clips masked art to half the disc.
const BAD = ['<filter', '<foreignObject', '<image', '<style', '<script', '<mask'];
if (PEEPS.length !== GROUP_SIZE * HUES)
  throw new Error(`catalog must be ${GROUP_SIZE * HUES} avatars (7 even hue groups)`);
if (new Set(entries.map((e) => e.xml)).size !== entries.length)
  throw new Error('duplicate avatar output');
if (new Set(PEEPS.map((p) => p.head)).size !== PEEPS.length)
  throw new Error('duplicate head silhouette');
for (const e of entries) {
  if (!e.xml.startsWith('<svg')) throw new Error(`${e.token}: unexpected output`);
  const flags = BAD.filter((b) => e.xml.includes(b));
  if (flags.length) throw new Error(`${e.token}: RN-unsupported SVG feature ${flags.join(',')}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.token))
    throw new Error(`${e.token}: token must be kebab-case`);
}

// Per-hue-group symmetry: identical demographic + styling structure in every
// group, so the rail reads balanced no matter where the user is scrolled to.
for (let g = 0; g < HUES; g++) {
  const group = PEEPS.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE);
  const tag = `hue group ${g}`;

  const skins = group.map((p) => p.skin).sort((a, b) => a - b);
  const [deep] = skins.slice(-1);
  if (skins.slice(0, 5).join() !== '0,0,1,1,2' || (deep !== 3 && deep !== 4))
    throw new Error(`${tag}: skin mix must be 2 light + 2 light-tan + 1 tan + 1 deep`);

  if (group.filter((p) => p.reads === 'f').length !== GROUP_SIZE / 2)
    throw new Error(`${tag}: must read 3 feminine + 3 masculine`);

  const clothes = new Set(group.map((p) => p.clothes));
  if (clothes.size !== GROUP_SIZE || clothes.has(g))
    throw new Error(`${tag}: clothes must be the 6 colors that aren't the group's own hue`);

  if (new Set(group.map((p) => p.face)).size !== GROUP_SIZE)
    throw new Error(`${tag}: faces must all differ`);

  if (group.filter((p) => p.accessory).length !== 1)
    throw new Error(`${tag}: exactly one glasses/sunglasses wearer`);
  if (group.filter((p) => p.facialHair).length !== 1)
    throw new Error(`${tag}: exactly one facial-hair wearer`);
}

const body = entries
  .map((e) => `  { token: '${e.token}', family: '${e.family}', xml: ${JSON.stringify(e.xml)} },`)
  .join('\n');

const out = `// AUTO-GENERATED by scripts/avatar-gen/generate.ts — do not edit by hand.
// Curated DiceBear (https://dicebear.com) avatar catalog: 42 Open Peeps
// (openpeeps.com, Pablo Stanley, CC0 1.0), pre-rendered to plain SVG strings
// (no runtime DiceBear dep). Catalog order is the picker rail's display order
// (7 even hue groups of 6, red → magenta). Tokens are the stored wire values —
// mirrored in the backend allowlist (src/db/appUsers.ts); never rename or
// remove a shipped token. To regenerate:
//   cd scripts/avatar-gen && bun install && bun run generate.ts

export const AVATAR_ART = [
${body}
] as const;
`;

const target = fileURLToPath(new URL('../../src/config/avatarArt.ts', import.meta.url));
writeFileSync(target, out);
const kb = Math.round(out.length / 1024);
console.log(`wrote ${target} (${entries.length} avatars, ${kb}KB)`);
